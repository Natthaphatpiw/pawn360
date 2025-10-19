import { NextRequest, NextResponse } from 'next/server';
import { WebhookEvent } from '@line/bot-sdk';
import axios from 'axios';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LIFF_CONTRACT_DETAIL_URL = 'https://liff.line.me/2008216710-gn6BwQjo';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const events: WebhookEvent[] = body.events;

    for (const event of events) {
      // Handle postback events (for "ที่ตั้งร้าน" button)
      if (event.type === 'postback') {
        const data = event.postback.data;
        const params = new URLSearchParams(data);
        const action = params.get('action');

        if (action === 'store_location') {
          const storeId = params.get('storeId');
          const contractId = params.get('contractId');

          if (storeId && contractId) {
            await sendStoreLocation(event.source.userId!, storeId, contractId);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function sendStoreLocation(userId: string, storeId: string, contractId: string) {
  try {
    const { db } = await connectToDatabase();
    const storesCollection = db.collection('stores');

    const store = await storesCollection.findOne({ _id: new ObjectId(storeId) });

    if (!store) {
      console.error('Store not found:', storeId);
      return;
    }

    // Build address text
    const addressText = `${store.address.houseNumber || ''} ${store.address.street || ''} ${store.address.subDistrict || ''} ${store.address.district || ''} ${store.address.province || ''} ${store.address.postcode || ''}`.trim();

    // Create Location Flex Message
    const locationMessage = {
      type: 'flex',
      altText: `ที่ตั้งร้าน ${store.storeName}`,
      contents: {
        type: 'bubble',
        styles: {
          header: {
            backgroundColor: '#0A4215'
          },
          body: {
            backgroundColor: '#F0EFEF'
          },
          footer: {
            backgroundColor: '#FFFFFF'
          }
        },
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📍 ที่ตั้งร้าน',
              weight: 'bold',
              size: 'lg',
              color: '#FFFFFF',
              align: 'center'
            }
          ],
          paddingAll: '16px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: store.storeName,
              weight: 'bold',
              size: 'md',
              color: '#0A4215',
              wrap: true
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: 'ที่อยู่:',
                  size: 'sm',
                  color: '#333333',
                  weight: 'bold',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: addressText,
                  size: 'sm',
                  color: '#666666',
                  wrap: true,
                  margin: 'xs'
                }
              ]
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: 'เบอร์โทร:',
                  size: 'sm',
                  color: '#333333',
                  weight: 'bold',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: store.phone || 'ไม่ระบุ',
                  size: 'sm',
                  color: '#0A4215',
                  margin: 'xs'
                }
              ]
            }
          ],
          paddingAll: '16px',
          spacing: 'sm'
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'primary',
              action: {
                type: 'uri',
                label: 'เปิด Google Maps',
                uri: store.googleMap || 'https://maps.google.com'
              },
              color: '#0A4215',
              height: 'sm'
            },
            {
              type: 'button',
              style: 'secondary',
              action: {
                type: 'uri',
                label: 'กลับไปดูสัญญา',
                uri: `${LIFF_CONTRACT_DETAIL_URL}?contractId=${contractId}`
              },
              color: '#666666',
              height: 'sm',
              margin: 'sm'
            }
          ],
          paddingAll: '16px',
          spacing: 'sm'
        }
      }
    };

    // Send message
    await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to: userId,
        messages: [locationMessage]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        }
      }
    );

    console.log('Store location sent successfully');

  } catch (error) {
    console.error('Error sending store location:', error);
  }
}
