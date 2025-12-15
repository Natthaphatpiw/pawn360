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

    // Validate and normalize bank_account_type
    const validBankAccountTypes = [
      'บัญชีออมทรัพย์',
      'บัญชีเงินฝากประจำ',
      'บัญชีกระแสรายวัน',
      'บัญชีเงินตราต่างประเทศ',
      'พร้อมเพย์'
    ];

    // Convert empty string to null, and validate the type
    let bankAccountType = bankInfo?.accountType?.trim() || null;
    if (bankAccountType && !validBankAccountTypes.includes(bankAccountType)) {
      console.warn('Invalid bank_account_type:', bankAccountType);
      bankAccountType = null; // Reset invalid values to null
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
        addr_house_no: address?.houseNo || null,
        addr_village: address?.village || null,
        addr_street: address?.street || null,
        addr_sub_district: address?.subDistrict || null,
        addr_district: address?.district || null,
        addr_province: address?.province || null,
        addr_country: address?.country || 'Thailand',
        addr_postcode: address?.postcode || null,
        bank_name: bankInfo?.bankName?.trim() || null,
        bank_account_no: bankInfo?.accountNo?.trim() || null,
        bank_account_type: bankAccountType,
        bank_account_name: bankInfo?.accountName?.trim() || null,
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
