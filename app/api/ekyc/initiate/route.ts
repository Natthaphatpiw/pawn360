import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId } = body;

    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // 1. Get customer data
    const { data: pawner, error: pawnerError } = await supabase
      .from('pawners')
      .select('*')
      .eq('customer_id', customerId)
      .single();

    if (pawnerError || !pawner) {
      return NextResponse.json(
        { error: 'Pawner not found' },
        { status: 404 }
      );
    }

    // 2. Call UpPass API to create eKYC session
    const lang = 'th';
    const formSlug = process.env.UPPASS_FORM_SLUG;
    const uppassApiKey = process.env.UPPASS_API_KEY;
    const uppassApiUrl = process.env.UPPASS_API_URL || 'https://api.uppass.io';

    if (!formSlug || !uppassApiKey) {
      throw new Error('UpPass configuration missing');
    }

    const upPassResponse = await fetch(`${uppassApiUrl}/${lang}/api/forms/${formSlug}/create/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${uppassApiKey}`
      },
      body: JSON.stringify({
        answers: {
          th_first_name: pawner.firstname || '',
          th_last_name: pawner.lastname || '',
          id_card_number: pawner.national_id || ''
        }
      })
    });

    const upPassData = await upPassResponse.json();

    if (!upPassResponse.ok) {
      console.error('UpPass Error:', upPassData);
      throw new Error('Failed to create verification session');
    }

    // 3. Extract form_url and slug from response
    const { form_url, detail } = upPassData;
    const sessionSlug = detail?.slug;

    if (!sessionSlug) {
      throw new Error('Invalid response from UpPass');
    }

    // 4. Update pawner record with uppass_slug and set status to PENDING
    const { error: updateError } = await supabase
      .from('pawners')
      .update({
        uppass_slug: sessionSlug,
        kyc_status: 'PENDING',
        updated_at: new Date().toISOString()
      })
      .eq('customer_id', customerId);

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
    console.error('Error initiating eKYC:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
