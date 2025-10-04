import { Client, ClientConfig, WebhookEvent } from '@line/bot-sdk';
import axios from 'axios';

const config: ClientConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

export const lineClient = new Client(config);

// Link Rich Menu to User
export async function linkRichMenuToUser(userId: string, richMenuId: string) {
  try {
    await lineClient.linkRichMenuToUser(userId, richMenuId);
    return { success: true };
  } catch (error) {
    console.error('Error linking rich menu:', error);
    throw error;
  }
}

// Send Push Message with QR Code
export async function sendQRCodeImage(userId: string, qrCodeDataURL: string, liffUrl: string) {
  try {
    // ส่ง Flex Message พร้อม QR Code และ Link
    await lineClient.pushMessage(userId, {
      type: 'flex',
      altText: 'QR Code สำหรับร้านค้ารับจำนำ',
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: qrCodeDataURL.startsWith('data:')
            ? 'https://placehold.co/400x400/green/white?text=QR+Code'  // Placeholder เพราะ LINE ไม่รับ data URL
            : qrCodeDataURL,
          size: 'full',
          aspectRatio: '1:1',
          aspectMode: 'fit',
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '✅ สร้างรายการจำนำสำเร็จ',
              weight: 'bold',
              size: 'xl',
              color: '#1DB446',
            },
            {
              type: 'text',
              text: 'นำ QR Code นี้ไปแสดงที่ร้านค้า',
              size: 'sm',
              color: '#666666',
              margin: 'md',
            },
            {
              type: 'separator',
              margin: 'md',
            },
            {
              type: 'text',
              text: 'QR Code:',
              size: 'sm',
              color: '#555555',
              margin: 'md',
            },
            {
              type: 'text',
              text: qrCodeDataURL.substring(0, 50) + '...',
              size: 'xxs',
              color: '#999999',
              wrap: true,
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: 'ดู QR Code',
                uri: liffUrl,
              },
              style: 'primary',
              color: '#1DB446',
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

// Send Text Message
export async function sendTextMessage(userId: string, text: string) {
  try {
    await lineClient.pushMessage(userId, {
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
    const profile = await lineClient.getProfile(userId);
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
