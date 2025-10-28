import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { Client } from '@line/bot-sdk';
import {
  createQRCodeFlexMessage,
  createRejectionFlexMessage,
  createPaymentSuccessFlexMessage,
  createPaymentFailureFlexMessage
} from '@/lib/line/flex-templates';
import { verifyWebhookSignature, isTimestampValid } from '@/lib/security/webhook';

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
    const contractsCollection = db.collection('contracts');

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

    // 5. Get contract details
    const contract = await contractsCollection.findOne({
      _id: notification.contractId
    });

    if (!contract) {
      console.error('Contract not found:', notification.contractId);
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const client = getLineClient();
    const actionType = notification.type === 'redemption' ? 'redemption' : 'extension';

    // 6. Handle different webhook types
    switch (type) {
      case 'action_response':
        // Staff confirmed or rejected the request
        if (data.confirmed) {
          // Confirmed - send QR code to customer
          const qrCodeUrl = data.qrCodeUrl || 'https://piwp360.s3.ap-southeast-2.amazonaws.com/bank/QRCode.png';

          const flexMessage = createQRCodeFlexMessage(
            qrCodeUrl,
            data.message || 'คำขอของคุณได้รับการยืนยัน กรุณาชำระเงินตามจำนวนที่กำหนด',
            notificationId,
            notification.amount || 0,
            actionType
          );

          await client.pushMessage(notification.lineUserId, flexMessage);

          // Update notification status
          await notificationsCollection.updateOne(
            { _id: notification._id },
            {
              $set: {
                status: 'confirmed',
                qrCodeUrl: qrCodeUrl,
                shopResponse: {
                  action: 'confirm',
                  confirmed: true,
                  message: data.message,
                  qrCodeUrl: qrCodeUrl,
                  timestamp: new Date()
                },
                lastWebhookAt: new Date(),
                updatedAt: new Date()
              }
            }
          );

          console.log('Sent QR code to customer:', notification.lineUserId);
        } else {
          // Rejected - notify customer
          const flexMessage = createRejectionFlexMessage(
            data.message || 'คำขอของคุณไม่ได้รับการอนุมัติ กรุณาติดต่อร้านค้า',
            actionType
          );

          await client.pushMessage(notification.lineUserId, flexMessage);

          // Update notification status
          await notificationsCollection.updateOne(
            { _id: notification._id },
            {
              $set: {
                status: 'rejected',
                shopResponse: {
                  action: 'reject',
                  confirmed: false,
                  message: data.message,
                  timestamp: new Date()
                },
                lastWebhookAt: new Date(),
                updatedAt: new Date()
              }
            }
          );

          console.log('Sent rejection to customer:', notification.lineUserId);
        }
        break;

      case 'payment_received':
        // Shop system received payment proof from customer
        // Update status to payment_uploaded
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
        console.log('Payment proof received, status updated to payment_uploaded');
        break;

      case 'payment_verified':
        // Staff verified the payment proof
        if (data.verified) {
          // Payment successful
          const flexMessage = createPaymentSuccessFlexMessage(
            data.message || 'การชำระเงินสำเร็จ ขอบคุณที่ใช้บริการ',
            actionType,
            contract.contractNumber
          );

          await client.pushMessage(notification.lineUserId, flexMessage);

          // Update notification status
          await notificationsCollection.updateOne(
            { _id: notification._id },
            {
              $set: {
                status: 'completed',
                paymentVerification: {
                  verified: true,
                  message: data.message,
                  timestamp: new Date()
                },
                lastWebhookAt: new Date(),
                updatedAt: new Date()
              }
            }
          );

          // Update contract status if redemption
          if (actionType === 'redemption') {
            await contractsCollection.updateOne(
              { _id: notification.contractId },
              {
                $set: {
                  status: 'redeemed',
                  'dates.redeemDate': new Date(),
                  updatedAt: new Date()
                }
              }
            );
          }

          console.log('Payment verified successfully for customer:', notification.lineUserId);
        } else {
          // Payment failed
          const flexMessage = createPaymentFailureFlexMessage(
            data.message || 'การชำระเงินไม่สำเร็จ กรุณาตรวจสอบสลิปและลองใหม่อีกครั้ง',
            actionType
          );

          await client.pushMessage(notification.lineUserId, flexMessage);

          // Update notification status
          await notificationsCollection.updateOne(
            { _id: notification._id },
            {
              $set: {
                status: 'failed',
                paymentVerification: {
                  verified: false,
                  message: data.message,
                  timestamp: new Date()
                },
                lastWebhookAt: new Date(),
                updatedAt: new Date()
              }
            }
          );

          console.log('Payment verification failed for customer:', notification.lineUserId);
        }
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
