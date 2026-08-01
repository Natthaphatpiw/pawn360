import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  calculatePenaltyMonths,
  getFrozenLateChargeBreakdown,
  roundCurrency,
} from '@/lib/services/penalty';
import { requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ redemptionId: string }> }
) {
  try {
    const params = await context.params;
    const redemptionId = requireUuid(params.redemptionId);
    const identity = await requireLiffIdentity(request, 'PAWNER');

    const supabase = supabaseAdmin();

    const { data: redemption, error } = await supabase
      .from('redemption_requests')
      .select(`
        redemption_id,
        contract_id,
        request_type,
        principal_amount,
        interest_amount,
        delivery_fee,
        total_amount,
        base_amount,
        penalty_amount,
        overdue_interest_amount,
        penalty_days_overdue,
        penalty_months,
        delivery_method,
        request_status,
        payment_slip_uploaded_at,
        created_at,
        updated_at,
        contract:contract_id (
          contract_id,
          contract_number,
          contract_start_date,
          contract_end_date,
          customer_id,
          current_principal_amount,
          loan_principal_amount,
          items:item_id (
            item_id,
            brand,
            model,
            capacity
          ),
          pawners:customer_id (
            line_id
          )
        )
      `)
      .eq('redemption_id', redemptionId)
      .single();

    if (error || !redemption) {
      return NextResponse.json(
        { error: 'Redemption not found' },
        { status: 404 }
      );
    }

    const contract = Array.isArray(redemption.contract) ? redemption.contract[0] : redemption.contract;
    const pawner = Array.isArray(contract?.pawners) ? contract.pawners[0] : contract?.pawners;
    const item = Array.isArray(contract?.items) ? contract.items[0] : contract?.items;
    if (!pawner?.line_id || pawner.line_id !== identity.lineId) {
      return NextResponse.json(
        { error: 'คุณไม่มีสิทธิ์ดูคำขอนี้' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const responseRedemption: Record<string, unknown> = {
      redemption_id: redemption.redemption_id,
      contract_id: redemption.contract_id,
      request_type: redemption.request_type,
      principal_amount: redemption.principal_amount,
      interest_amount: redemption.interest_amount,
      delivery_fee: redemption.delivery_fee,
      total_amount: redemption.total_amount,
      delivery_method: redemption.delivery_method,
      request_status: redemption.request_status,
      payment_slip_uploaded: Boolean(redemption.payment_slip_uploaded_at),
      created_at: redemption.created_at,
      updated_at: redemption.updated_at,
      contract: {
        contract_id: contract?.contract_id,
        contract_number: contract?.contract_number,
        items: item ? {
          item_id: item.item_id,
          brand: item.brand,
          model: item.model,
          capacity: item.capacity,
        } : null,
      },
    };

    // Always itemise the amount the pawner was quoted, at every status, from the
    // frozen figures. Recomputing the penalty here would move a money figure
    // after the pawner has already been told what to pay: the flat penalty
    // steps every 30 days and the overdue interest accrues monthly.
    const storedBaseAmount = redemption?.base_amount !== null && redemption?.base_amount !== undefined
      ? Number(redemption.base_amount)
      : roundCurrency(
        Number(redemption?.principal_amount || 0)
        + Number(redemption?.interest_amount || 0)
        + Number(redemption?.delivery_fee || 0),
      );
    const hasFrozenSplit = redemption?.penalty_amount !== null && redemption?.penalty_amount !== undefined;
    const breakdown = getFrozenLateChargeBreakdown(
      {
        total_amount: redemption?.total_amount,
        // Rows written before the breakdown columns existed fall back to the
        // helper's legacy derivation instead of a live recomputation.
        overdue_interest_amount: hasFrozenSplit ? redemption.overdue_interest_amount : undefined,
        created_at: redemption?.created_at,
      },
      contract,
      storedBaseAmount,
    );
    const penaltyMonths = redemption?.penalty_months !== null && redemption?.penalty_months !== undefined
      ? Number(redemption.penalty_months)
      : calculatePenaltyMonths(breakdown.daysOverdue);

    responseRedemption.base_amount = storedBaseAmount;
    responseRedemption.penalty_amount = breakdown.penaltyAmount;
    responseRedemption.overdue_interest_amount = breakdown.overdueInterestAmount;
    responseRedemption.total_amount = breakdown.totalAmount;
    responseRedemption.payment_breakdown = {
      baseAmount: storedBaseAmount,
      penaltyAmount: breakdown.penaltyAmount,
      overdueInterestAmount: breakdown.overdueInterestAmount,
      totalAmount: breakdown.totalAmount,
      daysOverdue: breakdown.daysOverdue,
      penaltyMonths,
      derivedFromLegacyRequest: !hasFrozenSplit,
    };

    return NextResponse.json({
      success: true,
      redemption: responseRedemption,
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('[redemption:detail] failed');
    return sanitizedServerError('ไม่สามารถโหลดคำขอไถ่ถอนได้ กรุณาลองใหม่');
  }
}
