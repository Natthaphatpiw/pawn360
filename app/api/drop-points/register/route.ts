import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      drop_point_name,
      drop_point_code,
      phone_number,
      email,
      addr_house_no,
      addr_village,
      addr_street,
      addr_sub_district,
      addr_district,
      addr_province,
      addr_postcode,
      google_map_url,
      manager_name,
      manager_phone,
      manager_line_id,
      line_id,
      opening_hours
    } = body;

    if (!drop_point_name || !drop_point_code || !phone_number || !line_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Check if drop point with this code already exists
    const { data: existing } = await supabase
      .from('drop_points')
      .select('drop_point_id')
      .eq('drop_point_code', drop_point_code)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'รหัสสาขานี้มีอยู่แล้ว' },
        { status: 400 }
      );
    }

    // Check if LINE ID already registered
    const { data: existingLine } = await supabase
      .from('drop_points')
      .select('drop_point_id')
      .eq('line_id', line_id)
      .single();

    if (existingLine) {
      return NextResponse.json(
        { error: 'LINE ID นี้ได้ลงทะเบียนแล้ว' },
        { status: 400 }
      );
    }

    // Create drop point
    const { data: dropPoint, error } = await supabase
      .from('drop_points')
      .insert({
        drop_point_name,
        drop_point_code,
        phone_number,
        email,
        addr_house_no,
        addr_village,
        addr_street,
        addr_sub_district,
        addr_district,
        addr_province,
        addr_postcode,
        google_map_url,
        manager_name,
        manager_phone,
        manager_line_id,
        line_id,
        opening_hours,
        is_active: true,
        is_accepting_items: true
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating drop point:', error);
      return NextResponse.json(
        { error: 'Failed to create drop point' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      dropPoint
    });

  } catch (error: any) {
    console.error('Error in drop point registration:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
