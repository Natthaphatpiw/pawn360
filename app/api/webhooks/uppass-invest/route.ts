import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

// LINE Messaging API configuration for Investor
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || 'vkhbKJj/xMWX9RWJUPOfr6cfNa5N+jJhp7AX1vpK4poDpkCF4dy/3cPGy4+rmATi0KE9tD/ewmtYLd7nv+0651xY5L7Guy8LGvL1vhc9yuXWFy9wuGPvDQFGfWeva5WFPv2go4BrpP1j+ux63XjsEwdB04t89/1O/w1cDnyilFU=';

async function sendLineMessage(lineId: string, message: string) {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: lineId,
        messages: [
          {
            type: 'text',
            text: message
          }
        ]
      })
    });

    if (!response.ok) {
      console.error('Failed to send LINE message:', await response.text());
    }
  } catch (error) {
    console.error('Error sending LINE message:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('UpPass Investor Webhook received:', JSON.stringify(body, null, 2));

    const { event, data } = body;

    if (event === 'verification.completed' || event === 'form.submitted') {
      const { external_id, slug, status, verification_data } = data;

      if (!external_id) {
        console.error('No external_id found in webhook data');
        return NextResponse.json({ error: 'No external_id' }, { status: 400 });
      }

      const supabase = supabaseAdmin();

      // Get investor
      const { data: investor, error: investorError } = await supabase
        .from('investors')
        .select('*')
        .eq('investor_id', external_id)
        .single();

      if (investorError || !investor) {
        console.error('Investor not found:', external_id);
        return NextResponse.json({ error: 'Investor not found' }, { status: 404 });
      }

      // Determine KYC status
      let kycStatus = 'PENDING';
      let rejectionReason = null;

      if (status === 'approved' || status === 'verified') {
        kycStatus = 'VERIFIED';
      } else if (status === 'rejected' || status === 'failed') {
        kycStatus = 'REJECTED';
        rejectionReason = data.rejection_reason || 'ไม่ผ่านการตรวจสอบ กรุณาลองใหม่อีกครั้ง';
      }

      // Update investor
      const updateData: any = {
        kyc_status: kycStatus,
        kyc_data: verification_data || data,
        updated_at: new Date().toISOString()
      };

      if (kycStatus === 'VERIFIED') {
        updateData.kyc_verified_at = new Date().toISOString();
      }

      if (rejectionReason) {
        updateData.kyc_rejection_reason = rejectionReason;
      }

      const { error: updateError } = await supabase
        .from('investors')
        .update(updateData)
        .eq('investor_id', external_id);

      if (updateError) {
        console.error('Error updating investor:', updateError);
        throw updateError;
      }

      // Send LINE notification
      if (kycStatus === 'VERIFIED') {
        await sendLineMessage(
          investor.line_id,
          'ยินดีด้วยครับ การยืนยันตัวตนสำเร็จแล้ว คุณสามารถลงทุนบนแพลตฟอร์มของ Pawnly ได้แล้ว 🎉'
        );
      } else if (kycStatus === 'REJECTED') {
        await sendLineMessage(
          investor.line_id,
          `การยืนยันตัวตนไม่สำเร็จ: ${rejectionReason}\n\nกรุณาลองยืนยันตัวตนอีกครั้ง`
        );
      }

      console.log(`Investor ${external_id} KYC status updated to ${kycStatus}`);

      return NextResponse.json({
        success: true,
        message: 'Webhook processed successfully'
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Event not handled'
    });

  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Allow UpPass to send webhooks
export const runtime = 'nodejs';
