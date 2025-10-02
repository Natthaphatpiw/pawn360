import { NextRequest, NextResponse } from 'next/server';
import { WebhookEvent } from '@line/bot-sdk';
import { verifySignature } from '@/lib/line/client';
import { getDatabase } from '@/lib/db/mongodb';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature');

    if (!signature || !verifySignature(body, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const data = JSON.parse(body);
    const events: WebhookEvent[] = data.events;

    // Process each event
    for (const event of events) {
      if (event.type === 'follow') {
        await handleFollowEvent(event);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleFollowEvent(event: WebhookEvent) {
  if (event.type !== 'follow') return;

  const userId = event.source.userId;
  if (!userId) return;

  try {
    const db = await getDatabase();
    const customersCollection = db.collection('customers');

    // Check if user already exists
    const existingCustomer = await customersCollection.findOne({ lineId: userId });

    if (!existingCustomer) {
      // User doesn't exist - do nothing
      // They will see the default Rich Menu for new users
      console.log(`New user followed: ${userId}`);
    } else {
      // User already exists - Rich Menu will be set when they register
      console.log(`Existing user followed: ${userId}`);
    }
  } catch (error) {
    console.error('Error handling follow event:', error);
  }
}
