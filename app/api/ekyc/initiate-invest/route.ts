import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import crypto from 'crypto';

const UPPASS_API_KEY = process.env.UPPASS_API_KEY_INVEST || 'sk_d3NfM0ZvRzZQaG1SdjdCRV9IREw4QUxOMFREOkFEPD88WmFhQDdyLHVZczlzbFlaNHtyVltKI2h0dyhe';
const UPPASS_FORM_SLUG = process.env.UPPASS_FORM_SLUG_INVEST || 'investor';
const UPPASS_API_URL = process.env.UPPASS_API_URL || 'https://app.uppass.io';

export async function POST(request: NextRequest) {
  try {
    const { investorId } = await request.json();

    if (!investorId) {
      return NextResponse.json(
        { error: 'Investor ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get investor details
    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('*')
      .eq('investor_id', investorId)
      .single();

    if (investorError || !investor) {
      return NextResponse.json(
        { error: 'Investor not found' },
        { status: 404 }
      );
    }

    // Check if already verified
    if (investor.kyc_status === 'VERIFIED') {
      return NextResponse.json(
        { error: 'KYC already verified' },
        { status: 400 }
      );
    }

    // Generate unique slug for this verification
    const uniqueSlug = `investor-${investorId}-${crypto.randomBytes(8).toString('hex')}`;

    // Create UpPass verification session
    const uppassResponse = await fetch(`${UPPASS_API_URL}/api/v1/forms/${UPPASS_FORM_SLUG}/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPPASS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_id: investorId,
        slug: uniqueSlug,
        prefill: {
          first_name: investor.firstname,
          last_name: investor.lastname,
          national_id: investor.national_id,
          phone: investor.phone_number,
        },
        redirect_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://pawnline.vercel.app'}/ekyc-invest/waiting`,
      }),
    });

    if (!uppassResponse.ok) {
      const errorData = await uppassResponse.json();
      console.error('UpPass API error:', errorData);
      throw new Error('Failed to create verification session');
    }

    const uppassData = await uppassResponse.json();

    // Update investor with uppass_slug and set status to PENDING
    await supabase
      .from('investors')
      .update({
        uppass_slug: uniqueSlug,
        kyc_status: 'PENDING',
        updated_at: new Date().toISOString()
      })
      .eq('investor_id', investorId);

    return NextResponse.json({
      success: true,
      url: uppassData.url || uppassData.verification_url
    });

  } catch (error: any) {
    console.error('eKYC initiation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate eKYC' },
      { status: 500 }
    );
  }
}
