import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { Client, middleware } from '@line/bot-sdk';
import { verifyLineSignature } from '@/lib/security/line';
import { downloadLineImage } from '@/lib/line/client';

// Lazy initialization of LINE client
let lineClient: Client | null = null;

function getLineClient(): Client {
  if (!lineClient) {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!channelAccessToken || !channelSecret) {
      throw new Error('LINE channel access token or secret not configured');
    }

    lineClient = new Client({
      channelAccessToken,
      channelSecret,
    });
  }
  return lineClient;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature');

    // 1. Verify LINE signature
    if (!verifyLineSignature(body, signature || '')) {
      console.error('Invalid LINE signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const { events } = JSON.parse(body);
    console.log('Received LINE events:', events.length);

    // 2. Process events
    for (const event of events) {
      try {
        if (event.type === 'postback') {
          await handlePostback(event);
        } else if (event.type === 'message' && event.message.type === 'image') {
          await handleImageMessage(event);
        } else if (event.type === 'message' && event.message.type === 'text') {
          await handleTextMessage(event);
        }
        // Ignore other event types
      } catch (eventError) {
        console.error('Error processing LINE event:', eventError);
        // Continue processing other events
      }
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('LINE webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handlePostback(event: any) {
  const data = new URLSearchParams(event.postback.data);
  const action = data.get('action');
  const contractId = data.get('contractId');
  const notificationId = data.get('notificationId');
  const userId = event.source?.userId;

  if (!userId) {
    console.error('No userId in postback event');
    return;
  }

  console.log('Handling postback:', { action, contractId, notificationId });

  switch (action) {
    case 'redemption':
      if (contractId) await requestRedemption(contractId, userId);
      break;
    case 'extension':
      if (contractId) await requestExtension(contractId, userId);
      break;
    case 'reduce_principal':
      // TODO: Ask for amount via Quick Reply
      await replyTextMessage(event.replyToken, 'กรุณาระบุจำนวนเงินที่ต้องการลด (เช่น 1000):');
      break;
    case 'increase_principal':
      // TODO: Ask for amount via Quick Reply
      await replyTextMessage(event.replyToken, 'กรุณาระบุจำนวนเงินที่ต้องการเพิ่ม (เช่น 2000):');
      break;
    case 'upload_slip':
      await replyTextMessage(event.replyToken, 'กรุณาส่งรูปสลิปการโอนเงิน');
      break;
    default:
      console.log('Unknown postback action:', action);
  }
}

async function handleImageMessage(event: any) {
  const userId = event.source.userId;
  const messageId = event.message.id;

  console.log('Handling image message:', { userId, messageId });

  try {
    // 1. Download image from LINE
    const imageBuffer = await downloadLineImage(messageId);

    // 2. Find pending notification waiting for payment proof
    const { db } = await connectToDatabase();
    const notificationsCollection = db.collection('notifications');

    // Find notifications that are waiting for payment proof
    const pendingNotification = await notificationsCollection.findOne({
      lineUserId: userId,
      status: { $in: ['confirmed', 'payment_uploaded'] },
      type: { $in: ['redemption', 'extension', 'reduce_principal'] }
    });

    if (pendingNotification) {
      // 3. Create FormData and upload to Shop System
      const formData = new FormData();
      formData.append('notificationId', pendingNotification.shopNotificationId);
      formData.append('file', new Blob([new Uint8Array(imageBuffer)]), 'slip.jpg');

      const shopSystemUrl = process.env.SHOP_SYSTEM_URL || 'https://pawn360-ver.vercel.app';

      const response = await fetch(`${shopSystemUrl}/api/notifications/payment-proof`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        await replyTextMessage(event.replyToken, 'อัพโหลดสลิปสำเร็จ กำลังรอพนักงานตรวจสอบ');
      } else {
        await replyTextMessage(event.replyToken, 'อัพโหลดสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } else {
      await replyTextMessage(event.replyToken, 'ไม่พบคำขอที่รอการชำระเงิน กรุณาติดต่อร้านค้า');
    }

  } catch (error) {
    console.error('Error handling image message:', error);
    await replyTextMessage(event.replyToken, 'เกิดข้อผิดพลาดในการอัพโหลดรูปภาพ กรุณาลองใหม่อีกครั้ง');
  }
}

async function handleTextMessage(event: any) {
  const userId = event.source.userId;
  const text = event.message.text;

  console.log('Handling text message:', { userId, text });

  // TODO: Handle amount input for reduce/increase principal
  // For now, just acknowledge the message
  await replyTextMessage(event.replyToken, `ได้รับข้อความ: ${text}`);
}

async function requestRedemption(contractId: string, lineUserId: string) {
  try {
    // For internal API calls, use relative path to avoid external calls
    // This works in both development and production
    console.log('Making request to: /api/customer/request-redemption');

    const response = await fetch('/api/customer/request-redemption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId, lineUserId })
    });

    console.log('Response status:', response.status);

    const data = await response.json();

    if (data?.pinRequired || data?.pinSetupRequired || data?.pinLocked) {
      const lockMessage = data?.pinLocked && data?.lockRemainingSeconds
        ? `บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่อีกครั้งใน ${Math.ceil(data.lockRemainingSeconds / 60)} นาที`
        : 'กรุณายืนยัน PIN ก่อนทำรายการไถ่ถอน';
      await sendTextMessage(lineUserId, `${lockMessage}\n\nโปรดทำรายการผ่านหน้าแอปเพื่อยืนยัน PIN`);
      return;
    }

    if (data.success) {
      await sendTextMessage(lineUserId, data.message);
    } else {
      await sendTextMessage(lineUserId, `${data.error || 'เกิดข้อผิดพลาด'}`);
    }
  } catch (error) {
    console.error('Error requesting redemption:', error);
    await sendTextMessage(lineUserId, 'เกิดข้อผิดพลาดในการส่งคำขอ');
  }
}

async function requestExtension(contractId: string, lineUserId: string) {
  try {
    // For internal API calls, use relative path to avoid external calls
    // This works in both development and production
    console.log('Making request to: /api/customer/request-extension');

    const response = await fetch('/api/customer/request-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId, lineUserId })
    });

    console.log('Response status:', response.status);

    const data = await response.json();

    if (data?.pinRequired || data?.pinSetupRequired || data?.pinLocked) {
      const lockMessage = data?.pinLocked && data?.lockRemainingSeconds
        ? `บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่อีกครั้งใน ${Math.ceil(data.lockRemainingSeconds / 60)} นาที`
        : 'กรุณายืนยัน PIN ก่อนทำรายการต่อดอกเบี้ย';
      await sendTextMessage(lineUserId, `${lockMessage}\n\nโปรดทำรายการผ่านหน้าแอปเพื่อยืนยัน PIN`);
      return;
    }

    if (data.success) {
      await sendTextMessage(lineUserId, data.message);
    } else {
      await sendTextMessage(lineUserId, `${data.error || 'เกิดข้อผิดพลาด'}`);
    }
  } catch (error) {
    console.error('Error requesting extension:', error);
    await sendTextMessage(lineUserId, 'เกิดข้อผิดพลาดในการส่งคำขอ');
  }
}

async function sendTextMessage(userId: string, text: string) {
  const client = getLineClient();
  await client.pushMessage(userId, { type: 'text', text });
}

async function replyTextMessage(replyToken: string, text: string) {
  const client = getLineClient();
  await client.replyMessage(replyToken, { type: 'text', text });
}
