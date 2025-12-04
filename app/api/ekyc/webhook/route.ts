import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    
    console.log('eKYC Webhook Received:', JSON.stringify(payload, null, 2));

    // Extract data from webhook payload
    const eventType = payload.event?.type;
    const appData = payload.application;

    // Handle submit_form or update_status events
    if (eventType === 'submit_form' || eventType === 'update_status') {
      const receivedSlug = appData?.slug;
      const kycStatus = appData?.status; // 'accepted', 'rejected', 'review_needed'

      if (!receivedSlug) {
        return NextResponse.json(
          { error: 'Missing slug in payload' },
          { status: 400 }
        );
      }

      // Map UpPass status to our status
      let dbStatus = 'PENDING';
      if (kycStatus === 'accepted') {
        dbStatus = 'VERIFIED';
      } else if (kycStatus === 'rejected') {
        dbStatus = 'REJECTED';
      } else if (kycStatus === 'review_needed') {
        dbStatus = 'PENDING';
      }

      const supabase = supabaseAdmin();

      // Update pawner record
      const { data: pawner, error: updateError } = await supabase
        .from('pawners')
        .update({
          kyc_status: dbStatus,
          kyc_verified_at: dbStatus === 'VERIFIED' ? new Date().toISOString() : null,
          kyc_rejection_reason: appData?.other_status?.rejection_reason || null,
          kyc_data: appData, // Store full response
          updated_at: new Date().toISOString()
        })
        .eq('uppass_slug', receivedSlug)
        .select('customer_id, line_id, firstname, lastname, kyc_status')
        .single();

      if (updateError) {
        console.error('Supabase Update Error:', updateError);
        return NextResponse.json(
          { error: 'DB Update Failed' },
          { status: 500 }
        );
      }

      console.log(`Updated Pawner ${pawner?.customer_id} to status ${dbStatus}`);

      // Send LINE notification if verified
      if (dbStatus === 'VERIFIED' && pawner?.line_id) {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/line/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lineId: pawner.line_id,
              message: `🎉 ยืนยันตัวตนสำเร็จ!\n\nคุณ${pawner.firstname} ${pawner.lastname}\nสามารถเริ่มใช้งานระบบจำนำได้แล้ว`
            })
          });
        } catch (notifyError) {
          console.error('Failed to send LINE notification:', notifyError);
          // Don't fail the webhook if notification fails
        }
      }
    }

    // Always return 200 OK for webhooks
    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('Webhook Handler Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
