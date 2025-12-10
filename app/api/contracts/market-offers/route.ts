import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const supabase = supabaseAdmin();

    // Get contracts that are pending investor (market offers)
    // These are contracts waiting for investor funding
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
          item_condition,
          estimated_value
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
      .eq('contract_status', 'PENDING')
      .eq('funding_status', 'PENDING')
      .is('investor_id', null)
      .order('created_at', { ascending: false });

    if (contractsError) {
      console.error('Error fetching market offers:', contractsError);
      return NextResponse.json(
        { error: 'Failed to fetch market offers' },
        { status: 500 }
      );
    }

    // Calculate additional info for each contract
    const offersWithInfo = contracts?.map(contract => {
      const createdAt = new Date(contract.created_at);
      const now = new Date();
      const hoursAgo = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));

      return {
        ...contract,
        hours_ago: hoursAgo,
        time_display: hoursAgo < 1 ? 'เมื่อสักครู่' :
                      hoursAgo < 24 ? `${hoursAgo} ชั่วโมงที่แล้ว` :
                      `${Math.floor(hoursAgo / 24)} วันที่แล้ว`
      };
    }) || [];

    return NextResponse.json({
      success: true,
      offers: offersWithInfo
    });

  } catch (error: any) {
    console.error('Error fetching market offers:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
