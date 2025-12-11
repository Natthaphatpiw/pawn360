import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

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
