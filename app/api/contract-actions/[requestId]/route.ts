import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { calculatePenaltyMonths, getFrozenLateChargeBreakdown } from '@/lib/services/penalty';
import { requireContractParty } from '@/lib/security/contract-access';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import { requireUuid, sanitizedServerError, transactionRequestErrorResponse } from '@/lib/security/transaction-request';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId: rawRequestId } = await context.params;
    const requestId = requireUuid(rawRequestId);
    const { searchParams } = new URL(request.url);
    const viewer = searchParams.get('viewer') === 'investor' ? 'investor' : 'pawner';

    const supabase = supabaseAdmin();

    // new_principal_amount arrives via 2026_01_04_add_new_principal_amount.sql.
    // PostgREST rejects the whole select on an unknown column, and the handler
    // below reported that as "ไม่พบคำขอ" - so an unapplied migration looked
    // exactly like a missing request and took the interest-payment screen down
    // after the request had already been created.
    const buildSelect = (withNewPrincipal: boolean) => `
        request_id,
        contract_id,
        request_type,
        request_status,
        reduction_amount,
        increase_amount,
        interest_to_pay,
        interest_for_period,
        total_to_pay_reduction,
        total_amount,
        principal_before,
        principal_after_reduction,
        principal_after_increase,
        ${withNewPrincipal ? 'new_principal_amount,' : ''}
        new_end_date,
        terms_accepted,
        pawner_signature_url,
        signature_url,
        pawner_bank_name,
        pawner_bank_account_no,
        pawner_bank_account_name,
        investor_rejection_reason,
        created_at,
        updated_at,
        contract:contract_id (
          contract_id,
          contract_number,
          contract_status,
          contract_start_date,
          contract_end_date,
          contract_duration_days,
          loan_principal_amount,
          current_principal_amount,
          original_principal_amount,
          interest_rate,
          investor_rate,
          items:item_id (
            item_id, brand, model, capacity, estimated_value, item_condition, image_urls
          ),
          pawners:customer_id (
            customer_id, line_id, bank_name, bank_account_no, bank_account_name, promptpay_number
          ),
          investors:investor_id (investor_id, line_id)
        )
      `;
    const selectActionRequest = (withNewPrincipal: boolean) => supabase
      .from('contract_action_requests')
      .select(buildSelect(withNewPrincipal))
      .eq('request_id', requestId)
      .maybeSingle();

    let { data: rawActionRequest, error } = await selectActionRequest(true);
    if (error && `${error.message || ''}`.toLowerCase().includes('new_principal_amount')) {
      console.warn('contract_action_requests.new_principal_amount is missing; run 2026_01_04_add_new_principal_amount.sql. Loading without it.');
      ({ data: rawActionRequest, error } = await selectActionRequest(false));
    }

    if (error) {
      // A rejected query is not a missing request. Keeping them separate is
      // what turns "ไม่พบคำขอ" back into something diagnosable.
      console.error('[contract-actions:detail] query failed', {
        code: (error as { code?: string })?.code || 'QUERY_FAILED',
        column: /column ([a-z_."]+) does not exist/i.exec(error.message || '')?.[1],
      });
      return NextResponse.json(
        { error: 'ไม่สามารถโหลดข้อมูลคำขอได้ กรุณาลองใหม่อีกครั้ง', code: 'REQUEST_LOOKUP_FAILED' },
        { status: 503 },
      );
    }
    if (!rawActionRequest) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอ', code: 'REQUEST_NOT_FOUND' },
        { status: 404 }
      );
    }
    const actionRequest: any = rawActionRequest;

    await requireContractParty(
      request,
      actionRequest.contract,
      viewer === 'investor' ? 'INVESTOR' : 'PAWNER',
    );

    const relationOne = <T,>(value: T | T[] | null | undefined): T | null => (
      Array.isArray(value) ? value[0] || null : value || null
    );
    const pawner = relationOne<any>(actionRequest.contract?.pawners);
    const safeContract = { ...actionRequest.contract } as Record<string, unknown>;
    delete safeContract.investors;
    if (viewer === 'investor') {
      actionRequest.contract.pawners = {
        customer_id: pawner?.customer_id ?? null,
        bank_name: pawner?.bank_name ?? null,
        bank_account_no: pawner?.bank_account_no ?? null,
        bank_account_name: pawner?.bank_account_name ?? null
      };
      if (actionRequest.pawner_signature_url) {
        actionRequest.pawner_signature_url = null;
      }
      if (actionRequest.signature_url) actionRequest.signature_url = null;
    } else {
      safeContract.pawners = pawner ? {
        customer_id: pawner.customer_id,
        bank_name: pawner.bank_name ?? null,
        bank_account_no: pawner.bank_account_no ?? null,
        bank_account_name: pawner.bank_account_name ?? null,
        promptpay_number: pawner.promptpay_number ?? null,
      } : null;
    }
    if (viewer === 'investor') safeContract.pawners = actionRequest.contract.pawners;
    actionRequest.contract = safeContract;
    actionRequest.rejection_reason = actionRequest.investor_rejection_reason || null;

    // Itemise at every status, not only while payment is outstanding. The
    // upload screen is also reached after a rejected or re-uploaded slip, and
    // without the breakdown the base and late-charge rows silently drop out
    // while the total keeps the late charges - which reads as an unexplained
    // increase over the amount quoted on the previous screen.
    {
      const baseAmount = getBaseAmountForActionRequest(actionRequest);
      const breakdown = getFrozenLateChargeBreakdown(
        actionRequest,
        actionRequest.contract,
        baseAmount
      );

      actionRequest.base_amount = baseAmount;
      actionRequest.penalty_amount = breakdown.penaltyAmount;
      actionRequest.overdue_interest_amount = breakdown.overdueInterestAmount;
      actionRequest.total_amount = breakdown.totalAmount;
      actionRequest.payment_breakdown = {
        baseAmount,
        penaltyAmount: breakdown.penaltyAmount,
        overdueInterestAmount: breakdown.overdueInterestAmount,
        totalAmount: breakdown.totalAmount,
        daysOverdue: breakdown.daysOverdue,
        penaltyMonths: calculatePenaltyMonths(breakdown.daysOverdue),
        derivedFromLegacyRequest: !breakdown.hasStoredBreakdown,
      };
    }

    return NextResponse.json({
      success: true,
      request: actionRequest,
    }, { headers: { 'Cache-Control': 'private, no-store' } });

  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    console.error('[contract-actions:detail] failed');
    return sanitizedServerError('ไม่สามารถโหลดข้อมูลคำขอได้ กรุณาลองใหม่');
  }
}

function getBaseAmountForActionRequest(actionRequest: any): number {
  switch (actionRequest.request_type) {
    case 'INTEREST_PAYMENT':
      return Number(actionRequest.interest_to_pay || 0);
    case 'PRINCIPAL_REDUCTION':
      return Number(actionRequest.total_to_pay_reduction || 0);
    case 'PRINCIPAL_INCREASE':
      return Number(actionRequest.interest_for_period || 0);
    default:
      return Number(actionRequest.total_amount || 0);
  }
}
