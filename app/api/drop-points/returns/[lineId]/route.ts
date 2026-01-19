import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

const RETURN_PENDING_STATUSES = ['AMOUNT_VERIFIED', 'PREPARING_ITEM', 'IN_TRANSIT'];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ lineId: string }> }
) {
  try {
    const { lineId } = await context.params;

    if (!lineId) {
      return NextResponse.json(
        { error: 'LINE ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: dropPoint, error: dpError } = await supabase
      .from('drop_points')
      .select('drop_point_id, drop_point_name, drop_point_code')
      .eq('line_id', lineId)
      .single();

    if (dpError || !dropPoint) {
      return NextResponse.json(
        { error: 'Drop point not found' },
        { status: 404 }
      );
    }

    const { data: redemptions, error: redemptionError } = await supabase
      .from('redemption_requests')
      .select(`
        redemption_id,
        request_status,
        total_amount,
        delivery_method,
        verified_at,
        created_at,
        updated_at,
        contract:contract_id (
          contract_id,
          contract_number,
          drop_point_id,
          items:item_id (
            brand,
            model,
            image_urls
          ),
          pawners:customer_id (
            firstname,
            lastname,
            phone_number
          )
        )
      `)
      .eq('contract.drop_point_id', dropPoint.drop_point_id)
      .in('request_status', RETURN_PENDING_STATUSES)
      .order('updated_at', { ascending: false });

    if (redemptionError) {
      throw redemptionError;
    }

    const formatted = (redemptions || []).map((redemption) => ({
      ...redemption,
      displayStatus: 'รอคืนของ',
      displayDate: redemption.verified_at || redemption.updated_at || redemption.created_at
    }));

    return NextResponse.json({
      success: true,
      dropPoint,
      redemptions: formatted
    });
  } catch (error: any) {
    console.error('Error fetching drop point returns:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
