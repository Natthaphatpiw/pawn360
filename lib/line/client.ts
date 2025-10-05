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
export async function sendQRCodeImage(userId: string, itemId: string, s3Url: string) {
  try {
    // ส่ง Flex Message พร้อมรูป QR Code จาก S3
    await lineClient.pushMessage(userId, {
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
