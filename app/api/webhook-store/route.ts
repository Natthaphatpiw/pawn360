import { NextRequest, NextResponse } from 'next/server';
import { WebhookEvent } from '@line/bot-sdk';
import { Client, ClientConfig } from '@line/bot-sdk';
import { verifyLineSignatureWithSecret } from '@/lib/security/line';
import {
  claimWebhookEvent,
  completeWebhookClaim,
  readBoundedWebhookText,
  releaseWebhookClaim,
  webhookReplayErrorResponse,
} from '@/lib/security/webhook-replay';

// Lazy initialization of LINE client
let storeClient: Client | null = null;

function getStoreClient(): Client {
  if (!storeClient) {
    const allowSharedChannel = process.env.LINE_STORE_ALLOW_SHARED_CHANNEL === 'true';
    const channelAccessToken = process.env.LINE_STORE_CHANNEL_ACCESS_TOKEN
      || (allowSharedChannel ? process.env.LINE_CHANNEL_ACCESS_TOKEN : '');
    const channelSecret = process.env.LINE_STORE_CHANNEL_SECRET
      || (allowSharedChannel ? process.env.LINE_CHANNEL_SECRET : '');

    if (!channelAccessToken || !channelSecret) {
      throw new Error('LINE channel access token or secret not configured');
    }

    const storeConfig: ClientConfig = {
      channelAccessToken,
      channelSecret,
    };

    storeClient = new Client(storeConfig);
  }
  return storeClient;
}

export async function GET() {
  return NextResponse.json({
    message: 'Store Webhook endpoint is working',
    note: 'This endpoint only accepts POST requests from LINE Platform (Store OA)'
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedWebhookText(request);
    const signature = request.headers.get('x-line-signature');
    const channelSecret = process.env.LINE_STORE_CHANNEL_SECRET
      || (process.env.LINE_STORE_ALLOW_SHARED_CHANNEL === 'true'
        ? process.env.LINE_CHANNEL_SECRET
        : '')
      || '';

    if (!channelSecret) {
      console.error('[store:webhook] channel secret is not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    if (!signature || !verifyLineSignatureWithSecret(body, signature, channelSecret)) {
      console.warn('[store:webhook] rejected invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (!body) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    let data: { events?: unknown };
    try {
      data = JSON.parse(body) as { events?: unknown };
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    const events = Array.isArray(data.events) ? data.events as WebhookEvent[] : [];
    if (events.length > 100) {
      return NextResponse.json({ error: 'Too many events' }, { status: 400 });
    }

    for (const event of events) {
      const webhookEventId = (event as WebhookEvent & { webhookEventId?: unknown }).webhookEventId;
      const claim = await claimWebhookEvent({
        namespace: 'line-store',
        material: typeof webhookEventId === 'string' ? webhookEventId : JSON.stringify(event),
        signingSecret: channelSecret,
      });
      if (claim.duplicate) continue;
      try {
        if (event.type === 'follow') {
          await handleStoreFollowEvent(event);
        }
        await completeWebhookClaim(claim);
      } catch (error) {
        await releaseWebhookClaim(claim);
        throw error;
      }
    }

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const replayError = webhookReplayErrorResponse(error);
    if (replayError) return replayError;
    console.error('[store:webhook] processing failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

async function handleStoreFollowEvent(event: WebhookEvent) {
  if (event.type !== 'follow') return;

  const userId = event.source.userId;
  if (!userId) return;

  const client = getStoreClient();
  await client.pushMessage(userId, {
    type: 'text',
    text: 'ยินดีต้อนรับสู่ระบบจัดการจุดรับฝาก\n\nกรุณาลงทะเบียนร้านค้าผ่านเมนูด้านล่าง'
  });
}
