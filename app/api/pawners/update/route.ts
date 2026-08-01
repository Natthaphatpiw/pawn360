import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';

const MAX_JSON_BYTES = 64 * 1024;

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

export async function PUT(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_JSON_BYTES) {
      return NextResponse.json(
        { error: 'Request body is too large', code: 'PAYLOAD_TOO_LARGE' },
        { status: 413 }
      );
    }

    const body = await request.json();
    const {
      lineId: claimedLineId,
      firstname,
      lastname,
      phoneNumber,
      nationalId,
      email,
      address,
      bankInfo
    } = body;

    if (!isBoundedText(claimedLineId, 80)) {
      return NextResponse.json(
        { error: 'Line ID is required' },
        { status: 400 }
      );
    }

    let lineId: string;
    try {
      lineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);
    } catch (error) {
      return liffAuthErrorResponse(error);
    }

    // Validation - required fields
    if (
      !isBoundedText(firstname, 120)
      || !isBoundedText(lastname, 120)
      || !isBoundedText(phoneNumber, 32)
      || (nationalId != null && nationalId !== '' && !isBoundedText(nationalId, 32))
      || (email != null && email !== '' && !isBoundedText(email, 254))
      || (address && JSON.stringify(address).length > 8_192)
      || (bankInfo && JSON.stringify(bankInfo).length > 4_096)
    ) {
      return NextResponse.json(
        { error: 'กรุณากรอกข้อมูลที่จำเป็น (ชื่อ, นามสกุล, เบอร์โทร)' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Check if pawner exists
    const { data: existingPawner, error: checkError } = await supabase
      .from('pawners')
      .select('customer_id')
      .eq('line_id', lineId)
      .single();

    if (checkError || !existingPawner) {
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
      if (bankInfo.promptpayNumber) updateData.promptpay_number = bankInfo.promptpayNumber;
    }

    // Update pawner data
    const { data: updatedPawner, error: updateError } = await supabase
      .from('pawners')
      .update(updateData)
      .eq('line_id', lineId)
      .select('customer_id')
      .single();

    if (updateError) {
      console.error('Error updating pawner:', updateError);
      return NextResponse.json(
        { error: 'เกิดข้อผิดพลาดในการอัพเดทข้อมูล' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'อัพเดทข้อมูลเรียบร้อยแล้ว',
      customerId: updatedPawner.customer_id,
    }, { headers: { 'Cache-Control': 'no-store, private' } });

  } catch (error) {
    console.error('[pawners:update] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการอัพเดทข้อมูล', code: 'UPDATE_FAILED' },
      { status: 500 }
    );
  }
}
