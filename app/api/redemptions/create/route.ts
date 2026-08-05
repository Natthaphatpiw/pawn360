import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  calculatePenaltyMonths,
  ensurePenaltyPaymentRecord,
  getPenaltyRequirement,
  roundCurrency,
} from '@/lib/services/penalty';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import { acquireTransactionLock, transactionLockErrorResponse } from '@/lib/security/transaction-lock';
import {
  boundedText,
  readBoundedJsonObject,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const ACTIVE_REDEMPTION_STATUSES = [
  'PENDING',
  'SLIP_UPLOADED',
  'AMOUNT_VERIFIED',
  'AMOUNT_MISMATCH',
  'PREPARING_ITEM',
  'IN_TRANSIT',
  'DELIVERED',
  'PAWNER_CONFIRMED',
  'INVESTOR_CONFIRMED',
];

const PRE_CENTRAL_METHODS = new Set(['DROPPOINT_SELF_PICKUP', 'DROPPOINT_SELF_RIDER']);
const CENTRAL_METHODS = new Set([
  'CENTRAL_SCHEDULE_7D',
  'CENTRAL_SELF_PICKUP_TODAY',
  'DROPPOINT_NEXT_DAY_PICKUP',
]);

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request) as any;
    const {
      contractId,
      requestType,
      deliveryMethod,
      deliveryAddress,
      pawnerLineId,
    } = body;

    const safeContractId = requireUuid(contractId);
    const safeRequestType = boundedText(requestType, 50, true) || '';
    const safeDeliveryMethod = boundedText(deliveryMethod, 50, true) || '';
    const claimedLineId = boundedText(pawnerLineId, 128, true) || '';
    const verifiedLineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);
    if (safeRequestType !== 'FULL_REDEMPTION') {
      return NextResponse.json(
        { error: 'ประเภทรายการไถ่ถอนไม่ถูกต้อง' },
        { status: 400 },
      );
    }
    releaseLock = await acquireTransactionLock('redemption-create', safeContractId, 90);

    const supabase = supabaseAdmin();

    // Verify contract exists and belongs to pawner
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_status,
        contract_start_date,
        contract_end_date,
        contract_duration_days,
        customer_id,
        investor_id,
        loan_principal_amount,
        current_principal_amount,
        original_principal_amount,
        principal_paid,
        interest_rate,
        interest_paid,
        platform_fee_rate,
        pawners:customer_id (line_id)
      `)
      .eq('contract_id', safeContractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Check if pawner LINE ID matches
    const pawner = Array.isArray(contract.pawners) ? contract.pawners[0] : contract.pawners;
    if (!pawner?.line_id || pawner.line_id !== verifiedLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Check if contract is in valid status for redemption
    if (!['ACTIVE', 'CONFIRMED'].includes(contract.contract_status)) {
      return NextResponse.json(
        { error: 'Contract is not in active status' },
        { status: 400 }
      );
    }

    const penaltyRequirement = await getPenaltyRequirement(supabase, contract);
    const penaltyAmount = Number(penaltyRequirement.penaltyDue || 0);
    const overdueInterestAmount = Number(penaltyRequirement.overdueInterestDue || 0);
    if (
      !Number.isFinite(penaltyAmount)
      || penaltyAmount < 0
      || !Number.isFinite(overdueInterestAmount)
      || overdueInterestAmount < 0
    ) {
      return NextResponse.json(
        { error: 'ไม่สามารถคำนวณยอดค้างชำระได้ กรุณาติดต่อฝ่ายสนับสนุน' },
        { status: 409 },
      );
    }
    if (penaltyRequirement.required) {
      await ensurePenaltyPaymentRecord(supabase, contract, penaltyRequirement);
    }

    // Check for existing pending redemption
    const { data: existingRedemptions, error: existingRedemptionsError } = await supabase
      .from('redemption_requests')
      .select('redemption_id, request_status, created_at')
      .eq('contract_id', safeContractId)
      .in('request_status', ACTIVE_REDEMPTION_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingRedemptionsError) {
      return sanitizedServerError('ไม่สามารถตรวจสอบคำขอไถ่ถอนเดิมได้ กรุณาลองใหม่');
    }

    const existingRedemption = existingRedemptions?.[0];
    if (existingRedemption) {
      return NextResponse.json({
        success: true,
        resumed: true,
        redemptionId: existingRedemption.redemption_id,
        requestStatus: existingRedemption.request_status,
        message: 'มีคำขอไถ่ถอนเดิมอยู่แล้ว ระบบจะพาไปดำเนินการต่อ',
      });
    }

    // Build delivery address string
    let deliveryAddressFull: string | null = null;
    const safeDeliveryAddress = deliveryAddress && typeof deliveryAddress === 'object' && !Array.isArray(deliveryAddress)
      ? deliveryAddress
      : null;
    if (safeDeliveryAddress) {
      const parts = [
        boundedText(safeDeliveryAddress.houseNo, 100),
        boundedText(safeDeliveryAddress.village, 100),
        boundedText(safeDeliveryAddress.street, 180),
        boundedText(safeDeliveryAddress.subDistrict, 100),
        boundedText(safeDeliveryAddress.district, 100),
        boundedText(safeDeliveryAddress.province, 100),
        boundedText(safeDeliveryAddress.postcode, 10),
      ].filter((value): value is string => Boolean(value));
      deliveryAddressFull = parts.join(' ');
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const startDate = new Date(contract.contract_start_date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(contract.contract_end_date);
    endDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
      return NextResponse.json(
        { error: 'ข้อมูลวันที่สัญญาไม่สมบูรณ์ กรุณาติดต่อฝ่ายสนับสนุน' },
        { status: 409 },
      );
    }

    const rawDurationDays = Number(contract.contract_duration_days || 0)
      || Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay);
    const daysInContract = Math.max(1, rawDurationDays);
    const rawDaysElapsed = Math.floor((today.getTime() - startDate.getTime()) / msPerDay) + 1;
    const daysElapsed = Math.min(daysInContract, Math.max(1, rawDaysElapsed));

    const centralStage = rawDaysElapsed > 15;
    const allowedMethods = centralStage ? CENTRAL_METHODS : PRE_CENTRAL_METHODS;
    if (!allowedMethods.has(safeDeliveryMethod)) {
      return NextResponse.json(
        { error: 'วิธีรับสินค้าคืนไม่สอดคล้องกับสถานะสัญญา' },
        { status: 409 },
      );
    }

    const rawRate = Number(contract.interest_rate || 0);
    const monthlyInterestRate = rawRate > 1 ? rawRate / 100 : rawRate;
    const feeRate = Number(contract.platform_fee_rate ?? 0.015);
    const dailyInterestRate = monthlyInterestRate / 30;

    const currentPrincipal = Number(contract.current_principal_amount ?? contract.loan_principal_amount);
    const feeBase = Number(contract.original_principal_amount ?? contract.loan_principal_amount ?? currentPrincipal);
    const interestPaid = Number(contract.interest_paid || 0);
    const principalPaid = Number(contract.principal_paid || 0);
    if (
      !Number.isFinite(currentPrincipal)
      || currentPrincipal <= 0
      || !Number.isFinite(feeBase)
      || feeBase <= 0
      || !Number.isFinite(rawRate)
      || rawRate < 0
      || rawRate > 100
      || !Number.isFinite(feeRate)
      || feeRate < 0
      || feeRate > 1
      || !Number.isFinite(interestPaid)
      || interestPaid < 0
      || !Number.isFinite(principalPaid)
      || principalPaid < 0
    ) {
      return NextResponse.json(
        { error: 'ข้อมูลยอดเงินในสัญญาไม่สมบูรณ์ กรุณาติดต่อฝ่ายสนับสนุน' },
        { status: 409 },
      );
    }
    const feeAmount = roundCurrency(feeBase * feeRate * (daysInContract / 30));
    const interestAccrued = roundCurrency(currentPrincipal * dailyInterestRate * daysElapsed);
    const interestDue = roundCurrency(Math.max(0, interestAccrued + feeAmount - interestPaid));

    const basePrincipal = roundCurrency(Math.max(0, currentPrincipal - principalPaid));
    const deliveryFeeAmount = safeDeliveryMethod === 'DROPPOINT_NEXT_DAY_PICKUP' ? 100 : 0;
    const totalAmount = roundCurrency(
      basePrincipal + interestDue + deliveryFeeAmount + penaltyAmount + overdueInterestAmount,
    );

    // Create redemption request
    const { data: redemption, error: redemptionError } = await supabase
      .from('redemption_requests')
      .insert({
        contract_id: safeContractId,
        request_type: safeRequestType,
        principal_amount: basePrincipal,
        interest_amount: interestDue,
        delivery_fee: deliveryFeeAmount,
        total_amount: totalAmount,
        // Freeze the quote. Late charges step monthly, so recomputing them at
        // display time would change the amount the pawner was asked to pay.
        base_amount: roundCurrency(basePrincipal + interestDue + deliveryFeeAmount),
        penalty_amount: penaltyAmount,
        overdue_interest_amount: overdueInterestAmount,
        // How overdue the contract actually is, recorded whether or not the flat
        // penalty was already settled. Writing 0 here once a penalty slip was
        // paid made the row claim the contract was on time while it was still
        // being charged overdue interest.
        penalty_days_overdue: penaltyRequirement.daysOverdue,
        penalty_months: calculatePenaltyMonths(penaltyRequirement.daysOverdue),
        delivery_method: safeDeliveryMethod,
        delivery_address_full: deliveryAddressFull,
        delivery_addr_house_no: safeDeliveryAddress ? boundedText(safeDeliveryAddress.houseNo, 100) : null,
        delivery_addr_village: safeDeliveryAddress ? boundedText(safeDeliveryAddress.village, 100) : null,
        delivery_addr_street: safeDeliveryAddress ? boundedText(safeDeliveryAddress.street, 180) : null,
        delivery_addr_sub_district: safeDeliveryAddress ? boundedText(safeDeliveryAddress.subDistrict, 100) : null,
        delivery_addr_district: safeDeliveryAddress ? boundedText(safeDeliveryAddress.district, 100) : null,
        delivery_addr_province: safeDeliveryAddress ? boundedText(safeDeliveryAddress.province, 100) : null,
        delivery_addr_postcode: safeDeliveryAddress ? boundedText(safeDeliveryAddress.postcode, 10) : null,
        delivery_contact_phone: safeDeliveryAddress ? boundedText(safeDeliveryAddress.contactPhone, 20) : null,
        delivery_notes: safeDeliveryAddress ? boundedText(safeDeliveryAddress.notes, 500) : null,
        request_status: 'PENDING',
      })
      .select('redemption_id')
      .single();

    if (redemptionError) {
      if (redemptionError.code === '23505') {
        const { data: racedRedemption } = await supabase
          .from('redemption_requests')
          .select('redemption_id, request_status')
          .eq('contract_id', safeContractId)
          .in('request_status', ACTIVE_REDEMPTION_STATUSES)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (racedRedemption) {
          return NextResponse.json({
            success: true,
            resumed: true,
            redemptionId: racedRedemption.redemption_id,
            requestStatus: racedRedemption.request_status,
          });
        }
      }
      console.error('Error creating redemption');
      return sanitizedServerError('ไม่สามารถสร้างคำขอไถ่ถอนได้ กรุณาลองใหม่');
    }

    // Update contract redemption status
    const { data: contractUpdated, error: contractUpdateError } = await supabase
      .from('contracts')
      .update({
        redemption_status: 'PENDING',
        updated_at: new Date().toISOString(),
      })
      .eq('contract_id', safeContractId)
      .in('contract_status', ['ACTIVE', 'CONFIRMED'])
      .select('contract_id')
      .maybeSingle();

    if (contractUpdateError || !contractUpdated) {
      await supabase
        .from('redemption_requests')
        .update({ request_status: 'CANCELLED', updated_at: new Date().toISOString() })
        .eq('redemption_id', redemption.redemption_id)
        .eq('request_status', 'PENDING');
      return sanitizedServerError('ไม่สามารถบันทึกสถานะสัญญาได้ กรุณาลองใหม่');
    }

    return NextResponse.json({
      success: true,
      redemptionId: redemption.redemption_id,
      penaltyRequired: penaltyRequirement.required,
      penaltyAmount,
      overdueInterestAmount,
      message: 'Redemption request created successfully',
    });

  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error creating redemption');
    return sanitizedServerError('ไม่สามารถสร้างคำขอไถ่ถอนได้ กรุณาลองใหม่');
  } finally {
    if (releaseLock) await releaseLock();
  }
}
