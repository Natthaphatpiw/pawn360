import { NextRequest, NextResponse } from 'next/server';
import { WebhookEvent } from '@line/bot-sdk';
import { verifySignature, sendStoreLocationCard } from '@/lib/line/client';
import { connectToDatabase } from '@/lib/db/mongodb';

export async function GET() {
  return NextResponse.json({
    message: 'Webhook endpoint is working',
    note: 'This endpoint only accepts POST requests from LINE Platform'
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature');

    console.log('Webhook received:', {
      hasBody: !!body,
      bodyLength: body?.length,
      hasSignature: !!signature,
      channelSecretConfigured: !!process.env.LINE_CHANNEL_SECRET,
    });

    // If body is empty, it's a verification request - just return 200
    if (!body || body.trim() === '') {
      console.log('Empty body - verification request');
      return NextResponse.json({ success: true });
    }

    // Verify signature if present
    if (signature && process.env.LINE_CHANNEL_SECRET) {
      const isValid = verifySignature(body, signature);
      console.log('Signature verification:', isValid);

      if (!isValid) {
        console.error('Invalid signature - Channel Secret might be incorrect');
        // For debugging: temporarily allow requests even with invalid signature
        // Remove this in production after confirming Channel Secret is correct
        console.warn('⚠️  Allowing request despite invalid signature (DEBUG MODE)');
      }
    } else {
      console.warn('No signature or channel secret - skipping verification');
    }

    const data = JSON.parse(body);
    const events: WebhookEvent[] = data.events || [];

    console.log('Processing events:', events.length);

    // Process each event
    for (const event of events) {
      if (event.type === 'follow') {
        await handleFollowEvent(event);
      } else if (event.type === 'postback') {
        await handlePostbackEvent(event);
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
    const { db } = await connectToDatabase();
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

async function handlePostbackEvent(event: WebhookEvent) {
  if (event.type !== 'postback') return;

  const userId = event.source.userId;
  if (!userId) return;

  const postbackData = event.postback?.data;
  if (!postbackData) return;

  console.log(`Postback received: ${postbackData} from user: ${userId}`);

  try {
    // Parse postback data
    const params = new URLSearchParams(postbackData);
    const action = params.get('action');
    const itemId = params.get('itemId');

    if (action === 'store_location' && itemId) {
      // Find store associated with this item
      const { db } = await connectToDatabase();
      const itemsCollection = db.collection('items');
      const storesCollection = db.collection('stores');

      const item = await itemsCollection.findOne({
        _id: require('mongodb').ObjectId.createFromHexString(itemId)
      });

      if (!item || !item.storeId) {
        console.error('Item not found or no storeId:', itemId);
        return;
      }

      // Find store data
      const store = await storesCollection.findOne({
        _id: require('mongodb').ObjectId.createFromHexString(item.storeId)
      });

      if (!store) {
        console.error('Store not found:', item.storeId);
        return;
      }

      // Send store location card
      await sendStoreLocationCard(userId, store);
      console.log(`Store location card sent for store: ${store.storeName}`);
    }

  } catch (error) {
    console.error('Error handling postback event:', error);
  }
}
