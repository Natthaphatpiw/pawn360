import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { haversineDistanceMeters } from '@/lib/services/geo';

type ResolveBranchRequest = {
  latitude: number;
  longitude: number;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<ResolveBranchRequest>;
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { error: 'Invalid latitude/longitude' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from('drop_points')
      .select(
        'drop_point_id, drop_point_name, latitude, longitude, addr_sub_district, addr_district, addr_province, addr_postcode'
      )
      .eq('is_active', true)
      .eq('is_accepting_items', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) {
      console.error('Error resolving branch:', error);
      return NextResponse.json(
        { error: 'Failed to resolve branch' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, reason: 'NO_ACTIVE_BRANCHES' },
        { status: 200 }
      );
    }

    const origin = { latitude, longitude };
    let best: (typeof data)[number] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const branch of data) {
      if (branch.latitude == null || branch.longitude == null) continue;
      const distance = haversineDistanceMeters(origin, {
        latitude: Number(branch.latitude),
        longitude: Number(branch.longitude),
      });
      if (distance < bestDistance) {
        bestDistance = distance;
        best = branch;
      }
    }

    if (!best) {
      return NextResponse.json(
        { success: false, reason: 'NO_VALID_COORDS' },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      branch: {
        branch_id: best.drop_point_id,
        branch_name: best.drop_point_name,
        district: best.addr_district,
        province: best.addr_province,
        postcode: best.addr_postcode,
      },
      distance_m: Math.round(bestDistance),
    });
  } catch (error: any) {
    console.error('Error in resolve-branch:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
