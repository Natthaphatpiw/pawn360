import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      lineId,
      firstname,
      lastname,
      phoneNumber,
      nationalId,
      email,
      address,
      bankInfo
    } = body;

    if (!lineId) {
      return NextResponse.json(
        { error: 'Line ID is required' },
        { status: 400 }
      );
    }

    // Validation - required fields
    if (!firstname || !lastname || !phoneNumber) {
      return NextResponse.json(
        { error: 'กรุณากรอกข้อมูลที่จำเป็น (ชื่อ, นามสกุล, เบอร์โทร)' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Check if investor exists
    const { data: existingInvestor, error: checkError } = await supabase
      .from('investors')
      .select('investor_id')
      .eq('line_id', lineId)
      .single();

    if (checkError || !existingInvestor) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลผู้ใช้' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {
      firstname,
      lastname,
      phone_number: phoneNumber,
      updated_at: new Date().toISOString(),
    };

    // Optional fields
    if (nationalId) updateData.national_id = nationalId;
    if (email) updateData.email = email;

    // Address fields
    if (address) {
      if (address.houseNo) updateData.addr_house_no = address.houseNo;
      if (address.village) updateData.addr_village = address.village;
      if (address.street) updateData.addr_street = address.street;
      if (address.subDistrict) updateData.addr_sub_district = address.subDistrict;
      if (address.district) updateData.addr_district = address.district;
      if (address.province) updateData.addr_province = address.province;
      if (address.country) updateData.addr_country = address.country;
      if (address.postcode) updateData.addr_postcode = address.postcode;
    }

    // Bank info fields
    if (bankInfo) {
      if (bankInfo.bankName) updateData.bank_name = bankInfo.bankName;
      if (bankInfo.accountNo) updateData.bank_account_no = bankInfo.accountNo;
      if (bankInfo.accountType) updateData.bank_account_type = bankInfo.accountType;
      if (bankInfo.accountName) updateData.bank_account_name = bankInfo.accountName;
    }

    // Update investor data
    const { data: updatedInvestor, error: updateError } = await supabase
      .from('investors')
      .update(updateData)
      .eq('line_id', lineId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating investor:', updateError);
      return NextResponse.json(
        { error: 'เกิดข้อผิดพลาดในการอัพเดทข้อมูล' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'อัพเดทข้อมูลเรียบร้อยแล้ว',
      investor: updatedInvestor
    });

  } catch (error: any) {
    console.error('Error in investor update API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
