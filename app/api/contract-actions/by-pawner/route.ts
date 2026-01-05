import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lineId = searchParams.get('lineId');

    if (!lineId) {
      return NextResponse.json(
        { error: 'LINE ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: pawner, error: pawnerError } = await supabase
      .from('pawners')
      .select('customer_id')
      .eq('line_id', lineId)
      .single();

    if (pawnerError || !pawner) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    const { data: contracts, error: contractsError } = await supabase
      .from('contracts')
      .select('contract_id')
      .eq('customer_id', pawner.customer_id);

    if (contractsError) {
      throw contractsError;
    }

    const contractIds = (contracts || []).map((contract) => contract.contract_id);
    if (contractIds.length === 0) {
      return NextResponse.json({ success: true, requests: [] });
    }

    const { data: requests, error: requestsError } = await supabase
      .from('contract_action_requests')
      .select(`
        request_id,
        request_type,
        request_status,
        increase_amount,
        reduction_amount,
        interest_to_pay,
        interest_for_period,
        total_amount,
        created_at,
        updated_at,
        contract:contract_id (
          contract_id,
          contract_number,
          contract_status,
          items:item_id (
            item_id,
            brand,
            model,
            capacity,
            image_urls
          )
        )
      `)
      .in('contract_id', contractIds)
      .order('created_at', { ascending: false });

    if (requestsError) {
      throw requestsError;
    }

    return NextResponse.json({
      success: true,
      requests: requests || [],
    });
  } catch (error: any) {
    console.error('Error fetching action requests:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
