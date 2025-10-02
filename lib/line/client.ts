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

// Send Push Message with Image (QR Code)
export async function sendQRCodeImage(userId: string, imageUrl: string, previewUrl: string) {
  try {
    await lineClient.pushMessage(userId, {
      type: 'image',
      originalContentUrl: imageUrl,
      previewImageUrl: previewUrl,
    });
    return { success: true };
  } catch (error) {
    console.error('Error sending QR code image:', error);
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
