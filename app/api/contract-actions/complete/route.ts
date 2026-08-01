import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { pushLineTextMessage, lineRetryKeyFromMaterial } from '@/lib/line/push-text';
import { requirePinToken } from '@/lib/security/pin';
import { requireContractParty } from '@/lib/security/contract-access';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import {
  boundedText,
  readBoundedJsonObject,
  requireOwnedBlobUrl,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';
import { logContractAction } from '@/lib/services/slip-verification';
import { refreshInvestorTierAndTotals } from '@/lib/services/investor-tier';

const round2 = (value: number) => Math.round(value * 100) / 100;
const msPerDay = 1000 * 60 * 60 * 24;

const relationOne = <T,>(value: T | T[] | null | undefined): T | null => (
  Array.isArray(value) ? value[0] || null : value || null
);

const toUtcDateOnly = (value: string | Date) => {
  const source = new Date(value);
  if (!Number.isFinite(source.getTime())) throw new Error('CONTRACT_DATE_INVALID');
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
};

const addUtcDays = (value: Date, days: number) => {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const getRenewedContractWindow = (durationDays: number) => {
  const normalizedDuration = Math.max(1, Math.min(Math.round(durationDays), 3_650));
  const now = new Date();
  const contractStartDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  ));
  return {
    contractStartDate,
    contractEndDate: addUtcDays(contractStartDate, normalizedDuration - 1),
  };
};

const formatThaiDate = (value: Date) => (
  value.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })
);

// A retry of the same action must address the same unique contract number.
const buildContractNumber = (requestId: string) => (
  `CTR-R-${requestId.replace(/-/g, '').slice(0, 20).toUpperCase()}`
);

const buildRenewedContractRecord = (params: {
  requestId: string;
  contract: Record<string, any>;
  principalAmount: number;
  interestAmount: number;
  contractStartDate: Date;
  contractEndDate: Date;
  durationDays: number;
  signedContractUrl?: string | null;
}) => {
  const platformFeeRate = Number(params.contract.platform_fee_rate ?? 0.01);
  const platformFeeAmount = round2(
    params.principalAmount * platformFeeRate * (params.durationDays / 30),
  );

  return {
    contract_number: buildContractNumber(params.requestId),
    customer_id: params.contract.customer_id,
    investor_id: params.contract.investor_id,
    drop_point_id: params.contract.drop_point_id,
    item_id: params.contract.item_id,
    loan_request_id: params.contract.loan_request_id,
    loan_offer_id: params.contract.loan_offer_id,
    contract_start_date: params.contractStartDate.toISOString(),
    contract_end_date: params.contractEndDate.toISOString(),
    contract_duration_days: params.durationDays,
    loan_principal_amount: params.principalAmount,
    interest_rate: params.contract.interest_rate,
    interest_amount: params.interestAmount,
    total_amount: round2(params.principalAmount + params.interestAmount + platformFeeAmount),
    platform_fee_rate: platformFeeRate,
    platform_fee_amount: platformFeeAmount,
    investor_rate: params.contract.investor_rate,
    amount_paid: 0,
    interest_paid: 0,
    principal_paid: 0,
    contract_status: 'CONFIRMED',
    funding_status: params.contract.funding_status || 'FUNDED',
    parent_contract_id: params.contract.contract_id,
    original_contract_id: params.contract.original_contract_id || params.contract.contract_id,
    contract_file_url: params.contract.contract_file_url,
    signed_contract_url: params.signedContractUrl || params.contract.signed_contract_url,
    item_delivery_status: params.contract.item_delivery_status,
    item_received_at: params.contract.item_received_at,
    item_verified_at: params.contract.item_verified_at,
    payment_slip_url: params.contract.payment_slip_url,
    payment_confirmed_at: params.contract.payment_confirmed_at,
    payment_status: params.contract.payment_status,
    original_principal_amount: params.principalAmount,
    current_principal_amount: params.principalAmount,
    total_interest_paid: 0,
    total_principal_reduced: 0,
    total_principal_increased: 0,
    extension_count: 0,
    redemption_status: 'NONE',
    funded_at: params.contract.funded_at,
    disbursed_at: params.contract.disbursed_at,
  };
};

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request, 32 * 1024);
    const requestId = requireUuid(body.requestId);
    const pinToken = boundedText(body.pinToken, 256, true) || '';
    const signatureUrl = body.signatureUrl
      ? requireOwnedBlobUrl(body.signatureUrl, ['signatures/'])
      : null;

    const supabase = supabaseAdmin();
    const { data: rawActionRequest, error: requestError } = await supabase
      .from('contract_action_requests')
      .select(`
        *,
        contract:contract_id (
          *,
          pawners:customer_id (customer_id, line_id),
          investors:investor_id (investor_id, line_id)
        )
      `)
      .eq('request_id', requestId)
      .single();

    if (requestError || !rawActionRequest) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอ', code: 'ACTION_REQUEST_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const actionRequest: any = rawActionRequest;
    const contract = relationOne<any>(actionRequest.contract);
    if (!contract) {
      return NextResponse.json(
        { error: 'ไม่พบสัญญา', code: 'CONTRACT_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const pawnerLineId = await requireContractParty(request, contract, 'PAWNER');
    const pinCheck = await requirePinToken('PAWNER', pawnerLineId, pinToken);
    if (!pinCheck.ok) {
      return NextResponse.json(pinCheck.payload, {
        status: pinCheck.status,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    releaseLock = await acquireFinancialLock(`contract-action-contract:${actionRequest.contract_id}`, 180);

    const { data: lockedActionState, error: lockedActionError } = await supabase
      .from('contract_action_requests')
      .select('request_status, request_type, pawner_signature_url, signature_url')
      .eq('request_id', requestId)
      .single();
    if (lockedActionError || !lockedActionState) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอ', code: 'ACTION_REQUEST_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    actionRequest.request_status = lockedActionState.request_status;
    actionRequest.request_type = lockedActionState.request_type;
    actionRequest.pawner_signature_url = lockedActionState.pawner_signature_url;
    actionRequest.signature_url = lockedActionState.signature_url;

    if (actionRequest.request_type === 'PRINCIPAL_INCREASE') {
      return NextResponse.json(
        {
          error: 'กรุณายืนยันการรับเงินจากหน้าสถานะคำขอ',
          code: 'PRINCIPAL_INCREASE_CONFIRMATION_REQUIRED',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const validStatuses = ['SLIP_VERIFIED', 'AWAITING_SIGNATURE'];

    if (actionRequest.request_status === 'COMPLETED') {
      const { data: existingContract } = await supabase
        .from('contracts')
        .select('contract_id, contract_number')
        .eq('contract_number', buildContractNumber(requestId))
        .maybeSingle();
      return NextResponse.json({
        success: true,
        alreadyCompleted: true,
        actionType: actionRequest.request_type,
        newContract: existingContract || null,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (!validStatuses.includes(actionRequest.request_status)) {
      const rejected = String(actionRequest.request_status).includes('REJECTED');
      return NextResponse.json(
        {
          error: rejected
            ? 'หลักฐานถูกปฏิเสธ กรุณาอัปโหลดใหม่'
            : 'คำขอยังไม่พร้อมดำเนินการ กรุณาตรวจสอบสถานะอีกครั้ง',
          code: rejected ? 'ACTION_EVIDENCE_REJECTED' : 'ACTION_NOT_READY',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const now = new Date();
    const contractEndDate = toUtcDateOnly(contract.contract_end_date);
    const contractStartDate = toUtcDateOnly(contract.contract_start_date);
    const rawRate = Number(contract.interest_rate || 0);
    const monthlyInterestRate = rawRate > 1 ? rawRate / 100 : rawRate;
    const rawDurationDays = Number(contract.contract_duration_days || 0)
      || Math.ceil((contractEndDate.getTime() - contractStartDate.getTime()) / msPerDay);
    const durationDays = Math.max(1, Math.min(Math.round(rawDurationDays), 3_650));
    const renewedWindow = getRenewedContractWindow(durationDays);

    let principalAmount = 0;
    let notificationMessage = '';
    if (actionRequest.request_type === 'INTEREST_PAYMENT') {
      principalAmount = Number(contract.current_principal_amount || contract.loan_principal_amount || 0);
      notificationMessage = `ต่อดอกเบี้ยเรียบร้อย\n\nสัญญาเดิม: ${contract.contract_number}\nสัญญาใหม่: (กำลังสร้าง)\nดอกเบี้ยที่ชำระ: ${Number(actionRequest.interest_to_pay || 0).toLocaleString()} บาท\nเริ่มสัญญาใหม่: ${formatThaiDate(renewedWindow.contractStartDate)}\nครบกำหนดใหม่: ${formatThaiDate(renewedWindow.contractEndDate)}`;
    } else if (actionRequest.request_type === 'PRINCIPAL_REDUCTION') {
      principalAmount = Number(actionRequest.principal_after_reduction || 0);
      notificationMessage = `ลดเงินต้นเรียบร้อย\n\nสัญญาเดิม: ${contract.contract_number}\nสัญญาใหม่: (กำลังสร้าง)\nเงินต้นใหม่: ${principalAmount.toLocaleString()} บาท`;
    } else {
      return NextResponse.json(
        { error: 'ประเภทรายการไม่ถูกต้อง', code: 'ACTION_TYPE_INVALID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (!Number.isFinite(principalAmount) || principalAmount <= 0 || principalAmount > 100_000_000) {
      throw new Error('ACTION_PRINCIPAL_INVALID');
    }

    const interestAmount = round2(principalAmount * monthlyInterestRate * (durationDays / 30));
    const persistedSignature = signatureUrl
      || actionRequest.pawner_signature_url
      || actionRequest.signature_url
      || contract.signed_contract_url;

    if (signatureUrl) {
      const { error: signatureError } = await supabase
        .from('contract_action_requests')
        .update({ signature_url: signatureUrl, signed_at: now.toISOString() })
        .eq('request_id', requestId)
        .in('request_status', validStatuses);
      if (signatureError) throw signatureError;
    }

    const newRecord = buildRenewedContractRecord({
      requestId,
      contract,
      principalAmount,
      interestAmount,
      contractStartDate: renewedWindow.contractStartDate,
      contractEndDate: renewedWindow.contractEndDate,
      durationDays,
      signedContractUrl: persistedSignature,
    });
    let { data: newContract, error: newContractError } = await supabase
      .from('contracts')
      .insert(newRecord)
      .select('contract_id, contract_number')
      .single();

    // Crash/retry recovery: the deterministic unique number identifies the
    // contract created by this action and lets the state transition continue.
    if (newContractError?.code === '23505') {
      const existing = await supabase
        .from('contracts')
        .select('contract_id, contract_number')
        .eq('contract_number', newRecord.contract_number)
        .maybeSingle();
      newContract = existing.data;
      newContractError = existing.error;
    }
    if (newContractError || !newContract) throw newContractError || new Error('RENEWED_CONTRACT_CREATE_FAILED');

    const { data: closedContracts, error: closeError } = await supabase
      .from('contracts')
      .update({
        contract_status: 'COMPLETED',
        completed_at: now.toISOString(),
        last_action_date: now.toISOString(),
        last_action_type: actionRequest.request_type,
        updated_at: now.toISOString(),
      })
      .eq('contract_id', actionRequest.contract_id)
      .in('contract_status', ['ACTIVE', 'CONFIRMED', 'EXTENDED'])
      .select('contract_id');
    if (closeError) throw closeError;
    if (!closedContracts?.length && contract.contract_status !== 'COMPLETED') {
      const current = await supabase
        .from('contracts')
        .select('contract_status')
        .eq('contract_id', actionRequest.contract_id)
        .single();
      if (current.data?.contract_status !== 'COMPLETED') throw new Error('CONTRACT_STATE_CONFLICT');
    }

    const { data: completedRequests, error: completionError } = await supabase
      .from('contract_action_requests')
      .update({ request_status: 'COMPLETED', completed_at: now.toISOString() })
      .eq('request_id', requestId)
      .in('request_status', validStatuses)
      .select('request_id');
    if (completionError) throw completionError;
    if (!completedRequests?.length) {
      const current = await supabase
        .from('contract_action_requests')
        .select('request_status')
        .eq('request_id', requestId)
        .single();
      if (current.data?.request_status !== 'COMPLETED') throw new Error('ACTION_STATE_CONFLICT');
    }

    if (contract.investor_id) {
      await refreshInvestorTierAndTotals(contract.investor_id).catch(() => {});
    }
    await logContractAction(
      actionRequest.contract_id,
      actionRequest.request_type,
      'COMPLETED',
      'PAWNER',
      pawnerLineId,
      {
        actionRequestId: requestId,
        amount: actionRequest.total_amount,
        principalBefore: contract.current_principal_amount || contract.loan_principal_amount,
        principalAfter: principalAmount,
        contractEndDateBefore: contract.contract_end_date,
        contractEndDateAfter: renewedWindow.contractEndDate.toISOString(),
        description: `${actionRequest.request_type} completed successfully`,
        metadata: {
          newContractId: newContract.contract_id,
          newContractNumber: newContract.contract_number,
        },
      },
    ).catch(() => {});

    const message = `${notificationMessage.replace('(กำลังสร้าง)', newContract.contract_number)}\nดอกเบี้ยในสัญญาใหม่: ${interestAmount.toLocaleString()} บาท`;
    const pawner = relationOne<any>(contract.pawners);
    const investor = relationOne<any>(contract.investors);
    await Promise.allSettled([
      pushLineTextMessage({
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
        to: pawner?.line_id,
        text: message,
        retryKey: lineRetryKeyFromMaterial(`action-complete:pawner:${requestId}`),
      }),
      pushLineTextMessage({
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST,
        to: investor?.line_id,
        text: message,
        retryKey: lineRetryKeyFromMaterial(`action-complete:investor:${requestId}`),
      }),
    ]);

    return NextResponse.json({
      success: true,
      actionType: actionRequest.request_type,
      newContract,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[contract-action:complete] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return sanitizedServerError('ไม่สามารถดำเนินรายการได้ชั่วคราว กรุณาตรวจสอบสถานะแล้วลองใหม่');
  } finally {
    await releaseLock?.();
  }
}
