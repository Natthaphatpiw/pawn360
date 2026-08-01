import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId, type Collection, type Document, type MongoClient } from 'mongodb';
import type { Message } from '@line/bot-sdk';
import { lineRetryKeyFromMaterial, pushLineMessage } from '@/lib/line/push-text';
import {
  createQRCodeCard,
  createRejectionCard,
  createReducePrincipalCard,
  createIncreasePrincipalCard,
  createSuccessCard
} from '@/lib/line/flex-templates';
import { verifyConfiguredShopWebhookSignature, isTimestampValid } from '@/lib/security/webhook';
import { calculateReducePrincipalPayment } from '@/lib/utils/calculations';
import {
  boundedText,
} from '@/lib/security/transaction-request';
import {
  claimWebhookEvent,
  completeWebhookClaim,
  readBoundedWebhookText,
  releaseWebhookClaim,
  type WebhookClaim,
  webhookReplayErrorResponse,
} from '@/lib/security/webhook-replay';

const SHOP_WEBHOOK_TYPES = new Set([
  'action_response',
  'payment_received',
  'payment_verified',
]);
const SHOP_NOTIFICATION_TYPES = new Set([
  'redemption',
  'extension',
  'increase_principal',
  'reduce_principal',
]);

type ShopItemDocument = Document & {
  extensionHistory: Document[];
  principalHistory: Document[];
};

function safeMessage(value: unknown, fallback: string): string {
  return boundedText(value, 1_000, false) || fallback;
}

function safeHttpsUrl(value: unknown): string | null {
  const raw = boundedText(value, 4_096, false);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function safeMoney(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100_000_000
    ? number
    : null;
}

async function pushShopLineMessage(
  lineUserId: unknown,
  message: Message,
  retryMaterial: string,
) {
  const to = typeof lineUserId === 'string' ? lineUserId.trim() : '';
  const token = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
  if (!/^U[A-Za-z0-9]{20,64}$/.test(to) || !token) {
    throw new Error('SHOP_LINE_NOTIFICATION_NOT_CONFIGURED');
  }
  const result = await pushLineMessage({
    channelAccessToken: token,
    to,
    messages: message,
    retryKey: lineRetryKeyFromMaterial(retryMaterial),
    signal: AbortSignal.timeout(10_000),
  });
  if (!result.success) throw new Error('SHOP_LINE_NOTIFICATION_FAILED');
}

/**
 * POST /api/webhooks/shop-notification
 * Receives webhooks from Shop System when staff confirm/reject customer requests
 * or when payment verification is complete
 */
export async function POST(request: NextRequest) {
  let claim: WebhookClaim | null = null;
  try {
    const rawBody = await readBoundedWebhookText(request, 128 * 1024);
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'Invalid webhook payload', code: 'SHOP_WEBHOOK_INVALID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const notificationId = boundedText(body.notificationId, 128, true) || '';
    const type = boundedText(body.type, 64, true) || '';
    const timestamp = boundedText(body.timestamp, 64, true) || '';
    const data = body.data;
    if (
      !SHOP_WEBHOOK_TYPES.has(type)
      || !data
      || typeof data !== 'object'
      || Array.isArray(data)
      || JSON.stringify(data).length > 64 * 1024
    ) {
      return NextResponse.json(
        { error: 'Invalid webhook payload', code: 'SHOP_WEBHOOK_INVALID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const signingSecret = process.env.WEBHOOK_SECRET || '';
    if (!signingSecret) {
      return NextResponse.json(
        { error: 'Webhook not configured', code: 'SHOP_WEBHOOK_CONFIG_MISSING' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // 1. Validate webhook signature
    const signature = request.headers.get('X-Webhook-Signature') || '';
    if (!verifyConfiguredShopWebhookSignature(rawBody, body, signature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // 2. Validate timestamp (prevent replay attacks)
    if (!isTimestampValid(timestamp)) {
      return NextResponse.json(
        { error: 'Timestamp expired' },
        { status: 401 }
      );
    }

    claim = await claimWebhookEvent({
      namespace: 'shop-notification',
      material: `${notificationId}:${timestamp}:${type}`,
      signingSecret,
    });
    if (claim.duplicate) {
      return NextResponse.json(
        { success: true, message: 'Webhook already processed' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { client: mongoClient, db } = await connectToDatabase();
    const notificationsCollection = db.collection('notifications');
    const itemsCollection = db.collection<ShopItemDocument>('items');
    const storesCollection = db.collection('stores');

    // Find notification record
    const notification = await notificationsCollection.findOne({
      shopNotificationId: notificationId
    });

    if (!notification) {
      await releaseWebhookClaim(claim);
      claim = null;
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }
    if (
      !SHOP_NOTIFICATION_TYPES.has(String(notification.type || ''))
      || !/^U[A-Za-z0-9]{20,64}$/.test(String(notification.lineUserId || ''))
      || !(notification.contractId instanceof ObjectId)
    ) {
      throw new Error('SHOP_NOTIFICATION_RECORD_INVALID');
    }

    // 5. Get item details
    const item = await itemsCollection.findOne({
      _id: notification.contractId
    });

    if (!item) {
      await releaseWebhookClaim(claim);
      claim = null;
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    const retryScope = `shop-webhook:${notificationId}:${timestamp}:${type}`;

    // 6. Handle different webhook types
    switch (type) {
      case 'action_response':
        await handleActionResponse(
          notificationsCollection,
          storesCollection,
          notification,
          item,
          data as Record<string, unknown>,
          retryScope,
        );
        break;

      case 'payment_received':
        await handlePaymentReceived(
          notificationsCollection,
          notification,
          retryScope,
        );
        break;

      case 'payment_verified':
        await handlePaymentVerified(
          mongoClient,
          notificationsCollection,
          itemsCollection,
          notification,
          item,
          data as Record<string, unknown>,
          retryScope,
        );
        break;

      default:
        await releaseWebhookClaim(claim);
        claim = null;
        return NextResponse.json(
          { error: 'Unknown webhook type' },
          { status: 400 }
        );
    }

    await completeWebhookClaim(claim);

    return NextResponse.json(
      { success: true, message: 'Webhook processed successfully' },
      { headers: { 'Cache-Control': 'no-store' } },
    );

  } catch (error) {
    if (claim) await releaseWebhookClaim(claim);
    const replayError = webhookReplayErrorResponse(error);
    if (replayError) return replayError;
    console.error('[shop:webhook] processing failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

async function handleActionResponse(
  notificationsCollection: Collection<Document>,
  storesCollection: Collection<Document>,
  notification: Document,
  item: Document,
  data: Record<string, unknown>,
  retryScope: string,
) {
  if (typeof data.confirmed !== 'boolean') throw new Error('SHOP_ACTION_RESPONSE_INVALID');
  const confirmed = data.confirmed;
  const message = safeMessage(
    data.message,
    confirmed ? 'คำขอได้รับการยืนยันแล้ว' : 'คำขอถูกปฏิเสธ',
  );
  const qrCodeUrl = safeHttpsUrl(data.qrCodeUrl);
  const targetStatus = confirmed ? 'confirmed' : 'rejected';

  if (notification.status !== 'pending') {
    // A second signed callback cannot reverse an already-final decision.
    return;
  }

  if (confirmed) {
    let flexMessage: Message;

    if (notification.type === 'reduce_principal') {
      const reduceAmount = safeMoney(notification.reduceAmount);
      if (reduceAmount === null || !qrCodeUrl) throw new Error('SHOP_ACTION_RESPONSE_INVALID');
      const paymentDetails = calculateReducePrincipalPayment(item, reduceAmount);

      flexMessage = createReducePrincipalCard({
        message,
        qrCodeUrl,
        notificationId: notification.shopNotificationId,
        reduceAmount,
        interestAmount: paymentDetails.interest,
        totalAmount: paymentDetails.total
      });
    } else if (notification.type === 'increase_principal') {
      const increaseAmount = safeMoney(notification.increaseAmount);
      if (increaseAmount === null) throw new Error('SHOP_ACTION_RESPONSE_INVALID');
      let storeName = 'จุดรับฝาก';

      if (item.storeId && ObjectId.isValid(String(item.storeId))) {
        const store = await storesCollection.findOne({ _id: new ObjectId(String(item.storeId)) });
        storeName = store?.storeName || store?.name || storeName;
      }

      flexMessage = createIncreasePrincipalCard({
        message,
        increaseAmount,
        storeName: String(storeName).slice(0, 160),
      });
    } else {
      if (!qrCodeUrl) throw new Error('SHOP_ACTION_RESPONSE_INVALID');
      flexMessage = createQRCodeCard({
        message,
        qrCodeUrl,
        notificationId: notification.shopNotificationId,
        contractNumber: item._id.toString(),
      });
    }

    await pushShopLineMessage(
      notification.lineUserId,
      flexMessage,
      `${retryScope}:action-response`,
    );
  } else {
    const rejectMessage = createRejectionCard({
      message,
      type: notification.type,
    });
    await pushShopLineMessage(
      notification.lineUserId,
      rejectMessage,
      `${retryScope}:action-response`,
    );
  }

  const result = await notificationsCollection.updateOne(
    { _id: notification._id, status: 'pending' },
    {
      $set: {
        status: targetStatus,
        ...(qrCodeUrl ? { qrCodeUrl } : {}),
        shopResponse: {
          action: confirmed ? 'confirm' : 'reject',
          confirmed,
          message,
          qrCodeUrl,
          lineRetryKey: lineRetryKeyFromMaterial(`${retryScope}:action-response`),
          lineNotifiedAt: new Date(),
          timestamp: new Date(),
        },
        lastWebhookAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );
  if (result.modifiedCount !== 1) {
    const current = await notificationsCollection.findOne(
      { _id: notification._id },
      { projection: { status: 1 } },
    );
    if (current?.status !== targetStatus) throw new Error('SHOP_NOTIFICATION_STATE_CONFLICT');
  }

  console.log(`[shop:webhook] customer ${confirmed ? 'confirmation' : 'rejection'} sent`);
}

async function handlePaymentReceived(
  notificationsCollection: Collection<Document>,
  notification: Document,
  retryScope: string,
) {
  if (notification.status === 'payment_uploaded') return;
  if (notification.status !== 'payment_pending') return;

  await pushShopLineMessage(
    notification.lineUserId,
    {
      type: 'text',
      text: 'ได้รับสลิปการโอนเงินเรียบร้อย\nกำลังรอพนักงานตรวจสอบ...',
    },
    `${retryScope}:payment-received`,
  );

  const result = await notificationsCollection.updateOne(
    { _id: notification._id, status: 'payment_pending' },
    {
      $set: {
        status: 'payment_uploaded',
        paymentReceivedLineRetryKey: lineRetryKeyFromMaterial(`${retryScope}:payment-received`),
        paymentReceivedLineNotifiedAt: new Date(),
        lastWebhookAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );
  if (result.modifiedCount !== 1) {
    const current = await notificationsCollection.findOne(
      { _id: notification._id },
      { projection: { status: 1 } },
    );
    if (current?.status !== 'payment_uploaded') throw new Error('SHOP_NOTIFICATION_STATE_CONFLICT');
  }
}

async function handlePaymentVerified(
  mongoClient: MongoClient,
  notificationsCollection: Collection<Document>,
  itemsCollection: Collection<ShopItemDocument>,
  notification: Document,
  item: ShopItemDocument,
  data: Record<string, unknown>,
  retryScope: string,
) {
  if (typeof data.verified !== 'boolean') throw new Error('SHOP_PAYMENT_VERIFICATION_INVALID');
  const verified = data.verified;
  const message = safeMessage(
    data.message,
    verified ? 'ตรวจสอบการชำระเงินเรียบร้อยแล้ว' : 'การชำระเงินไม่ผ่าน กรุณาติดต่อร้าน',
  );
  const targetStatus = verified ? 'completed' : 'failed';
  const lineRetryMaterial = `${retryScope}:payment-verified`;
  const lineRetryKey = lineRetryKeyFromMaterial(lineRetryMaterial);
  const priorVerification = notification.paymentVerification as Record<string, unknown> | undefined;
  const isDeliveryRecovery = notification.status === targetStatus
    && priorVerification?.lineRetryKey === lineRetryKey
    && !priorVerification?.lineNotifiedAt;

  if (notification.status === 'completed' || notification.status === 'failed') {
    if (!isDeliveryRecovery) return;
  } else {
    if (!['payment_pending', 'payment_uploaded'].includes(String(notification.status || ''))) return;

    const session = mongoClient.startSession();
    let transitioned = false;
    try {
      await session.withTransaction(async () => {
        const transition = await notificationsCollection.updateOne(
          {
            _id: notification._id,
            status: { $in: ['payment_pending', 'payment_uploaded'] },
          },
          {
            $set: {
              status: targetStatus,
              paymentVerification: {
                verified,
                message,
                lineRetryKey,
                lineNotifiedAt: null,
                timestamp: new Date(),
              },
              lastWebhookAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { session },
        );
        if (transition.modifiedCount !== 1) return;
        transitioned = true;

        if (!verified) return;

        let itemUpdate;
        if (notification.type === 'redemption') {
          itemUpdate = await itemsCollection.updateOne(
            { _id: item._id },
            {
              $set: {
                status: 'redeem',
                redeemedAt: new Date(),
                updatedAt: new Date(),
              },
            },
            { session },
          );
        } else if (notification.type === 'extension') {
          itemUpdate = await itemsCollection.updateOne(
            { _id: item._id },
            {
              $set: { updatedAt: new Date() },
              $push: {
                extensionHistory: {
                  extendedAt: new Date(),
                  extensionDays: item.loanDays || 7,
                  notificationId: notification._id,
                },
              } as any,
            },
            { session },
          );
        } else {
          const newPrincipal = safeMoney(notification.newPrincipal);
          if (newPrincipal === null) throw new Error('SHOP_PRINCIPAL_VALUE_INVALID');
          const changeType = notification.type === 'reduce_principal' ? 'reduce' : 'increase';
          const amountField = changeType === 'reduce' ? 'reduceAmount' : 'increaseAmount';
          itemUpdate = await itemsCollection.updateOne(
            { _id: item._id },
            {
              $set: {
                'confirmationNewContract.pawnPrice': newPrincipal,
                desiredAmount: newPrincipal,
                updatedAt: new Date(),
              },
              $push: {
                principalHistory: {
                  type: changeType,
                  changedAt: new Date(),
                  previousPrincipal: notification.currentPrincipal,
                  newPrincipal,
                  [amountField]: notification[amountField],
                  notificationId: notification._id,
                },
              } as any,
            },
            { session },
          );
        }
        if (itemUpdate.matchedCount !== 1) throw new Error('SHOP_ITEM_UPDATE_FAILED');
      });
    } finally {
      await session.endSession();
    }

    if (!transitioned) {
      const current = await notificationsCollection.findOne(
        { _id: notification._id },
        { projection: { status: 1, paymentVerification: 1 } },
      );
      const currentVerification = current?.paymentVerification as Record<string, unknown> | undefined;
      if (
        current?.status !== targetStatus
        || currentVerification?.lineRetryKey !== lineRetryKey
        || currentVerification?.lineNotifiedAt
      ) {
        return;
      }
    }
  }

  let lineMessage: Message;
  if (verified) {
    if (notification.type === 'redemption') {
      lineMessage = createSuccessCard({
        title: 'ไถ่ถอนสำเร็จ',
        message,
        contractNumber: item._id.toString(),
      });
    } else if (notification.type === 'extension') {
      lineMessage = createSuccessCard({
        title: 'ต่อดอกเบี้ยสำเร็จ',
        message,
        contractNumber: item._id.toString(),
      });
    } else {
      const newPrincipal = safeMoney(notification.newPrincipal);
      if (newPrincipal === null) throw new Error('SHOP_PRINCIPAL_VALUE_INVALID');
      lineMessage = createSuccessCard({
        title: notification.type === 'reduce_principal' ? 'ลดเงินต้นสำเร็จ' : 'เพิ่มวงเงินสำเร็จ',
        message: `${message}\nเงินต้นใหม่: ${newPrincipal.toLocaleString()} บาท`,
        contractNumber: item._id.toString(),
      });
    }
  } else {
    lineMessage = { type: 'text', text: message };
  }

  await pushShopLineMessage(notification.lineUserId, lineMessage, lineRetryMaterial);
  const notified = await notificationsCollection.updateOne(
    {
      _id: notification._id,
      'paymentVerification.lineRetryKey': lineRetryKey,
      'paymentVerification.lineNotifiedAt': null,
    },
    {
      $set: {
        'paymentVerification.lineNotifiedAt': new Date(),
        updatedAt: new Date(),
      },
    },
  );
  if (notified.matchedCount !== 1) throw new Error('SHOP_LINE_NOTIFICATION_MARK_FAILED');

  console.log(`[shop:webhook] payment ${verified ? 'verified' : 'failed'} notification sent`);
}
