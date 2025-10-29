import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { Client } from '@line/bot-sdk';
import {
  createQRCodeCard,
  createRejectionCard,
  createReducePrincipalCard,
  createIncreasePrincipalCard,
  createSuccessCard
} from '@/lib/line/flex-templates';
import { verifyWebhookSignature, isTimestampValid } from '@/lib/security/webhook';
import { calculateReducePrincipalPayment } from '@/lib/utils/calculations';

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

/**
 * POST /api/webhooks/shop-notification
 * Receives webhooks from Shop System when staff confirm/reject customer requests
 * or when payment verification is complete
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      notificationId,
      type,
      data,
      timestamp,
      shopSystemUrl
    } = body;

    console.log('Received webhook:', { notificationId, type, timestamp });

    // 1. Validate webhook signature
    const signature = request.headers.get('X-Webhook-Signature') || '';
    if (!verifyWebhookSignature(body, signature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // 2. Validate timestamp (prevent replay attacks)
    if (!isTimestampValid(timestamp)) {
      console.error('Webhook timestamp too old');
      return NextResponse.json(
        { error: 'Timestamp expired' },
        { status: 401 }
      );
    }

    const { db } = await connectToDatabase();
    const notificationsCollection = db.collection('notifications');
    const itemsCollection = db.collection('items');

    // 3. Check for duplicate webhook (idempotency)
    const existingNotification = await notificationsCollection.findOne({
      shopNotificationId: notificationId,
      lastWebhookAt: { $exists: true }
    });

    if (existingNotification && type === existingNotification.shopResponse?.action) {
      console.log('Duplicate webhook detected, skipping');
      return NextResponse.json({
        success: true,
        message: 'Webhook already processed'
      });
    }

    // 4. Find notification record
    const notification = await notificationsCollection.findOne({
      shopNotificationId: notificationId
    });

    if (!notification) {
      console.error('Notification not found:', notificationId);
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    // 5. Get item details
    const item = await itemsCollection.findOne({
      _id: notification.contractId
    });

    if (!item) {
      console.error('Item not found:', notification.contractId);
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    const client = getLineClient();

    // 6. Handle different webhook types
    switch (type) {
      case 'action_response':
        await handleActionResponse(client, notificationsCollection, notification, item, data);
        break;

      case 'payment_received':
        await handlePaymentReceived(client, notificationsCollection, notification, item, data);
        break;

      case 'payment_verified':
        await handlePaymentVerified(client, notificationsCollection, itemsCollection, notification, item, data);
        break;

      default:
        console.warn('Unknown webhook type:', type);
        return NextResponse.json(
          { error: 'Unknown webhook type' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}

async function handleActionResponse(
  client: Client,
  notificationsCollection: any,
  notification: any,
  item: any,
  data: any
) {
  const { confirmed, message, qrCodeUrl } = data;

  if (confirmed) {
    // ยืนยัน - ส่ง Flex Message Card พร้อม QR code

    let flexMessage;

    if (notification.type === 'reduce_principal') {
      // ลดเงินต้น - แสดง QR code + ยอดที่ต้องชำระ
      const paymentDetails = calculateReducePrincipalPayment(item, notification.reduceAmount);

      flexMessage = createReducePrincipalCard({
        message,
        qrCodeUrl,
        notificationId: notification.shopNotificationId,
        reduceAmount: notification.reduceAmount,
        interestAmount: paymentDetails.interest,
        totalAmount: paymentDetails.total
      });
    } else if (notification.type === 'increase_principal') {
      // เพิ่มเงินต้น - แจ้งให้มารับเงิน (ไม่มี QR code)
      // TODO: ดึงชื่อร้านจาก storeId
      flexMessage = createIncreasePrincipalCard({
        message,
        increaseAmount: notification.increaseAmount,
        storeName: 'ร้านจำนำ' // TODO: ดึงจาก storeId
      });
    } else {
      // redemption/extension - แสดง QR code
      flexMessage = createQRCodeCard({
        message,
        qrCodeUrl,
        notificationId: notification.shopNotificationId,
        contractNumber: item._id.toString() // ⚠️ ไม่มี contractNumber - ใช้ _id
      });
    }

    await client.pushMessage(notification.lineUserId, flexMessage);

  } else {
    // ปฏิเสธ
    const rejectMessage = createRejectionCard({
      message: message || 'คำขอถูกปฏิเสธ',
      type: notification.type
    });

    await client.pushMessage(notification.lineUserId, rejectMessage);
  }

  // Update notification status
  await notificationsCollection.updateOne(
    { _id: notification._id },
    {
      $set: {
        status: confirmed ? 'confirmed' : 'rejected',
        qrCodeUrl: qrCodeUrl,
        shopResponse: {
          action: confirmed ? 'confirm' : 'reject',
          confirmed,
          message,
          qrCodeUrl,
          timestamp: new Date()
        },
        lastWebhookAt: new Date(),
        updatedAt: new Date()
      }
    }
  );

  console.log(`Sent ${confirmed ? 'confirmation' : 'rejection'} to customer:`, notification.lineUserId);
}

async function handlePaymentReceived(
  client: Client,
  notificationsCollection: any,
  notification: any,
  item: any,
  data: any
) {
  // แจ้งว่าได้รับสลิปแล้ว กำลังรอตรวจสอบ
  await client.pushMessage(
    notification.lineUserId,
    {
      type: 'text',
      text: '✅ ได้รับสลิปการโอนเงินเรียบร้อย\nกำลังรอพนักงานตรวจสอบ...'
    }
  );

  // Update notification status
  await notificationsCollection.updateOne(
    { _id: notification._id },
    {
      $set: {
        status: 'payment_uploaded',
        paymentProofUrl: data.paymentProofUrl,
        lastWebhookAt: new Date(),
        updatedAt: new Date()
      }
    }
  );
}

async function handlePaymentVerified(
  client: Client,
  notificationsCollection: any,
  itemsCollection: any,
  notification: any,
  item: any,
  data: any
) {
  const { verified, message, status } = data;

  if (verified) {
    // ยืนยันการชำระเงิน
    let successMessage;

    if (notification.type === 'redemption') {
      successMessage = createSuccessCard({
        title: '✅ ไถ่ถอนสำเร็จ',
        message: message || 'สัญญาของคุณเสร็จสิ้นแล้ว',
        contractNumber: item._id.toString()
      });

      // อัพเดทสถานะ item
      await itemsCollection.updateOne(
        { _id: item._id },
        {
          $set: {
            status: 'redeemed',
            redeemedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

    } else if (notification.type === 'extension') {
      // ต่อดอก - อัพเดทวันครบกำหนด (จาก Shop System)
      successMessage = createSuccessCard({
        title: '✅ ต่อดอกเบี้ยสำเร็จ',
        message: message || 'ต่อดอกเบี้ยเรียบร้อยแล้ว',
        contractNumber: item._id.toString()
      });

      // อัพเดท extension history
      await itemsCollection.updateOne(
        { _id: item._id },
        {
          $set: { updatedAt: new Date() },
          $push: {
            extensionHistory: {
              extendedAt: new Date(),
              extensionDays: item.loanDays || 7,
              notificationId: notification._id
            }
          }
        }
      );

    } else if (notification.type === 'reduce_principal') {
      successMessage = createSuccessCard({
        title: '✅ ลดเงินต้นสำเร็จ',
        message: `${message}\nเงินต้นใหม่: ${notification.newPrincipal?.toLocaleString()} บาท`,
        contractNumber: item._id.toString()
      });

      // อัพเดท confirmationNewContract.pawnPrice และ desiredAmount
      // (Shop System จะอัพเดทแล้ว แต่อัพเดทที่นี่เผื่อ sync)
      await itemsCollection.updateOne(
        { _id: item._id },
        {
          $set: {
            'confirmationNewContract.pawnPrice': notification.newPrincipal, // 🔥 อัพเดทราคาจริง
            desiredAmount: notification.newPrincipal, // backward compatibility
            updatedAt: new Date()
          }
        }
      );

    } else if (notification.type === 'increase_principal') {
      successMessage = createSuccessCard({
        title: '✅ เพิ่มวงเงินสำเร็จ',
        message: `${message}\nเงินต้นใหม่: ${notification.newPrincipal?.toLocaleString()} บาท`,
        contractNumber: item._id.toString()
      });

      // อัพเดท confirmationNewContract.pawnPrice และ desiredAmount
      await itemsCollection.updateOne(
        { _id: item._id },
        {
          $set: {
            'confirmationNewContract.pawnPrice': notification.newPrincipal, // 🔥 อัพเดทราคาจริง
            desiredAmount: notification.newPrincipal, // backward compatibility
            updatedAt: new Date()
          }
        }
      );
    }

    if (successMessage) {
      await client.pushMessage(notification.lineUserId, successMessage);
    }

  } else {
    // ปฏิเสธการชำระเงิน
    await client.pushMessage(
      notification.lineUserId,
      {
        type: 'text',
        text: `❌ ${message || 'การชำระเงินไม่ผ่าน กรุณาติดต่อร้าน'}`
      }
    );
  }

  // Update notification status
  await notificationsCollection.updateOne(
    { _id: notification._id },
    {
      $set: {
        status: verified ? 'completed' : 'failed',
        paymentVerification: {
          verified,
          message,
          timestamp: new Date()
        },
        lastWebhookAt: new Date(),
        updatedAt: new Date()
      }
    }
  );

  console.log(`Payment ${verified ? 'verified' : 'failed'} for customer:`, notification.lineUserId);
}
