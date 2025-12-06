import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { investorId } = body;

    if (!investorId) {
      return NextResponse.json(
        { error: 'Investor ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // 1. Get investor data
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

    // 2. Call UpPass API to create eKYC session for investors
    const lang = 'th';
    // TEMPORARY: Use same config as pawner until investor form is created in UpPass
    const formSlug = process.env.UPPASS_FORM_SLUG_INVEST || process.env.UPPASS_FORM_SLUG || 'pawner';
    const uppassApiKey = process.env.UPPASS_API_KEY_INVEST || process.env.UPPASS_API_KEY;
    const uppassApiUrl = process.env.UPPASS_API_URL_INVEST || process.env.UPPASS_API_URL || 'https://app.uppass.io'; // Corrected: Use app.uppass.io as per documentation

    console.log('UpPass Investor API Config:', {
      url: uppassApiUrl,
      fullUrl: `${uppassApiUrl}/${lang}/api/forms/${formSlug}/create/`,
      formSlug,
      apiKey: uppassApiKey ? uppassApiKey.substring(0, 10) + '...' : 'NOT_SET',
      hasFormSlug: !!formSlug,
      hasApiKey: !!uppassApiKey,
      usingPawnerFallback: !process.env.UPPASS_FORM_SLUG_INVEST
    });

    if (!formSlug) {
      throw new Error('UPPASS_FORM_SLUG or UPPASS_FORM_SLUG_INVEST environment variable is not set');
    }

    if (!uppassApiKey) {
      throw new Error('UPPASS_API_KEY or UPPASS_API_KEY_INVEST environment variable is not set');
    }

    const upPassResponse = await fetch(`${uppassApiUrl}/${lang}/api/forms/${formSlug}/create/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${uppassApiKey}`
      },
      body: JSON.stringify({
        answers: {
          // Optional: pass pre-filled answers if available
          ...(investor.firstname && { th_first_name: investor.firstname }),
          ...(investor.lastname && { th_last_name: investor.lastname }),
          ...(investor.national_id && { id_card_number: investor.national_id })
        }
      })
    });

    console.log('UpPass Response Status:', upPassResponse.status);
    console.log('UpPass Response Headers:', Object.fromEntries(upPassResponse.headers.entries()));

    // Check if response is HTML (error page) before trying to parse JSON
    const responseText = await upPassResponse.text();
    console.log('UpPass Raw Response:', responseText.substring(0, 500) + '...');

    let upPassData;
    try {
      upPassData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse UpPass response as JSON:', parseError);
      console.error('Response was:', responseText);
      throw new Error(`UpPass API returned non-JSON response: ${responseText.substring(0, 200)}`);
    }

    if (!upPassResponse.ok) {
      console.error('UpPass Investor Error:', upPassData);
      throw new Error('Failed to create verification session');
    }

    // 3. Extract form_url and slug from response
    const { form_url, detail } = upPassData;
    const sessionSlug = detail?.slug;

    if (!sessionSlug) {
      throw new Error('Invalid response from UpPass');
    }

    // 4. Update investor record with uppass_slug and set status to PENDING
    const { error: updateError } = await supabase
      .from('investors')
      .update({
        uppass_slug: sessionSlug,
        kyc_status: 'PENDING',
        updated_at: new Date().toISOString()
      })
      .eq('investor_id', investorId);

    if (updateError) {
      throw updateError;
    }

    // 5. Return the verification URL to frontend
    return NextResponse.json({
      success: true,
      url: form_url,
      sessionSlug
    });

  } catch (error: any) {
    console.error('Error initiating investor eKYC:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}