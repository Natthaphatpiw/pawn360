import { Client, ClientConfig, WebhookEvent, FlexMessage } from '@line/bot-sdk';
import axios from 'axios';

// Lazy initialization of LINE client
let lineClient: Client | null = null;

function getLineClient(): Client {
  if (!lineClient) {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!channelAccessToken || !channelSecret) {
      throw new Error('LINE channel access token or secret not configured');
    }

    const config: ClientConfig = {
      channelAccessToken,
      channelSecret,
    };

    lineClient = new Client(config);
  }
  return lineClient;
}

// Link Rich Menu to User
export async function linkRichMenuToUser(userId: string, richMenuId: string) {
  try {
    const client = getLineClient();
    await client.linkRichMenuToUser(userId, richMenuId);
    return { success: true };
  } catch (error) {
    console.error('Error linking rich menu:', error);
    throw error;
  }
}

// Send Negotiation Message
export async function sendNegotiationMessage(
  userId: string,
  itemId: string,
  amount: number,
  days: number,
  interestRate: number,
  interest: number,
  totalAmount: number,
  qrUrl: string
) {
  try {
    const liffId = process.env.LIFF_ID_PAWN || '2008216710-54P86MRY';
    const acceptUrl = `https://liff.line.me/${liffId}/pawn/accept-negotiation?itemId=${itemId}`;

    const client = getLineClient();
    await client.pushMessage(userId, {
      type: 'flex',
      altText: '🔄 ร้านค้าได้แก้ไขเงื่อนไขการจำนำ',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🔄 แก้ไขเงื่อนไขการจำนำ',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff',
            },
          ],
          backgroundColor: '#FF9800',
          paddingAll: 'lg',
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'ร้านค้าได้เสนอเงื่อนไขใหม่ดังนี้',
              size: 'md',
              wrap: true,
              margin: 'md',
            },
            {
              type: 'separator',
              margin: 'lg',
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '1. ราคาจำนำ',
                      color: '#666666',
                      size: 'sm',
                      flex: 0,
                    },
                    {
                      type: 'text',
                      text: `${amount.toLocaleString()} บาท`,
                      wrap: true,
                      color: '#1DB446',
                      size: 'md',
                      weight: 'bold',
                      flex: 0,
                      align: 'end',
                    },
                  ],
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '2. จำนวนวัน',
                      color: '#666666',
                      size: 'sm',
                      flex: 0,
                    },
                    {
                      type: 'text',
                      text: `${days} วัน`,
                      wrap: true,
                      color: '#666666',
                      size: 'md',
                      weight: 'bold',
                      flex: 0,
                      align: 'end',
                    },
                  ],
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '3. ดอกเบี้ย',
                      color: '#666666',
                      size: 'sm',
                      flex: 0,
                    },
                    {
                      type: 'text',
                      text: `${interestRate}%/เดือน`,
                      wrap: true,
                      color: '#666666',
                      size: 'md',
                      weight: 'bold',
                      flex: 0,
                      align: 'end',
                    },
                  ],
                },
                {
                  type: 'separator',
                  margin: 'md',
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  margin: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: '4. ยอดไถ่ถอน',
                      color: '#666666',
                      size: 'sm',
                      flex: 0,
                    },
                    {
                      type: 'text',
                      text: `${totalAmount.toLocaleString()} บาท`,
                      wrap: true,
                      color: '#E91E63',
                      size: 'xl',
                      weight: 'bold',
                      flex: 0,
                      align: 'end',
                    },
                  ],
                },
                {
                  type: 'text',
                  text: `(${amount.toLocaleString()} + ${interest.toLocaleString()})`,
                  size: 'xs',
                  color: '#999999',
                  align: 'end',
                },
              ],
            },
          ],
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
                label: '✅ ตกลง',
                uri: acceptUrl,
              },
              style: 'primary',
              color: '#1DB446',
            },
            {
              type: 'text',
              text: 'กดตกลงเพื่อยืนยันเงื่อนไขใหม่',
              size: 'xxs',
              color: '#999999',
              align: 'center',
              margin: 'sm',
            },
          ],
        },
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending negotiation message:', error);
    throw error;
  }
}

// Send Push Message with QR Code
export async function sendQRCodeImage(userId: string, itemId: string, s3Url: string) {
  try {
    // ส่ง Flex Message พร้อมรูป QR Code จาก S3
    const client = getLineClient();
    await client.pushMessage(userId, {
      type: 'flex',
      altText: '✅ สร้างรายการจำนำสำเร็จ - ดู QR Code',
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: s3Url,
          size: 'full',
          aspectRatio: '1:1',
          aspectMode: 'cover',
          action: {
            type: 'uri',
            label: 'ดู QR Code',
            uri: s3Url,
          },
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'สร้างรายการจำนำสำเร็จ',
              weight: 'bold',
              size: 'xl',
              color: '#1DB446',
              wrap: true,
            },
            {
              type: 'text',
              text: 'นำ QR Code ไปแสดงที่ร้านค้า',
              size: 'sm',
              color: '#666666',
              margin: 'md',
              wrap: true,
            },
            {
              type: 'separator',
              margin: 'xl',
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: '📱 วิธีใช้งาน',
                  color: '#1DB446',
                  size: 'sm',
                  weight: 'bold',
                },
                {
                  type: 'text',
                  text: '1. กดปุ่ม "ดู QR Code" ด้านล่าง',
                  size: 'xs',
                  color: '#666666',
                  wrap: true,
                  margin: 'sm',
                },
                {
                  type: 'text',
                  text: '2. แสดง QR Code ให้พนักงานร้าน',
                  size: 'xs',
                  color: '#666666',
                  wrap: true,
                },
                {
                  type: 'text',
                  text: '3. พนักงานจะแสกนเพื่อสร้างสัญญา',
                  size: 'xs',
                  color: '#666666',
                  wrap: true,
                },
              ],
            },
          ],
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
                label: 'เปิดรูป QR Code ขนาดใหญ่',
                uri: s3Url,
              },
              style: 'primary',
              color: '#1DB446',
              height: 'sm',
            },
            {
              type: 'text',
              text: `รหัส: ${itemId.substring(0, 8)}...`,
              size: 'xxs',
              color: '#999999',
              align: 'center',
              margin: 'sm',
            },
          ],
        },
      },
    });
    return { success: true };
  } catch (error) {
    console.error('Error sending QR code:', error);
    throw error;
  }
}

// Send Contract Completion Notification
export async function sendContractCompletionNotification(
  userId: string,
  contractData: any,
  itemData: any
) {
  try {
    const client = getLineClient();

    console.log('Sending contract notification for item:', itemData._id, 'user:', userId);

    // คำนวณวันครบกำหนด
    const startDate = new Date();
    const dueDate = new Date(startDate);
    dueDate.setDate(dueDate.getDate() + (contractData.periodDays || 30));

    const dueDateString = dueDate.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // สร้างเลขที่สัญญา
    const contractNumber = `STORE${Date.now()}`;

    // สร้าง LIFF URL สำหรับรายละเอียดสัญญา
    const itemId = itemData._id.toString();
    const contractDetailsUrl = `https://liff.line.me/2008216710-gn6BwQjo/contract/${itemId}/details`;
    console.log('Contract details URL:', contractDetailsUrl);

    const flexMessage = {
      type: 'flex',
      altText: `✅ สัญญาจำนำเลขที่ ${contractNumber} ได้ถูกสร้างเรียบร้อยแล้ว`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: itemData.brand ? `${itemData.brand} ${itemData.model || ''}` : 'สินค้าจำนำ',
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
              text: '✅ สัญญาจำนำได้ถูกสร้างเรียบร้อยแล้ว',
              size: 'md',
              color: '#0A4215',
              weight: 'bold',
              wrap: true,
              margin: 'md'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: 'เลขที่สัญญา:',
                      color: '#666666',
                      size: 'sm',
                      flex: 0
                    },
                    {
                      type: 'text',
                      text: contractNumber,
                      wrap: true,
                      color: '#0A4215',
                      size: 'sm',
                      weight: 'bold',
                      flex: 0,
                      align: 'end'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: 'จำนวนเงิน:',
                      color: '#666666',
                      size: 'sm',
                      flex: 0
                    },
                    {
                      type: 'text',
                      text: `${contractData.price?.toLocaleString() || '0'} บาท`,
                      wrap: true,
                      color: '#0A4215',
                      size: 'sm',
                      weight: 'bold',
                      flex: 0,
                      align: 'end'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: 'อัตราดอกเบี้ย:',
                      color: '#666666',
                      size: 'sm',
                      flex: 0
                    },
                    {
                      type: 'text',
                      text: `${contractData.interestRate || 10}%`,
                      wrap: true,
                      color: '#666666',
                      size: 'sm',
                      weight: 'bold',
                      flex: 0,
                      align: 'end'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: 'ระยะเวลา:',
                      color: '#666666',
                      size: 'sm',
                      flex: 0
                    },
                    {
                      type: 'text',
                      text: `${contractData.periodDays || 30} วัน`,
                      wrap: true,
                      color: '#666666',
                      size: 'sm',
                      weight: 'bold',
                      flex: 0,
                      align: 'end'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: 'วันครบกำหนด:',
                      color: '#666666',
                      size: 'sm',
                      flex: 0
                    },
                    {
                      type: 'text',
                      text: dueDateString,
                      wrap: true,
                      color: '#0A4215',
                      size: 'sm',
                      weight: 'bold',
                      flex: 0,
                      align: 'end'
                    }
                  ]
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              action: {
                type: 'postback',
                label: 'รายละเอียดสัญญา',
                data: `action=contract_details&itemId=${itemId}`
              },
              color: '#0A4215',
              flex: 1
            },
            {
              type: 'button',
              style: 'secondary',
              action: {
                type: 'postback',
                label: 'ที่ตั้งร้าน',
                data: `action=store_location&itemId=${itemData._id}`
              },
              color: '#F0EFEF',
              flex: 1
            }
          ]
        }
      }
    };

    await client.pushMessage(userId, flexMessage as FlexMessage);
    return { success: true, contractNumber };
  } catch (error) {
    console.error('Error sending contract completion notification:', error);
    throw error;
  }
}

// Send Store Location Card
export async function sendStoreLocationCard(userId: string, storeData: any) {
  try {
    const client = getLineClient();

    console.log('Sending store location card for:', storeData.storeName);
    console.log('Store address data:', storeData.address);

    // Build address string
    const addressParts = [
      storeData.address?.houseNumber,
      storeData.address?.street,
      storeData.address?.subDistrict,
      storeData.address?.district,
      storeData.address?.province,
      storeData.address?.postcode
    ].filter(part => part && part.trim());

    const fullAddress = addressParts.join(' ').trim();

    console.log('Built address:', fullAddress);

    // Build Google Maps URL
    const googleMapsQuery = encodeURIComponent(fullAddress);
    const googleMapsUrl = storeData.googleMapUrl || `https://maps.google.com/?q=${googleMapsQuery}`;

    console.log('Google Maps URL:', googleMapsUrl);

    const flexMessage = {
      type: 'flex',
      altText: `📍 ที่ตั้งร้าน: ${storeData.storeName}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `📍 ${storeData.storeName}`,
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
              text: 'ที่อยู่ร้านค้า',
              size: 'md',
              color: '#0A4215',
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'text',
              text: fullAddress || 'ที่อยู่ไม่ระบุ',
              size: 'sm',
              color: '#666666',
              wrap: true,
              margin: 'sm'
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
                label: 'ดูแผนที่',
                uri: googleMapsUrl
              },
              style: 'primary',
              color: '#0A4215'
            }
          ]
        }
      }
    };

    await client.pushMessage(userId, flexMessage as FlexMessage);
    console.log('Store location card sent successfully');
    return { success: true };
  } catch (error) {
    console.error('Error sending store location card:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

// Send Text Message
export async function sendTextMessage(userId: string, text: string) {
  try {
    const client = getLineClient();
    await client.pushMessage(userId, {
      type: 'text',
      text,
    });
    return { success: true };
  } catch (error) {
    console.error('Error sending text message:', error);
    throw error;
  }
}

// Get User Profile
export async function getUserProfile(userId: string) {
  try {
    const client = getLineClient();
    const profile = await client.getProfile(userId);
    return profile;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
}

// Verify LINE Signature
export function verifySignature(body: string, signature: string): boolean {
  const crypto = require('crypto');
  const channelSecret = process.env.LINE_CHANNEL_SECRET || '';

  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');

  return hash === signature;
}
