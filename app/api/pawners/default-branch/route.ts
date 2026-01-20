import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const lineId = request.nextUrl.searchParams.get('lineId');
    if (!lineId) {
      return NextResponse.json(
        { error: 'Line ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    const { data: pawner, error } = await supabase
      .from('pawners')
      .select('customer_id, default_drop_point_id, default_drop_point_source, default_drop_point_updated_at')
      .eq('line_id', lineId)
      .single();

    if (error || !pawner) {
      return NextResponse.json(
        { error: 'Pawner not found' },
        { status: 404 }
      );
    }

    if (!pawner.default_drop_point_id) {
      return NextResponse.json({
        success: true,
        defaultBranch: null,
      });
    }

    const { data: branch } = await supabase
      .from('drop_points')
      .select('drop_point_id, drop_point_name, addr_district, addr_province, addr_postcode, google_map_url, map_embed')
      .eq('drop_point_id', pawner.default_drop_point_id)
      .single();

    return NextResponse.json({
      success: true,
      defaultBranch: branch
        ? {
            branch_id: branch.drop_point_id,
            branch_name: branch.drop_point_name,
            district: branch.addr_district,
            province: branch.addr_province,
            postcode: branch.addr_postcode,
            google_maps_link: branch.google_map_url,
            map_embed: branch.map_embed,
          }
        : null,
      source: pawner.default_drop_point_source,
      updated_at: pawner.default_drop_point_updated_at,
    });
  } catch (error: any) {
    console.error('Error fetching default branch:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const lineId = String(body.lineId || '').trim();
    const branchId = String(body.branchId || '').trim();
    const source = body.source === 'geo_auto' ? 'geo_auto' : 'manual';

    if (!lineId || !branchId) {
      return NextResponse.json(
        { error: 'Missing lineId or branchId' },
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

    const { error } = await supabase
      .from('pawners')
      .update({
        default_drop_point_id: branchId,
        default_drop_point_source: source,
        default_drop_point_updated_at: new Date().toISOString(),
      })
      .eq('customer_id', pawner.customer_id);

    if (error) {
      console.error('Error updating default branch:', error);
      return NextResponse.json(
        { error: 'Failed to update default branch' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating default branch:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
