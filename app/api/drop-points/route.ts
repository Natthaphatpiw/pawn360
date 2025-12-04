import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('drop_points')
      .select('*')
      .eq('is_active', true)
      .eq('is_accepting_items', true)
      .order('drop_point_name', { ascending: true });

    if (error) {
      console.error('Error fetching drop points:', error);
      return NextResponse.json(
        { error: 'Failed to fetch branches' },
        { status: 500 }
      );
    }

    // Map database fields to expected frontend fields
    const branches = (data || []).map((dp: any) => ({
      branch_id: dp.drop_point_id,
      branch_name: dp.drop_point_name,
      address: `${dp.addr_house_no || ''} ${dp.addr_street || ''}, ${dp.addr_sub_district || ''}, ${dp.addr_district || ''}`.trim(),
      district: dp.addr_district,
      province: dp.addr_province,
      postal_code: dp.addr_postcode,
      phone_number: dp.phone_number,
      google_maps_link: dp.google_map_url,
      operating_hours: formatOperatingHours(dp.opening_hours),
    }));

    return NextResponse.json({
      branches,
    });
  } catch (error) {
    console.error('Error in drop-points API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function formatOperatingHours(hoursJson: any): string {
  try {
    if (typeof hoursJson === 'string') {
      hoursJson = JSON.parse(hoursJson);
    }
    // Format to readable string, e.g., "จันทร์-ศุกร์: 09:00-21:00"
    if (hoursJson?.monday) {
      return `จันทร์-ศุกร์: ${hoursJson.monday}, เสาร์: ${hoursJson.saturday || hoursJson.monday}, อาทิตย์: ${hoursJson.sunday || hoursJson.monday}`;
    }
    return 'โปรดติดต่อสาขา';
  } catch (e) {
    return 'โปรดติดต่อสาขา';
  }
}
