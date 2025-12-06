import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET_INVEST || 'ed704b15d57c8b84f09ebc3492f9339c';

// Verify LINE signature
function verifySignature(body: string, signature: string): boolean {
  const hash = crypto
    .createHmac('SHA256', CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  return hash === signature;
}

export async function POST(request: NextRequest) {
  try {
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
          // Handle incoming messages
          console.log('Message from investor:', event.message);
          // You can add auto-reply logic here if needed
          break;

        case 'follow':
          // User added the bot as friend
          console.log('New investor follower:', source.userId);
          // You can send welcome message here
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
