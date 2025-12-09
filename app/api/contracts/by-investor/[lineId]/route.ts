import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lineId: string }> }
) {
  try {
    const { lineId } = await params;

    if (!lineId) {
      return NextResponse.json(
        { error: 'LINE ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get investor by LINE ID
    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('investor_id')
      .eq('line_id', lineId)
      .single();

    if (investorError || !investor) {
      return NextResponse.json(
        { error: 'Investor not found' },
        { status: 404 }
      );
    }

    // Get contracts for this investor (only fully confirmed/completed contracts)
    const { data: contracts, error: contractsError } = await supabase
      .from('contracts')
      .select(`
        *,
        items:item_id (
          item_id,
          brand,
          model,
          capacity,
          image_urls,
          item_condition
        ),
        pawners:customer_id (
          customer_id,
          firstname,
          lastname
        ),
        drop_points:drop_point_id (
          drop_point_id,
          drop_point_name
        )
      `)
      .eq('investor_id', investor.investor_id)
      .in('contract_status', ['CONFIRMED', 'COMPLETED'])
      .order('created_at', { ascending: false });

    if (contractsError) {
      console.error('Error fetching contracts:', contractsError);
      return NextResponse.json(
        { error: 'Failed to fetch contracts' },
        { status: 500 }
      );
    }

    // Calculate additional info for each contract
    const contractsWithInfo = contracts?.map(contract => {
      const endDate = new Date(contract.contract_end_date);
      const now = new Date();
      const remainingDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      return {
        ...contract,
        remaining_days: remainingDays,
        is_overdue: remainingDays < 0
      };
    }) || [];

    return NextResponse.json({
      success: true,
      contracts: contractsWithInfo
    });

  } catch (error: any) {
    console.error('Error fetching investor contracts:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
