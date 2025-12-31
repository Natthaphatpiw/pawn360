import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client } from '@line/bot-sdk';
import crypto from 'crypto';

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET_INVEST;

const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: CHANNEL_SECRET || ''
});

// Verify LINE signature
function verifySignature(body: string, signature: string): boolean {
  if (!CHANNEL_SECRET) return false;
  const hash = crypto
    .createHmac('SHA256', CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  return hash === signature;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || !CHANNEL_SECRET) {
      console.error('LINE invest webhook is not configured (missing token/secret)');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    // Get signature from header
    const signature = request.headers.get('x-line-signature');

    if (!signature) {
      console.error('No signature provided');
      return NextResponse.json({ error: 'No signature' }, { status: 401 });
    }

    // Get raw body for signature verification
    const rawBody = await request.text();

    // Verify signature
    if (!verifySignature(rawBody, signature)) {
      console.error('Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse body
    const body = JSON.parse(rawBody);
    console.log('LINE Investor Webhook received:', JSON.stringify(body, null, 2));

    const { events } = body;

    if (!events || events.length === 0) {
      return NextResponse.json({ message: 'No events' });
    }

    // Process events
    for (const event of events) {
      const { type, replyToken, source } = event;

      // Handle different event types
      switch (type) {
        case 'message':
          // Handle incoming messages from investors
          console.log('Message from investor:', event.message);

          // Check if investor exists and get their KYC status
          try {
            const supabase = supabaseAdmin();
            const { data: investor } = await supabase
              .from('investors')
              .select('firstname, lastname, kyc_status, investor_id')
              .eq('line_id', source.userId)
              .single();

            if (investor) {
              let replyMessage = '';

              if (investor.kyc_status === 'VERIFIED') {
                replyMessage = `สวัสดีครับ คุณ${investor.firstname} ${investor.lastname}\n\nการยืนยันตัวตนของคุณเสร็จสิ้นแล้ว คุณสามารถลงทุนได้แล้ว\n\nกดที่นี่เพื่อเข้าสู่ระบบลงทุน:`;
              } else if (investor.kyc_status === 'PENDING') {
                replyMessage = `สวัสดีครับ คุณ${investor.firstname} ${investor.lastname}\n\nข้อมูลการยืนยันตัวตนของคุณอยู่ระหว่างการตรวจสอบ\nกรุณารอผลการตรวจสอบ`;
              } else if (investor.kyc_status === 'REJECTED') {
                replyMessage = `สวัสดีครับ คุณ${investor.firstname} ${investor.lastname}\n\nการยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง\n\nกดที่นี่เพื่อเริ่มยืนยันตัวตน:`;
              } else {
                // NOT_VERIFIED or other status
                replyMessage = `สวัสดีครับ คุณ${investor.firstname} ${investor.lastname}\n\nคุณยังไม่ได้ยืนยันตัวตน กรุณาทำการยืนยันตัวตนก่อน\n\nกดที่นี่เพื่อเริ่มยืนยันตัวตน:`;
              }

              // Send reply using LINE Bot SDK
              if (replyToken) {
                await lineClient.replyMessage(replyToken, {
                  type: 'text',
                  text: replyMessage
                });
              }
            } else {
              // Investor not found in database
              const replyMessage = `สวัสดีครับ\n\nดูเหมือนคุณยังไม่ได้ลงทะเบียนเป็นนักลงทุน\nกรุณาลงทะเบียนก่อน:\n\nลงทะเบียนนักลงทุน:`;

              if (replyToken) {
                await lineClient.replyMessage(replyToken, {
                  type: 'text',
                  text: replyMessage
                });
              }
            }
          } catch (error) {
            console.error('Error handling investor message:', error);
            // Send generic error message
            if (replyToken) {
              await lineClient.replyMessage(replyToken, {
                type: 'text',
                text: 'ขออภัย เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง'
              });
            }
          }
          break;

        case 'follow':
          // User added the bot as friend
          console.log('New investor follower:', source.userId);

          // Send welcome message
          try {
            const welcomeMessage = `ยินดีต้อนรับสู่ Pawnly Investor\n\nเพื่อเริ่มลงทุน คุณต้องทำการยืนยันตัวตนก่อน\n\nกดที่นี่เพื่อลงทะเบียน:`;

            await lineClient.pushMessage(source.userId, {
              type: 'text',
              text: welcomeMessage
            });
          } catch (error) {
            console.error('Error sending welcome message:', error);
          }
          break;

        case 'unfollow':
          // User removed the bot
          console.log('Investor unfollowed:', source.userId);
          break;

        case 'join':
          // Bot joined a group/room
          console.log('Bot joined:', source);
          break;

        case 'leave':
          // Bot left a group/room
          console.log('Bot left:', source);
          break;

        case 'postback':
          // Handle postback data
          console.log('Postback from investor:', event.postback);
          break;

        default:
          console.log('Unhandled event type:', type);
      }
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('LINE Investor webhook error:', error);
    // Still return 200 to prevent LINE from retrying
    return NextResponse.json({
      success: false,
      error: error.message
    });
  }
}

// Handle GET requests (for verification)
export async function GET() {
  return NextResponse.json({
    message: 'LINE Investor Webhook endpoint is active',
    channel: 'investor'
  });
}

// Allow POST and GET methods
export const runtime = 'nodejs';
