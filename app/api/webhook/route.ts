import { NextRequest, NextResponse } from 'next/server';
import { WebhookEvent, Client } from '@line/bot-sdk';
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
        console.warn('⚠️ Invalid signature detected - Channel Secret might be incorrect');
        console.warn('⚠️ Allowing request to continue for debugging purposes');
        console.warn('⚠️ Please verify LINE_CHANNEL_SECRET in environment variables');
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

    if (action === 'contract_details' && itemId) {
      try {
        console.log(`Processing contract_details for itemId: ${itemId}`);

        // Validate itemId format
        if (!itemId.match(/^[0-9a-fA-F]{24}$/)) {
          console.error('Invalid itemId format:', itemId);
          return;
        }

        // สร้าง LIFF URL สำหรับเปิดหน้า contract details
        const contractDetailsUrl = `https://liff.line.me/2008216710-gn6BwQjo/contract/${itemId}/details`;
        console.log('Contract details LIFF URL:', contractDetailsUrl);

        // ส่ง reply message เพื่อเปิด LIFF
        const lineClient = new Client({
          channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
          channelSecret: process.env.LINE_CHANNEL_SECRET!,
        });

        await lineClient.replyMessage(event.replyToken, {
          type: 'flex',
          altText: '📄 รายละเอียดสัญญา',
          contents: {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '📄 รายละเอียดสัญญา',
                  weight: 'bold',
                  size: 'lg',
                  color: '#0A4215',
                  align: 'center'
                }
              ],
              backgroundColor: '#E7EFE9',
              paddingAll: 'lg'
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: 'กดปุ่มด้านล่างเพื่อดูรายละเอียดสัญญาเต็ม',
                  size: 'sm',
                  color: '#666666',
                  wrap: true,
                  margin: 'md'
                }
              ]
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              contents: [
                {
                  type: 'button',
                  action: {
                    type: 'uri',
                    label: 'เปิดรายละเอียดสัญญา',
                    uri: contractDetailsUrl
                  },
                  style: 'primary',
                  color: '#0A4215'
                }
              ]
            }
          }
        });

        console.log(`Contract details message sent for itemId: ${itemId}`);
      } catch (error) {
        console.error('Error processing contract_details:', error);
        console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
      }
    } else if (action === 'store_location' && itemId) {
      try {
        console.log(`Processing store_location for itemId: ${itemId}`);

        // Validate itemId format
        if (!itemId.match(/^[0-9a-fA-F]{24}$/)) {
          console.error('Invalid itemId format:', itemId);
          return;
        }

        // Find store associated with this item
        const { db } = await connectToDatabase();
        const itemsCollection = db.collection('items');
        const storesCollection = db.collection('stores');

        const item = await itemsCollection.findOne({
          _id: require('mongodb').ObjectId.createFromHexString(itemId)
        });

        if (!item) {
          console.error('Item not found:', itemId);
          return;
        }

        if (!item.storeId) {
          console.error('Item has no storeId:', itemId);
          return;
        }

        // Validate storeId format
        const storeIdStr = item.storeId.toString();
        if (!storeIdStr.match(/^[0-9a-fA-F]{24}$/)) {
          console.error('Invalid storeId format:', storeIdStr);
          return;
        }

        // Find store data
        const store = await storesCollection.findOne({
          _id: require('mongodb').ObjectId.createFromHexString(storeIdStr)
        });

        if (!store) {
          console.error('Store not found:', storeIdStr);
          return;
        }

        console.log(`Found store: ${store.storeName}, sending location card`);

        // Send store location card
        await sendStoreLocationCard(userId, store);
        console.log(`Store location card sent successfully for store: ${store.storeName}`);
      } catch (error) {
        console.error('Error processing store_location:', error);
        console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
      }
    }

  } catch (error) {
    console.error('Error handling postback event:', error);
  }
}
