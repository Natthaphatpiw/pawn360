import { NextRequest, NextResponse } from 'next/server';
import { WebhookEvent } from '@line/bot-sdk';
import { Client, ClientConfig } from '@line/bot-sdk';

const storeConfig: ClientConfig = {
  channelAccessToken: process.env.LINE_STORE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_STORE_CHANNEL_SECRET || '',
};

const storeClient = new Client(storeConfig);

function verifyStoreSignature(body: string, signature: string): boolean {
  const crypto = require('crypto');
  const channelSecret = process.env.LINE_STORE_CHANNEL_SECRET || '';

  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');

  return hash === signature;
}

export async function GET() {
  return NextResponse.json({
    message: 'Store Webhook endpoint is working',
    note: 'This endpoint only accepts POST requests from LINE Platform (Store OA)'
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature');

    console.log('Store Webhook received:', {
      hasBody: !!body,
      bodyLength: body?.length,
      hasSignature: !!signature,
      channelSecretConfigured: !!process.env.LINE_STORE_CHANNEL_SECRET,
    });

    // If body is empty, it's a verification request - just return 200
    if (!body || body.trim() === '') {
      console.log('Empty body - verification request');
      return NextResponse.json({ success: true });
    }

    // Verify signature if present
    if (signature && process.env.LINE_STORE_CHANNEL_SECRET) {
      const isValid = verifyStoreSignature(body, signature);
      console.log('Store Signature verification:', isValid);

      if (!isValid) {
        console.error('Invalid signature - Store Channel Secret might be incorrect');
        console.warn('⚠️  Allowing request despite invalid signature (DEBUG MODE)');
      }
    } else {
      console.warn('No signature or channel secret - skipping verification');
    }

    const data = JSON.parse(body);
    const events: WebhookEvent[] = data.events || [];

    console.log('Processing store events:', events.length);

    // Process each event
    for (const event of events) {
      if (event.type === 'follow') {
        await handleStoreFollowEvent(event);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Store Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleStoreFollowEvent(event: WebhookEvent) {
  if (event.type !== 'follow') return;

  const userId = event.source.userId;
  if (!userId) return;

  try {
    console.log(`Store user followed: ${userId}`);

    // Send welcome message
    await storeClient.pushMessage(userId, {
      type: 'text',
      text: 'ยินดีต้อนรับสู่ระบบจัดการร้านจำนำ\n\nกรุณาลงทะเบียนร้านค้าผ่านเมนูด้านล่าง'
    });
  } catch (error) {
    console.error('Error handling store follow event:', error);
  }
}
