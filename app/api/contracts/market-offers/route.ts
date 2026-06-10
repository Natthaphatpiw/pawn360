import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

const MAX_OFFER_AGE_HOURS = 4;
const MAX_OFFER_AGE_MS = MAX_OFFER_AGE_HOURS * 60 * 60 * 1000;

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
        drop_points:drop_point_id (
          drop_point_id,
          drop_point_name
        )
      `)
      .in('contract_status', ['PENDING', 'PENDING_SIGNATURE'])
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

    const now = Date.now();

    // Calculate additional info for each contract and hide expired offers
    const offersWithInfo = contracts?.flatMap((contract) => {
      const postedAtValue = contract.updated_at || contract.created_at;
      const postedAt = new Date(postedAtValue);
      const postedAtMs = postedAt.getTime();

      if (!Number.isFinite(postedAtMs)) {
        return [];
      }

      const ageMs = now - postedAtMs;
      if (ageMs > MAX_OFFER_AGE_MS) {
        return [];
      }

      const hoursAgo = Math.floor(ageMs / (1000 * 60 * 60));

      return {
        ...contract,
        posted_at: postedAt.toISOString(),
        hours_ago: hoursAgo,
        expires_at: new Date(postedAtMs + MAX_OFFER_AGE_MS).toISOString(),
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
