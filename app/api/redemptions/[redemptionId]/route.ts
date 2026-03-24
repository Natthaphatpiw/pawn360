import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { getPenaltyRequirement, roundCurrency } from '@/lib/services/penalty';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ redemptionId: string }> }
) {
  try {
    const { redemptionId } = await context.params;

    if (!redemptionId) {
      return NextResponse.json(
        { error: 'Redemption ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: redemption, error } = await supabase
      .from('redemption_requests')
      .select(`
        *,
        contract:contract_id (
          contract_id,
          contract_number,
          contract_start_date,
          contract_end_date,
          customer_id,
          investor_id,
          loan_principal_amount,
          interest_amount,
          total_amount,
          items:item_id (
            item_id,
            brand,
            model,
            capacity
          ),
          pawners:customer_id (
            customer_id,
            firstname,
            lastname,
            line_id,
            phone_number
          ),
          investors:investor_id (
            investor_id,
            firstname,
            lastname,
            line_id,
            bank_name,
            bank_account_no,
            bank_account_name
          ),
          drop_points:drop_point_id (
            drop_point_id,
            drop_point_name,
            phone_number,
            line_id
          )
        )
      `)
      .eq('redemption_id', redemptionId)
      .single();

    if (error) {
      console.error('Error fetching redemption:', error);
      return NextResponse.json(
        { error: 'Redemption not found' },
        { status: 404 }
      );
    }

    if (redemption?.request_status === 'PENDING') {
      const penaltyRequirement = await getPenaltyRequirement(supabase, redemption.contract);
      const baseAmount = Number(redemption.principal_amount || 0)
        + Number(redemption.interest_amount || 0)
        + Number(redemption.delivery_fee || 0);
      const penaltyAmount = penaltyRequirement.required ? Number(penaltyRequirement.penaltyAmount || 0) : 0;
      redemption.base_amount = baseAmount;
      redemption.penalty_amount = penaltyAmount;
      redemption.total_amount = roundCurrency(baseAmount + penaltyAmount);
      redemption.payment_breakdown = {
        baseAmount,
        penaltyAmount,
        totalAmount: redemption.total_amount,
      };
    }

    return NextResponse.json({
      success: true,
      redemption,
    });

  } catch (error: any) {
    console.error('Error fetching redemption:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
