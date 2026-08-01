import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { VALID_BANK_ACCOUNT_TYPES } from '@/lib/utils/bank-account-types';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';

const MAX_JSON_BYTES = 64 * 1024;

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

export async function POST(request: NextRequest) {
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
      referralCode,
      maxInvestmentAmount,
      preferences,
      address,
      bankInfo
    } = body;

    const normalizedReferralCode = referralCode?.trim()?.toUpperCase() || null;

    // Validation
    if (
      !isBoundedText(claimedLineId, 80)
      || !isBoundedText(firstname, 120)
      || !isBoundedText(lastname, 120)
      || !isBoundedText(phoneNumber, 32)
      || !isBoundedText(nationalId, 32)
      || (address && JSON.stringify(address).length > 8_192)
      || (bankInfo && JSON.stringify(bankInfo).length > 4_096)
      || (preferences && JSON.stringify(preferences).length > 16_384)
    ) {
      return NextResponse.json(
        { error: 'Invalid or missing fields', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    let lineId: string;
    try {
      lineId = await requireLiffOwner(request, 'INVESTOR', claimedLineId);
    } catch (error) {
      return liffAuthErrorResponse(error);
    }

    const supabase = supabaseAdmin();

    // Check if user already exists
    const { data: existing } = await supabase
      .from('investors')
      .select('investor_id')
      .eq('line_id', lineId)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'User already registered' },
        { status: 400 }
      );
    }

    // Validate and normalize bank_account_type
    const validBankAccountTypes = VALID_BANK_ACCOUNT_TYPES;

    // Convert empty string to null, and validate the type
    let bankAccountType = bankInfo?.accountType?.trim() || null;
    if (bankAccountType && !validBankAccountTypes.includes(bankAccountType)) {
      console.warn('Invalid bank_account_type:', bankAccountType);
      bankAccountType = null; // Reset invalid values to null
    }

    // Insert new investor
    const { data: investor, error } = await supabase
      .from('investors')
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
        referral_code: normalizedReferralCode,
        max_investment_amount: typeof maxInvestmentAmount === 'number' && maxInvestmentAmount > 0 ? maxInvestmentAmount : null,
        investment_preferences: preferences || null,
        kyc_status: 'NOT_VERIFIED',
        is_active: true,
        is_blocked: false,
        min_investment_amount: 1000, // Default minimum
        auto_invest_enabled: false,
        investor_tier: 'SILVER',
        total_active_principal: 0
      }])
      .select('investor_id, kyc_status, referral_code, max_investment_amount, investment_preferences, investor_tier, total_active_principal, auto_invest_enabled, auto_liquidation_enabled')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      investor
    }, { headers: { 'Cache-Control': 'no-store, private' } });

  } catch (error) {
    console.error('[investors:register] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถลงทะเบียนได้ชั่วคราว', code: 'REGISTRATION_FAILED' },
      { status: 500 }
    );
  }
}
