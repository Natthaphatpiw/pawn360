import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { logContractAction } from '@/lib/services/slip-verification';
import { refreshInvestorTierAndTotals } from '@/lib/services/investor-tier';
import { lineRetryKeyFromMaterial, pushLineTextMessage } from '@/lib/line/push-text';
import { requireContractParty } from '@/lib/security/contract-access';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  readBoundedJsonObject,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';
import { getRenewedContractWindow } from '@/lib/utils/renewal-window';

const round2 = (value: number) => Math.round(value * 100) / 100;
const msPerDay = 1000 * 60 * 60 * 24;

const toUtcDateOnly = (value: string | Date) => {
  const source = new Date(value);
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
};


const buildContractNumber = (requestId: string, createdAt?: string) => {
  const datePart = new Date(createdAt || 0).toISOString().slice(0, 10).replace(/-/g, '');
  const requestPart = requestId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `CTR-${datePart}-${requestPart}`;
};

const buildRenewedContractRecord = (params: {
  contract: any;
  principalAmount: number;
  interestAmount: number;
  contractStartDate: Date;
  contractEndDate: Date;
  durationDays: number;
  requestId: string;
  requestCreatedAt?: string;
  signedContractUrl?: string | null;
  /** Interest the pawner paid to reach this increase. */
  interestPaidNow: number;
  /** How much the principal went up by. */
  principalIncreasedNow: number;
}) => {
  const platformFeeRate = params.contract.platform_fee_rate ?? 0.015;
  const platformFeeAmount = round2(params.principalAmount * platformFeeRate * (params.durationDays / 30));
  const originalContractId = params.contract.original_contract_id || params.contract.contract_id;

  return {
    contract_number: buildContractNumber(params.requestId, params.requestCreatedAt),
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
    original_contract_id: originalContractId,
    contract_file_url: params.contract.contract_file_url,
    signed_contract_url: params.signedContractUrl || params.contract.signed_contract_url,
    item_delivery_status: params.contract.item_delivery_status,
    item_received_at: params.contract.item_received_at,
    item_verified_at: params.contract.item_verified_at,
    payment_slip_url: params.contract.payment_slip_url,
    payment_confirmed_at: params.contract.payment_confirmed_at,
    payment_status: params.contract.payment_status,
    // The platform-fee base. It rises when the pawner genuinely borrows more,
    // but never falls: taking 10,000, paying down to 4,000 and then topping up
    // to 6,000 must not leave the fee charged on 6,000 when the pawner was
    // quoted a fee fixed on the amount they started at. Assigning the new
    // principal outright did exactly that.
    original_principal_amount: Math.max(
      Number(
        params.contract.original_principal_amount
        ?? params.contract.loan_principal_amount
        ?? params.principalAmount,
      ),
      params.principalAmount,
    ),
    current_principal_amount: params.principalAmount,
    // LIFETIME counters, carried across the renewal. Hard-coding them to zero
    // erased the pawner's entire payment history on every principal increase -
    // the record only ever lived on the row this action then marks COMPLETED.
    total_interest_paid: round2(
      Number(params.contract.total_interest_paid || 0) + params.interestPaidNow,
    ),
    total_principal_reduced: Number(params.contract.total_principal_reduced || 0),
    total_principal_increased: round2(
      Number(params.contract.total_principal_increased || 0) + params.principalIncreasedNow,
    ),
    extension_count: Number(params.contract.extension_count || 0),
    redemption_status: 'NONE',
    funded_at: params.contract.funded_at,
    disbursed_at: params.contract.disbursed_at,
  };
};

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request, 16 * 1024);
    const requestId = requireUuid(body.requestId);

    const supabase = supabaseAdmin();

    // Get action request
    const { data: actionRequest, error: requestError } = await supabase
      .from('contract_action_requests')
      .select(`
        *,
        contract:contract_id (
          *,
          items:item_id (*),
          pawners:customer_id (*),
          investors:investor_id (*)
        )
      `)
      .eq('request_id', requestId)
      .single();

    if (requestError || !actionRequest) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอ', code: 'REQUEST_NOT_FOUND' },
        { status: 404 }
      );
    }

    const contract = actionRequest.contract;
    const authenticatedLineId = await requireContractParty(request, contract, 'PAWNER');
    releaseLock = await acquireFinancialLock(`contract-action-contract:${actionRequest.contract_id}`);

    // The first read happens before acquiring the distributed lock so that we
    // can authenticate the caller. Re-read the state after the lock to avoid
    // acting on a stale status when a queued/retried request waited for another
    // worker to finish.
    const { data: lockedActionState, error: lockedStateError } = await supabase
      .from('contract_action_requests')
      .select('request_status, request_type, principal_after_increase')
      .eq('request_id', requestId)
      .single();
    if (lockedStateError || !lockedActionState) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอ', code: 'REQUEST_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (lockedActionState.request_type !== 'PRINCIPAL_INCREASE') {
      return NextResponse.json(
        { error: 'คำขอนี้ไม่ใช่รายการเพิ่มเงินต้น', code: 'INVALID_ACTION_TYPE' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // Check if already completed (idempotency)
    if (lockedActionState.request_status === 'COMPLETED') {
      return NextResponse.json({
        success: true,
        message: 'ยืนยันรับเงินเรียบร้อยแล้ว',
        alreadyCompleted: true,
        newPrincipal: lockedActionState.principal_after_increase,
      });
    }

    if (lockedActionState.request_status !== 'INVESTOR_TRANSFERRED') {
      if (lockedActionState.request_status === 'AWAITING_INVESTOR_PAYMENT' || lockedActionState.request_status === 'INVESTOR_APPROVED') {
        return NextResponse.json(
          { error: 'กรุณารอนักลงทุนโอนเงินก่อน' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'สถานะคำขอไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' },
        { status: 400 }
      );
    }

    const investor = Array.isArray(contract?.investors)
      ? contract.investors[0] || null
      : contract?.investors;
    const now = new Date();
    const contractEndDate = toUtcDateOnly(contract.contract_end_date);
    const contractStartDateOriginal = toUtcDateOnly(contract.contract_start_date);
    const rawRate = Number(contract.interest_rate || 0);
    const monthlyInterestRate = rawRate > 1 ? rawRate / 100 : rawRate;
    const rawDurationDays = Number(contract.contract_duration_days || 0)
      || Math.ceil((contractEndDate.getTime() - contractStartDateOriginal.getTime()) / msPerDay);
    const durationDays = Math.max(1, rawDurationDays);
    const principalAmount = Number(actionRequest.principal_after_increase || contract.current_principal_amount || contract.loan_principal_amount || 0);
    // The replacement term runs from today, not from where the old term ended.
    // The pawner settled interest up to now as part of this request, so the
    // days they paid for are behind them; starting the new term at the old end
    // date handed them the unused remainder of the old term for free and dated
    // the contract into the future. Shared with the other renewal paths so the
    // quote, the request and the resulting contract cannot disagree.
    const { contractStartDate, contractEndDate: contractEndDateNew } =
      getRenewedContractWindow(durationDays, contractEndDate);
    const interestAmount = round2(principalAmount * monthlyInterestRate * (durationDays / 30));

    const renewedContractRecord = buildRenewedContractRecord({
      contract,
      principalAmount,
      interestAmount,
      contractStartDate,
      contractEndDate: contractEndDateNew,
      durationDays,
      requestId,
      requestCreatedAt: actionRequest.created_at,
      signedContractUrl: actionRequest.pawner_signature_url || contract.signed_contract_url,
      interestPaidNow: Number(actionRequest.interest_to_pay || 0),
      principalIncreasedNow: Number(actionRequest.increase_amount || 0),
    });
    const { data: insertedContract, error: newContractError } = await supabase
      .from('contracts')
      .insert(renewedContractRecord)
      .select()
      .single();

    let newContract = insertedContract;
    if (newContractError?.code === '23505') {
      const { data: existingRenewedContract } = await supabase
        .from('contracts')
        .select('*')
        .eq('contract_number', renewedContractRecord.contract_number)
        .maybeSingle();
      newContract = existingRenewedContract;
    }
    if ((newContractError && newContractError.code !== '23505') || !newContract) {
      console.error('[contract-action:confirm-received] renewed contract insert failed');
      return NextResponse.json(
        { error: 'ไม่สามารถสร้างสัญญาต่อเนื่องได้', code: 'RENEWAL_CREATE_FAILED' },
        { status: 500 }
      );
    }

    // Close old contract
    const { error: closeContractError } = await supabase
      .from('contracts')
      .update({
        contract_status: 'COMPLETED',
        completed_at: now.toISOString(),
        last_action_date: now.toISOString(),
        last_action_type: actionRequest.request_type,
        // What the pawner actually paid to close this term. Without it the
        // retiring row was marked COMPLETED with every payment counter still at
        // zero, so nothing recorded that money had changed hands.
        interest_paid: round2(
          Number(contract.interest_paid || 0) + Number(actionRequest.interest_to_pay || 0),
        ),
        amount_paid: round2(
          Number(contract.amount_paid || 0) + Number(actionRequest.total_amount || 0),
        ),
        updated_at: now.toISOString(),
      })
      .eq('contract_id', actionRequest.contract_id);
    if (closeContractError) throw closeContractError;

    // Update action request
    const { data: completedRequest, error: completeRequestError } = await supabase
      .from('contract_action_requests')
      .update({
        request_status: 'COMPLETED',
        completed_at: now.toISOString(),
        pawner_confirmed_at: now.toISOString(),
      })
      .eq('request_id', requestId)
      .eq('request_status', 'INVESTOR_TRANSFERRED')
      .select('request_id')
      .maybeSingle();
    if (completeRequestError) throw completeRequestError;
    if (!completedRequest) {
      const { data: currentRequest } = await supabase
        .from('contract_action_requests')
        .select('request_status')
        .eq('request_id', requestId)
        .maybeSingle();
      if (currentRequest?.request_status !== 'COMPLETED') {
        return NextResponse.json(
          { error: 'สถานะคำขอมีการเปลี่ยนแปลง กรุณาตรวจสอบใหม่', code: 'ACTION_STATE_CONFLICT' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      return NextResponse.json({
        success: true,
        message: 'ยืนยันรับเงินเรียบร้อยแล้ว',
        alreadyCompleted: true,
        newPrincipal: principalAmount,
      });
    }

    if (contract?.investor_id) {
      try {
        await refreshInvestorTierAndTotals(contract.investor_id);
      } catch {
        console.error('[contract-action:confirm-received] investor totals refresh delayed');
      }
    }

    // Log completion
    await logContractAction(
      actionRequest.contract_id,
      'PRINCIPAL_INCREASE',
      'COMPLETED',
      'PAWNER',
      authenticatedLineId,
      {
        actionRequestId: requestId,
        principalBefore: contract?.current_principal_amount || contract?.principal_amount,
        principalAfter: principalAmount,
        amount: actionRequest.increase_amount,
        description: `Principal increased from ${contract?.current_principal_amount || contract?.principal_amount} to ${principalAmount}`,
        metadata: {
          newContractId: newContract.contract_id,
          newContractNumber: newContract.contract_number,
          completionSource: 'PAWNER_CONFIRM_RECEIVED',
        },
      }
    );

    // Notify investor
    if (investor?.line_id) {
      try {
        await pushLineTextMessage({
          channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST,
          to: investor.line_id,
          text: `ผู้ขายยืนยันรับเงินแล้ว\n\nสัญญาเดิม: ${contract?.contract_number}\nสัญญาใหม่: ${newContract.contract_number}\nเงินต้นใหม่: ${principalAmount?.toLocaleString()} บาท\nเพิ่มขึ้น: ${actionRequest.increase_amount?.toLocaleString()} บาท\n\nดอกเบี้ยในสัญญาใหม่: ${interestAmount.toLocaleString()} บาท`,
          retryKey: lineRetryKeyFromMaterial(`principal-increase:received:${requestId}`),
        });
      } catch {
        console.error('[contract-action:confirm-received] investor notification delayed');
      }
    }

    return NextResponse.json({
      success: true,
      message: 'ยืนยันรับเงินและเพิ่มเงินต้นเรียบร้อยแล้ว',
      newContract: {
        contractId: newContract.contract_id,
        contractNumber: newContract.contract_number,
        principalAmount,
      },
    });

  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[contract-action:confirm-received] failed');
    return sanitizedServerError('ไม่สามารถยืนยันการรับเงินได้ชั่วคราว กรุณาลองใหม่');
  } finally {
    await releaseLock?.();
  }
}
