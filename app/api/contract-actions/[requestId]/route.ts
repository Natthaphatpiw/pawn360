import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { getFrozenLateChargeBreakdown } from '@/lib/services/penalty';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await context.params;
    const { searchParams } = new URL(request.url);
    const viewer = searchParams.get('viewer');

    if (!requestId) {
      return NextResponse.json(
        { error: 'Missing request ID' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: actionRequest, error } = await supabase
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

    if (error || !actionRequest) {
      return NextResponse.json(
        { error: 'Request not found' },
        { status: 404 }
      );
    }

    if (viewer === 'investor' && actionRequest.contract?.pawners) {
      const pawner = actionRequest.contract.pawners;
      actionRequest.contract.pawners = {
        customer_id: pawner.customer_id,
        bank_name: pawner.bank_name ?? null,
        bank_account_no: pawner.bank_account_no ?? null,
        bank_account_name: pawner.bank_account_name ?? null
      };
      if (actionRequest.pawner_signature_url) {
        actionRequest.pawner_signature_url = null;
      }
    }

    if (['AWAITING_PAYMENT', 'SLIP_REJECTED'].includes(actionRequest.request_status)) {
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
        derivedFromLegacyRequest: !breakdown.hasStoredBreakdown,
      };
    }

    return NextResponse.json({
      success: true,
      request: actionRequest,
    });

  } catch (error: any) {
    console.error('Error fetching action request:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
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
