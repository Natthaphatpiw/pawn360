import { NextRequest, NextResponse } from 'next/server';
import { getRenewedContractWindow } from '@/lib/utils/renewal-window';
import { supabaseAdmin } from '@/lib/supabase/client';
import { logContractAction } from '@/lib/services/slip-verification';
import { ensurePenaltyPaymentRecord, getPenaltyRequirement } from '@/lib/services/penalty';
import { pushLineMessageWithRetry } from '@/lib/line/push-with-retry';
import { Client, FlexMessage } from '@line/bot-sdk';
import { requireContractParty } from '@/lib/security/contract-access';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  boundedText,
  finiteNumber,
  readBoundedJsonObject,
  requireOwnedBlobUrl,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const getInvestorLineClient = () => {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST;
  if (!channelAccessToken) return null;

  return new Client({
    channelAccessToken,
    channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
  });
};

const normalizeRelation = <T,>(value: T | T[] | null | undefined): T | null => (
  Array.isArray(value) ? value[0] || null : value || null
);

const ACTIVE_REQUEST_STATUSES = [
  'PENDING',
  'AWAITING_PAYMENT',
  'SLIP_UPLOADED',
  // The pawner has ALREADY PAID at this point and the request is waiting to be
  // completed. Leaving it out made a paid request invisible to the
  // duplicate check below, so tapping the action again minted a second request
  // at a fresh quote and asked for the money a second time, while the paid one
  // was left behind.
  'SLIP_VERIFIED',
  'SLIP_REJECTED',
  'AWAITING_SIGNATURE',
  'PENDING_INVESTOR_APPROVAL',
  'AWAITING_INVESTOR_APPROVAL',
  'INVESTOR_APPROVED',
  'AWAITING_INVESTOR_PAYMENT',
  'INVESTOR_SLIP_UPLOADED',
  'INVESTOR_SLIP_VERIFIED',
  'INVESTOR_TRANSFERRED',
  'AWAITING_PAWNER_CONFIRM',
];

const getResumeStep = (actionType: string, requestStatus: string) => {
  if (actionType === 'INTEREST_PAYMENT' || actionType === 'PRINCIPAL_REDUCTION') {
    if (['AWAITING_PAYMENT', 'SLIP_REJECTED', 'SLIP_UPLOADED'].includes(requestStatus)) {
      return 'UPLOAD_SLIP';
    }
    if (['SLIP_VERIFIED', 'AWAITING_SIGNATURE'].includes(requestStatus)) {
      return 'SIGN';
    }
  }

  if (actionType === 'PRINCIPAL_INCREASE') {
    if (['AWAITING_PAYMENT', 'SLIP_REJECTED', 'SLIP_UPLOADED'].includes(requestStatus)) {
      return 'UPLOAD_SLIP';
    }
    return 'WAITING';
  }

  return null;
};

// สร้าง action request ใหม่
export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request);
    const contractId = requireUuid(body.contractId);
    const actionType = boundedText(body.actionType, 32, true) || '';
    const amount = finiteNumber(body.amount, { min: 0, max: 100_000_000 });
    const reductionAmount = finiteNumber(body.reductionAmount, { min: 0, max: 100_000_000 });
    const increaseAmount = finiteNumber(body.increaseAmount, { min: 0, max: 100_000_000 });
    const quotedTotalAmount = body.quotedTotalAmount === undefined
      ? undefined
      : finiteNumber(body.quotedTotalAmount, { min: 0, max: 100_000_000 });
    const termsAccepted = body.termsAccepted === true;
    const pawnerSignatureUrl = requireOwnedBlobUrl(body.pawnerSignatureUrl, ['signatures/']);
    const rawBankAccount = body.pawnerBankAccount;
    const pawnerBankAccount = rawBankAccount && typeof rawBankAccount === 'object' && !Array.isArray(rawBankAccount)
      ? {
        bank_name: boundedText((rawBankAccount as Record<string, unknown>).bank_name, 100),
        bank_account_no: boundedText((rawBankAccount as Record<string, unknown>).bank_account_no, 50),
        bank_account_name: boundedText((rawBankAccount as Record<string, unknown>).bank_account_name, 200),
      }
      : null;

    if (!['INTEREST_PAYMENT', 'PRINCIPAL_REDUCTION', 'PRINCIPAL_INCREASE'].includes(actionType)) {
      return NextResponse.json(
        { error: 'ประเภทรายการไม่ถูกต้อง', code: 'INVALID_ACTION_TYPE' },
        { status: 400 }
      );
    }

    if (!termsAccepted) {
      return NextResponse.json(
        { error: 'กรุณายอมรับข้อตกลงและเงื่อนไข' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Authenticate from a database-owned relation before acquiring the lock.
    const { data: initialContract, error: initialContractError } = await supabase
      .from('contracts')
      .select(`
        *,
        items:item_id (*),
        pawners:customer_id (*),
        investors:investor_id (*)
      `)
      .eq('contract_id', contractId)
      .single();

    if (initialContractError || !initialContract) {
      return NextResponse.json(
        { error: 'ไม่พบสัญญา', code: 'CONTRACT_NOT_FOUND' },
        { status: 404 }
      );
    }

    await requireContractParty(request, initialContract, 'PAWNER');
    releaseLock = await acquireFinancialLock(`contract-action-contract:${contractId}`);

    // Re-read all financial inputs after obtaining the contract-level lock.
    // This prevents a completion in another route from making this quote use
    // stale principal, dates, or status.
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        *,
        items:item_id (*),
        pawners:customer_id (*),
        investors:investor_id (*)
      `)
      .eq('contract_id', contractId)
      .single();
    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'ไม่พบสัญญา', code: 'CONTRACT_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const authenticatedLineId = await requireContractParty(request, contract, 'PAWNER');
    const pawner = normalizeRelation<any>(contract.pawners);
    let investor = normalizeRelation<any>(contract.investors);
    if (!investor?.line_id && contract.investor_id) {
      const { data: investorRecord, error: investorLookupError } = await supabase
        .from('investors')
        .select('investor_id, line_id')
        .eq('investor_id', contract.investor_id)
        .maybeSingle();

      if (investorLookupError) {
        console.error('[contract-action:create] investor relation lookup failed');
      } else {
        investor = investorRecord;
      }
    }

    const normalizedContract = {
      ...contract,
      pawners: pawner,
      investors: investor,
    };

    if (!['CONFIRMED', 'EXTENDED'].includes(String(contract.contract_status || ''))) {
      return NextResponse.json(
        { error: 'สัญญานี้ยังไม่อยู่ในสถานะที่ทำรายการได้', code: 'CONTRACT_NOT_ACTIONABLE' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (actionType === 'PRINCIPAL_INCREASE' && (!contract.investor_id || !investor?.line_id)) {
      return NextResponse.json(
        { error: 'ไม่พบ Buyer เจ้าของสัญญาหรือ LINE ID สำหรับรับคำขอ กรุณาติดต่อฝ่ายสนับสนุน' },
        { status: 409 }
      );
    }

    const penaltyRequirement = await getPenaltyRequirement(supabase, contract);
    const penaltyAmount = Number(penaltyRequirement.penaltyDue || 0);
    const overdueInterestAmount = Number(penaltyRequirement.overdueInterestDue || 0);
    if (penaltyRequirement.required) {
      await ensurePenaltyPaymentRecord(supabase, contract, penaltyRequirement);
    }

    // Check for existing pending request
    const { data: existingRequests } = await supabase
      .from('contract_action_requests')
      .select('request_id, request_type, request_status, created_at')
      .eq('contract_id', contractId)
      .in('request_status', ACTIVE_REQUEST_STATUSES)
      .order('created_at', { ascending: false });

    const existingSameType = (existingRequests || []).find(
      (req: any) => req.request_type === actionType
    );
    if (existingSameType) {
      const resumeStep = getResumeStep(actionType, existingSameType.request_status);
      return NextResponse.json({
        success: true,
        resumed: true,
        requestId: existingSameType.request_id,
        requestStatus: existingSameType.request_status,
        resumeStep,
        message: 'มีคำขอเดิมอยู่แล้ว ดำเนินการต่อจากคำขอเดิมได้ทันที',
      });
    }

    if ((existingRequests || []).length > 0) {
      return NextResponse.json(
        { error: 'มีคำขออื่นที่รอดำเนินการอยู่แล้ว กรุณาให้คำขอเดิมเสร็จสิ้นก่อน' },
        { status: 409 }
      );
    }

    const round2 = (value: number) => Math.round(value * 100) / 100;
    const msPerDay = 1000 * 60 * 60 * 24;
    // Calculate details (count start date as day 1)
    const startDate = new Date(contract.contract_start_date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(contract.contract_end_date);
    endDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rawDaysInContract = Number(contract.contract_duration_days || 0)
      || Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay);
    const daysInContract = Math.max(1, rawDaysInContract);
    const rawDaysElapsed = Math.floor((today.getTime() - startDate.getTime()) / msPerDay) + 1;
    const daysElapsed = Math.min(daysInContract, Math.max(1, rawDaysElapsed));
    const daysRemaining = Math.max(0, daysInContract - daysElapsed);

    const rawRate = Number(contract.interest_rate || 0);
    const monthlyInterestRate = rawRate > 1 ? rawRate / 100 : rawRate;
    const feeRate = Number(contract.platform_fee_rate ?? 0.015);
    const dailyInterestRate = monthlyInterestRate / 30;
    const currentPrincipal = contract.current_principal_amount || contract.loan_principal_amount;
    const feeBase = contract.original_principal_amount || contract.loan_principal_amount || currentPrincipal;
    const feeAmount = round2(feeBase * feeRate * (daysInContract / 30));
    const interestAccrued = round2(currentPrincipal * dailyInterestRate * daysElapsed);
    const interestAccruedWithFee = round2(interestAccrued + feeAmount);

    let requestData: any = {
      contract_id: contractId,
      request_type: actionType,
      request_status: 'AWAITING_PAYMENT',
      principal_before: currentPrincipal,
      interest_rate: monthlyInterestRate,
      daily_interest_rate: dailyInterestRate,
      contract_start_date: contract.contract_start_date,
      contract_end_date_before: contract.contract_end_date,
      days_in_contract: daysInContract,
      days_elapsed: daysElapsed,
      days_remaining: daysRemaining,
      interest_accrued: interestAccrued,
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
    };

    switch (actionType) {
      case 'INTEREST_PAYMENT': {
        if (!pawnerSignatureUrl) {
          return NextResponse.json(
            { error: 'กรุณาเซ็นลายเซ็นเพื่อยืนยันคำขอ' },
            { status: 400 }
          );
        }

        const interestToPay = interestAccruedWithFee;
        const renewedWindow = getRenewedContractWindow(daysInContract, contract.contract_end_date);

        requestData = {
          ...requestData,
          interest_to_pay: interestToPay,
          overdue_interest_amount: overdueInterestAmount,
          total_amount: round2(interestToPay + penaltyAmount + overdueInterestAmount),
          new_end_date: renewedWindow.contractEndDate.toISOString().split('T')[0],
          pawner_signature_url: pawnerSignatureUrl,
        };
        break;
      }

      case 'PRINCIPAL_REDUCTION': {
        const reductionAmt = Number(reductionAmount ?? amount ?? 0);

        // A reduction equal to the whole principal leaves zero, and
        // /complete rejects a zero principal - so the request could be paid
        // for and then never completed, stranding the money. Paying the
        // principal off in full is ไถ่ถอน, which has its own flow.
        if (reductionAmt >= currentPrincipal) {
          return NextResponse.json(
            {
              error: 'การชำระเงินต้นทั้งหมดคือการไถ่ถอน กรุณาใช้เมนูไถ่ถอนแทน',
              code: 'REDUCTION_EQUALS_FULL_PRINCIPAL',
            },
            { status: 400, headers: { 'Cache-Control': 'no-store' } },
          );
        }
        if (reductionAmt <= 0 || reductionAmt > currentPrincipal) {
          return NextResponse.json(
            { error: 'จำนวนเงินที่ต้องการลดไม่ถูกต้อง' },
            { status: 400 }
          );
        }

        if (!pawnerSignatureUrl) {
          return NextResponse.json(
            { error: 'กรุณาเซ็นลายเซ็นเพื่อยืนยันคำขอ' },
            { status: 400 }
          );
        }

        const interestForPeriod = interestAccruedWithFee;
        const totalToPay = reductionAmt + interestForPeriod;
        const principalAfterReduction = currentPrincipal - reductionAmt;
        const newInterestForRemaining = round2(principalAfterReduction * dailyInterestRate * daysInContract + feeAmount);

        requestData = {
          ...requestData,
          reduction_amount: reductionAmt,
          interest_for_period: interestForPeriod,
          total_to_pay_reduction: totalToPay,
          overdue_interest_amount: overdueInterestAmount,
          total_amount: round2(totalToPay + penaltyAmount + overdueInterestAmount),
          principal_after_reduction: principalAfterReduction,
          new_interest_for_remaining: newInterestForRemaining,
          pawner_signature_url: pawnerSignatureUrl,
        };
        break;
      }

      case 'PRINCIPAL_INCREASE': {
        const increaseAmt = Number(increaseAmount ?? amount ?? 0);
        const itemValue = contract.items?.estimated_value || currentPrincipal * 1.5;
        const maxIncrease = Math.max(0, itemValue - currentPrincipal);

        if (increaseAmt <= 0 || increaseAmt > maxIncrease) {
          return NextResponse.json(
            { error: `จำนวนเงินที่ต้องการเพิ่มไม่ถูกต้อง สูงสุด ${maxIncrease.toLocaleString()} บาท` },
            { status: 400 }
          );
        }

        if (!pawnerSignatureUrl) {
          return NextResponse.json(
            { error: 'กรุณาเซ็นลายเซ็นเพื่อยืนยันคำขอ' },
            { status: 400 }
          );
        }

        if (!pawnerBankAccount?.bank_name || !pawnerBankAccount?.bank_account_no || !pawnerBankAccount?.bank_account_name) {
          return NextResponse.json(
            { error: 'กรุณากรอกข้อมูลบัญชีธนาคารให้ครบถ้วน' },
            { status: 400 }
          );
        }

        if (!/^[0-9 -]{6,30}$/.test(pawnerBankAccount.bank_account_no)) {
          return NextResponse.json(
            { error: 'เลขบัญชีธนาคารไม่ถูกต้อง', code: 'INVALID_BANK_ACCOUNT' },
            { status: 400 }
          );
        }

        const { error: bankUpdateError } = await supabase
          .from('pawners')
          .update({
            bank_name: pawnerBankAccount.bank_name,
            bank_account_no: pawnerBankAccount.bank_account_no,
            bank_account_name: pawnerBankAccount.bank_account_name,
            updated_at: new Date().toISOString(),
          })
          .eq('customer_id', contract.customer_id);

        if (bankUpdateError) {
          console.error('[contract-action:create] bank update failed');
          return NextResponse.json(
            { error: 'ไม่สามารถบันทึกบัญชีธนาคารได้' },
            { status: 500 }
          );
        }

        const interestForPeriod = interestAccruedWithFee;
        const principalAfterIncrease = currentPrincipal + increaseAmt;
        const newInterestForRemaining = round2(principalAfterIncrease * dailyInterestRate * daysInContract + feeAmount);
        const totalToPayNow = interestForPeriod;
        const nextStatus = 'AWAITING_PAYMENT';

        requestData = {
          ...requestData,
          request_status: nextStatus,
          increase_amount: increaseAmt,
          interest_for_period: interestForPeriod,
          principal_after_increase: principalAfterIncrease,
          new_interest_for_remaining_increase: newInterestForRemaining,
          overdue_interest_amount: overdueInterestAmount,
          total_amount: round2(totalToPayNow + penaltyAmount + overdueInterestAmount),
          pawner_signature_url: pawnerSignatureUrl,
          pawner_bank_name: pawnerBankAccount.bank_name,
          pawner_bank_account_no: pawnerBankAccount.bank_account_no,
          pawner_bank_account_name: pawnerBankAccount.bank_account_name,
        };
        break;
      }

      default:
        return NextResponse.json(
          { error: 'ประเภทรายการไม่ถูกต้อง', code: 'INVALID_ACTION_TYPE' },
          { status: 400 }
        );
    }

    const normalizedQuotedTotal = Number(quotedTotalAmount);
    const calculatedTotal = Number(requestData.total_amount || 0);
    if (
      actionType === 'PRINCIPAL_INCREASE'
      && (quotedTotalAmount === undefined || !Number.isFinite(normalizedQuotedTotal))
    ) {
      return NextResponse.json(
        { error: 'ไม่พบยอดชำระที่ยืนยัน กรุณาคำนวณและตรวจสอบยอดอีกครั้ง' },
        { status: 400 }
      );
    }

    if (
      quotedTotalAmount !== undefined
      && Number.isFinite(normalizedQuotedTotal)
      && Math.round(normalizedQuotedTotal * 100) !== Math.round(calculatedTotal * 100)
    ) {
      return NextResponse.json(
        {
          error: `ยอดชำระมีการเปลี่ยนจาก ${normalizedQuotedTotal.toLocaleString()} บาท เป็น ${calculatedTotal.toLocaleString()} บาท กรุณาตรวจสอบยอดล่าสุดและยืนยันใหม่`,
          recalculationRequired: true,
          expectedTotalAmount: calculatedTotal,
        },
        { status: 409 }
      );
    }

    // Create request
    const { data: actionRequest, error: createError } = await supabase
      .from('contract_action_requests')
      .insert(requestData)
      .select()
      .single();

    if (createError) {
      console.error('[contract-action:create] insert failed');
      return NextResponse.json(
        {
          error: 'ไม่สามารถบันทึกคำขอเพิ่มเงินต้นได้ กรุณาลองใหม่อีกครั้ง',
          code: 'CREATE_REQUEST_FAILED',
        },
        { status: 500 }
      );
    }

    // Log the action
    await logContractAction(
      contractId,
      actionType,
      'INITIATED',
      'PAWNER',
      authenticatedLineId,
      {
        actionRequestId: actionRequest.request_id,
        amount: requestData.total_amount,
        principalBefore: currentPrincipal,
        description: `Pawner initiated ${actionType}`,
        metadata: {
          interestPaymentOption: 'PAY_NOW',
        },
      }
    );

    let buyerNotificationSent = false;

    // Notify the contract owner immediately. The actionable approval card is sent
    // after the seller payment slip is verified.
    if (actionType === 'PRINCIPAL_INCREASE' && investor?.line_id) {
      try {
        const investorLineClient = getInvestorLineClient();
        if (!investorLineClient) {
          throw new Error('Buyer LINE OA is not configured');
        }

        const notification = requestData.request_status === 'PENDING_INVESTOR_APPROVAL'
          ? createInvestorApprovalCard(actionRequest, normalizedContract)
          : {
            type: 'text' as const,
            text: `ได้รับคำขอเพิ่มเงินต้นแล้ว\n\nหมายเลขสัญญา: ${contract.contract_number}\nจำนวนที่ขอเพิ่ม: ${Number(actionRequest.increase_amount || 0).toLocaleString()} บาท\n\nขณะนี้กำลังรอการชำระยอดและตรวจสอบหลักฐานจากผู้ส่งคำขอ ระบบจะแจ้งอีกครั้งเมื่อพร้อมให้พิจารณา`,
          };

        await pushLineMessageWithRetry(investorLineClient, investor.line_id, notification);
        buyerNotificationSent = true;

        await logContractAction(
          contractId,
          'NOTIFICATION_SENT',
          'COMPLETED',
          'SYSTEM',
          null,
          {
            actionRequestId: actionRequest.request_id,
            description: 'Sent principal increase request notification to contract owner',
            metadata: {
              requestStatus: requestData.request_status,
              notificationStage: requestData.request_status === 'PENDING_INVESTOR_APPROVAL'
                ? 'APPROVAL_READY'
                : 'REQUEST_RECEIVED',
            },
          }
        );
      } catch {
        console.error('[contract-action:create] buyer notification delayed');
        await logContractAction(
          contractId,
          'ERROR_OCCURRED',
          'FAILED',
          'SYSTEM',
          null,
          {
            actionRequestId: actionRequest.request_id,
            description: 'Failed to send principal increase request notification to contract owner',
            errorMessage: 'LINE_NOTIFICATION_DELAYED',
          }
        );
      }
    }

    return NextResponse.json({
      success: true,
      requestId: actionRequest.request_id,
      actionType,
      totalAmount: requestData.total_amount,
      buyerNotificationSent,
      message: 'สร้างคำขอสำเร็จ',
    });

  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[contract-action:create] failed');
    return sanitizedServerError('ไม่สามารถสร้างคำขอได้ชั่วคราว กรุณาลองใหม่');
  } finally {
    await releaseLock?.();
  }
}

function createInvestorApprovalCard(actionRequest: any, contract: any): FlexMessage {
  const item = contract?.items;
  const pawner = contract?.pawners;
  const increaseAmount = Number(actionRequest.increase_amount || 0);
  const newPrincipal = actionRequest.principal_after_increase;
  const investorRate = Number(contract?.investor_rate || 0.015);
  const additionalMonthlyInterest = Math.round(increaseAmount * investorRate * 100) / 100;
  const formatAmount = (value: number) => (
    value % 1
      ? value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : value.toLocaleString('th-TH')
  );

  const investorLiffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_PRINCIPAL_INCREASE || '2008641671-ejsAmBXx';

  return {
    type: 'flex',
    altText: 'คำขอเพิ่มเงินต้น - รอการอนุมัติ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'คำขอเพิ่มเงินต้น',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }, {
          type: 'text',
          text: 'Principal Increase Request',
          size: 'xs',
          color: '#ffffff',
          align: 'center',
          margin: 'sm'
        }],
        backgroundColor: '#1E3A8A',
        paddingAll: 'lg'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `สัญญาเลขที่ ${contract?.contract_number}`,
            weight: 'bold',
            size: 'md',
            color: '#333333'
          },
          {
            type: 'text',
            text: `${[item?.brand, item?.model].filter(Boolean).join(' ') || '-'}`,
            size: 'sm',
            color: '#666666',
            margin: 'sm'
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  { type: 'text', text: 'ผู้ขอสินเชื่อ:', color: '#666666', size: 'sm', flex: 2 },
                  { type: 'text', text: `${[pawner?.firstname, pawner?.lastname].filter(Boolean).join(' ') || '-'}`, color: '#333333', size: 'sm', flex: 3, weight: 'bold' }
                ]
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                margin: 'md',
                contents: [
                  { type: 'text', text: 'ขอเพิ่ม:', color: '#666666', size: 'sm', flex: 2 },
                  { type: 'text', text: `${increaseAmount?.toLocaleString()} บาท`, color: '#22C55E', size: 'lg', flex: 3, weight: 'bold' }
                ]
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                margin: 'md',
                contents: [
                  { type: 'text', text: 'เงินต้นใหม่:', color: '#666666', size: 'sm', flex: 2 },
                  { type: 'text', text: `${newPrincipal?.toLocaleString()} บาท`, color: '#1E3A8A', size: 'sm', flex: 3, weight: 'bold' }
                ]
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                margin: 'md',
                contents: [
                  { type: 'text', text: 'ดอกเบี้ยเพิ่ม/เดือน:', color: '#666666', size: 'sm', flex: 2 },
                  { type: 'text', text: `+${formatAmount(additionalMonthlyInterest)} บาท`, color: '#22C55E', size: 'sm', flex: 3, weight: 'bold' }
                ]
              }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [{
          type: 'button',
          action: {
            type: 'uri',
            label: 'ดูรายละเอียดและอนุมัติ',
            uri: `https://liff.line.me/${investorLiffId}?requestId=${actionRequest.request_id}`
          },
          style: 'primary',
          color: '#1E3A8A'
        }]
      }
    }
  };
}
