import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      lineId,
      firstname,
      lastname,
      phoneNumber,
      nationalId,
      address,
      bankInfo
    } = body;

    // Validation
    if (!lineId || !firstname || !lastname || !phoneNumber || !nationalId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Check if user already exists
    const { data: existing } = await supabase
      .from('pawners')
      .select('customer_id')
      .eq('line_id', lineId)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'User already registered' },
        { status: 400 }
      );
    }

    // Insert new pawner
    const { data: pawner, error } = await supabase
      .from('pawners')
      .insert([{
        line_id: lineId,
        firstname,
        lastname,
        phone_number: phoneNumber,
        national_id: nationalId,
        addr_house_no: address?.houseNo,
        addr_village: address?.village,
        addr_street: address?.street,
        addr_sub_district: address?.subDistrict,
        addr_district: address?.district,
        addr_province: address?.province,
        addr_country: address?.country || 'Thailand',
        addr_postcode: address?.postcode,
        bank_name: bankInfo?.bankName || null,
        bank_account_no: bankInfo?.accountNo || null,
        bank_account_type: bankInfo?.accountType || null,
        bank_account_name: bankInfo?.accountName || null,
        kyc_status: 'NOT_VERIFIED',
        is_active: true,
        is_blocked: false,
      }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      pawner
    });

  } catch (error: any) {
    console.error('Error registering pawner:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
