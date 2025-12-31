import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client } from '@line/bot-sdk';
import crypto from 'crypto';

const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

// Verify webhook signature (if UpPass provides signature header)
function verifyWebhookSignature(payload: string, signature: string | null): boolean {
  if (!signature) return true; // Skip verification if no signature

  const secret = process.env.UPPASS_WEBHOOK_SECRET;
  if (!secret) return true; // Skip if no secret configured

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);

    // Optional: Verify webhook signature
    const signature = request.headers.get('x-uppass-signature');
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    console.log('eKYC Webhook Received:', JSON.stringify(payload, null, 2));

    // Extract data from webhook payload
    const eventType = payload.event?.type;
    const appData = payload.application;
    const extraData = payload.extra;
    const answers = payload.answers;

    // Handle different event types
    if (eventType === 'submit_form' || eventType === 'update_status') {
      const receivedSlug = appData?.slug;
      const kycStatus = appData?.status; // 'accepted', 'rejected', 'review_needed'
      const ekycStatus = appData?.other_status?.ekyc;

      if (!receivedSlug) {
        console.error('Missing slug in payload');
        return NextResponse.json(
          { error: 'Missing slug in payload' },
          { status: 400 }
        );
      }

      // Map UpPass status to our status
      let dbStatus = 'PENDING';
      let rejectionReason = null;

      // UpPass sends: status: "complete", other_status.ekyc: "pass"/"fail"
      if (kycStatus === 'complete' && ekycStatus === 'pass') {
        dbStatus = 'VERIFIED';
      } else if (kycStatus === 'complete' && ekycStatus === 'fail') {
        dbStatus = 'REJECTED';
        rejectionReason = 'eKYC verification failed';
      } else if (kycStatus === 'accepted') {
        dbStatus = 'VERIFIED'; // Legacy support
      } else if (kycStatus === 'rejected') {
        dbStatus = 'REJECTED';
        if (ekycStatus) {
          rejectionReason = `eKYC Status: ${ekycStatus}`;
        }
      } else if (kycStatus === 'review_needed') {
        dbStatus = 'PENDING';
      }

      const supabase = supabaseAdmin();

      // Prepare kyc_data with full information
      const kycData = {
        application: appData,
        extra: extraData,
        answers: answers,
        event: payload.event,
        processed_at: new Date().toISOString()
      };

      // Update pawner record
      const { data: pawner, error: updateError } = await supabase
        .from('pawners')
        .update({
          kyc_status: dbStatus,
          kyc_verified_at: dbStatus === 'VERIFIED' ? new Date().toISOString() : null,
          kyc_rejection_reason: rejectionReason,
          kyc_data: kycData,
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

      console.log(`✅ Updated Pawner ${pawner?.customer_id} to status ${dbStatus}`);

      // Send LINE notification based on status
      if (pawner?.line_id) {
        let message = '';

        if (dbStatus === 'VERIFIED') {
          message = `ยืนยันตัวตนสำเร็จ\n\nคุณ${pawner.firstname} ${pawner.lastname}\nสามารถเริ่มใช้งานระบบจำนำ P2P ได้แล้ว\n\nกดที่นี่เพื่อเริ่มจำนำสินค้า`;
        } else if (dbStatus === 'REJECTED') {
          message = `การยืนยันตัวตนไม่สำเร็จ\n\nเหตุผล: ${rejectionReason || 'ไม่สามารถยืนยันตัวตนได้'}\n\nกรุณาลองใหม่อีกครั้ง`;
        } else if (dbStatus === 'PENDING') {
          message = `รอการตรวจสอบ\n\nข้อมูลการยืนยันตัวตนของคุณอยู่ระหว่างการตรวจสอบ\nเราจะแจ้งให้ทราบเมื่อเสร็จสิ้น`;
        }

        if (message) {
          try {
            // Send LINE message directly using LINE Bot SDK
            await lineClient.pushMessage(pawner.line_id, {
              type: 'text',
              text: message
            });
            console.log(`📱 LINE notification sent to ${pawner.line_id}`);
          } catch (notifyError) {
            console.error('Failed to send LINE notification:', notifyError);
            // Don't fail the webhook if notification fails
          }
        }
      }
    } else if (eventType === 'drop_off') {
      // Handle drop off - user didn't complete verification
      console.log('⚠️ User dropped off verification');
      const receivedSlug = appData?.slug;
      if (receivedSlug) {
        const supabase = supabaseAdmin();
        await supabase
          .from('pawners')
          .update({
            kyc_status: 'NOT_VERIFIED',
            kyc_data: { event: 'drop_off', timestamp: new Date().toISOString() }
          })
          .eq('uppass_slug', receivedSlug);
      }
    } else if (eventType === 'ekyc_front_card_reached_max_attempts' ||
               eventType === 'ekyc_liveness_reached_max_attempt') {
      // Handle max attempts reached
      console.log(`⚠️ Max attempts reached: ${eventType}`);
      const receivedSlug = appData?.slug;
      if (receivedSlug) {
        const supabase = supabaseAdmin();
        const { data: pawner } = await supabase
          .from('pawners')
          .update({
            kyc_status: 'REJECTED',
            kyc_rejection_reason: `Max attempts reached: ${eventType}`,
            kyc_data: { event: eventType, timestamp: new Date().toISOString() }
          })
          .eq('uppass_slug', receivedSlug)
          .select('line_id, firstname, lastname')
          .single();

        // Notify user
        if (pawner?.line_id) {
          try {
            await lineClient.pushMessage(pawner.line_id, {
              type: 'text',
              text: `การยืนยันตัวตนไม่สำเร็จ\n\nครบจำนวนครั้งที่พยายามแล้ว\nกรุณาติดต่อฝ่ายสนับสนุน`
            });
          } catch (error) {
            console.error('Failed to send notification:', error);
          }
        }
      }
    }

    // Always return 200 OK for webhooks
    return NextResponse.json({
      received: true,
      event_type: eventType,
      processed_at: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Webhook Handler Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
