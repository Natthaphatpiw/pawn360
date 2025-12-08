import { NextRequest, NextResponse } from 'next/server';
import { Client, WebhookEvent, FlexMessage } from '@line/bot-sdk';
import { supabaseAdmin } from '@/lib/supabase/client';

// Drop Point LINE OA credentials
// Channel ID = 2008650799
const dropPointLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT || 'ji1K2C80ufvt/XsJZ5HiuP/vJxZaNy4th02C+/p6WdazVlWps/KdKTn3OHhH6B5fsJD5Exjio8tFjPPg80BIGS27t52Z2d9zm47/pOWxwqi3iJGOS7N8BDtJGH7Vsn78xnBOBSr3z4QAEn9n11WO5wdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET_DROPPOINT || '9f5767cfe8ecb9c068c6f25502eee416'
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const events: WebhookEvent[] = body.events;

    for (const event of events) {
      if (event.type === 'follow') {
        // New follower - send welcome message
        await handleFollow(event);
      } else if (event.type === 'message' && event.message.type === 'text') {
        // Handle text messages
        await handleTextMessage(event);
      } else if (event.type === 'postback') {
        // Handle postback actions
        await handlePostback(event);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Drop Point Webhook error:', error);
    return NextResponse.json({ success: true }); // Always return 200 to LINE
  }
}

async function handleFollow(event: WebhookEvent & { type: 'follow' }) {
  const userId = event.source.userId;
  if (!userId) return;

  const welcomeMessage = {
    type: 'flex' as const,
    altText: 'ยินดีต้อนรับสู่ Pawn360 Drop Point',
    contents: {
      type: 'bubble' as const,
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'ยินดีต้อนรับ! 🏪',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }],
        backgroundColor: '#365314',
        paddingAll: 'lg'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'ขอบคุณที่เข้าร่วมเป็น Drop Point กับ Pawn360',
          wrap: true,
          color: '#333333',
          size: 'sm'
        }, {
          type: 'text',
          text: 'กรุณาลงทะเบียนเพื่อเริ่มรับสินค้าจำนำ',
          wrap: true,
          color: '#666666',
          size: 'xs',
          margin: 'md'
        }]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button',
          action: {
            type: 'uri',
            label: 'ลงทะเบียน Drop Point',
            uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT || '2008651088-Ajw69zLb'}`
          },
          style: 'primary',
          color: '#365314'
        }]
      }
    }
  } as FlexMessage;

  try {
    await dropPointLineClient.pushMessage(userId, welcomeMessage);
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
}

async function handleTextMessage(event: WebhookEvent & { type: 'message'; message: { type: 'text'; text: string } }) {
  const userId = event.source.userId;
  const text = event.message.text.toLowerCase();
  if (!userId) return;

  // Simple command handling
  if (text === 'ลงทะเบียน' || text === 'register') {
    const registerMessage = {
      type: 'text' as const,
      text: `กรุณาลงทะเบียนที่ลิงก์นี้:\nhttps://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT || '2008651088-Ajw69zLb'}`
    };
    await dropPointLineClient.replyMessage(event.replyToken, registerMessage);
  }
}

async function handlePostback(event: WebhookEvent & { type: 'postback' }) {
  const userId = event.source.userId;
  const data = new URLSearchParams(event.postback.data);
  const action = data.get('action');
  const contractId = data.get('contractId');

  if (!userId) return;

  const supabase = supabaseAdmin();

  if (action === 'verify_item' && contractId) {
    // Send verification page link
    const verifyLink = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT || '2008651088-Ajw69zLb'}/droppoint-verify?contractId=${contractId}`;

    const message = {
      type: 'text' as const,
      text: `กรุณาตรวจสอบสินค้าที่ลิงก์นี้:\n${verifyLink}`
    };

    await dropPointLineClient.replyMessage(event.replyToken, message);
  }
}

// Verify LINE signature
export async function GET() {
  return NextResponse.json({ message: 'Drop Point Webhook is active' });
}
