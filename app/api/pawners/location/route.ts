import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { haversineDistanceMeters } from '@/lib/services/geo';

type LocationRequest = {
  lineId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  source?: string;
  setDefault?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<LocationRequest>;
    const lineId = body.lineId?.trim();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracy = Number(body.accuracy);
    const accuracyRounded = Number.isFinite(accuracy) ? Math.round(accuracy) : null;

    if (!lineId) {
      return NextResponse.json(
        { error: 'Line ID is required' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { error: 'Invalid latitude/longitude' },
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
        { error: 'Pawner not found' },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      last_location_lat: latitude,
      last_location_lng: longitude,
      last_location_at: now,
      last_location_source: body.source || 'liff_geolocation',
    };

    if (accuracyRounded !== null) {
      updatePayload.last_location_accuracy = accuracyRounded;
    }

    const { error: updateError } = await supabase
      .from('pawners')
      .update(updatePayload)
      .eq('customer_id', pawner.customer_id);

    if (updateError) {
      console.error('Error updating pawner location:', updateError);
      return NextResponse.json(
        { error: 'Failed to update location' },
        { status: 500 }
      );
    }

    const { data: branches, error: branchError } = await supabase
      .from('drop_points')
      .select(
        'drop_point_id, drop_point_name, latitude, longitude, addr_district, addr_province, addr_postcode'
      )
      .eq('is_active', true)
      .eq('is_accepting_items', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (branchError) {
      console.error('Error fetching branches:', branchError);
      return NextResponse.json({
        success: true,
        saved: true,
        suggestedBranch: null,
      });
    }

    let best: (typeof branches)[number] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const origin = { latitude, longitude };

    for (const branch of branches || []) {
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

    if (best && body.setDefault) {
      await supabase
        .from('pawners')
        .update({
          default_drop_point_id: best.drop_point_id,
          default_drop_point_source: 'geo_auto',
          default_drop_point_updated_at: now,
        })
        .eq('customer_id', pawner.customer_id);
    }

    return NextResponse.json({
      success: true,
      saved: true,
      suggestedBranch: best
        ? {
            branch_id: best.drop_point_id,
            branch_name: best.drop_point_name,
            district: best.addr_district,
            province: best.addr_province,
            postcode: best.addr_postcode,
            distance_m: Math.round(bestDistance),
          }
        : null,
    });
  } catch (error: any) {
    console.error('Error saving pawner location:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
