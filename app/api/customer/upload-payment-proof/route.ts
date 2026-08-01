import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { putPrivateBlob } from '@/lib/storage/blob';
import { getLineClient } from '@/lib/line/client';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import {
  InternalAuthError,
  internalAuthErrorResponse,
  liffAuthErrorResponse,
  requireInternalRequest,
  requireLiffOwner,
} from '@/lib/security/request-auth';
import {
  boundedText,
  readBoundedJsonObject,
  sanitizedServerError,
  TransactionRequestError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const MAX_SLIP_BYTES = 2 * 1024 * 1024;
const MAX_MULTIPART_BYTES = 3 * 1024 * 1024;

type ValidatedImage = { buffer: Buffer; contentType: string; extension: string };

function validateSlipImage(buffer: Buffer): ValidatedImage {
  if (buffer.length === 0 || buffer.length > MAX_SLIP_BYTES) {
    throw new TransactionRequestError('SLIP_TOO_LARGE', 413, 'ไฟล์สลิปมีขนาดใหญ่เกินไป');
  }
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.length >= 8 && buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const webp = buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (jpeg) return { buffer, contentType: 'image/jpeg', extension: 'jpg' };
  if (png) return { buffer, contentType: 'image/png', extension: 'png' };
  if (webp) return { buffer, contentType: 'image/webp', extension: 'webp' };
  throw new TransactionRequestError('INVALID_SLIP_IMAGE', 400, 'ไฟล์สลิปไม่ถูกต้อง');
}

async function downloadLineImage(messageId: string): Promise<Buffer> {
  const stream = await getLineClient().getMessageContent(messageId);
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_SLIP_BYTES) {
      stream.destroy();
      throw new TransactionRequestError('SLIP_TOO_LARGE', 413, 'ไฟล์สลิปมีขนาดใหญ่เกินไป');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, totalBytes);
}

async function sendToShopSystem(
  notificationId: string,
  image: ValidatedImage,
  slipUrl: string,
): Promise<void> {
  const shopSystemUrl = process.env.SHOP_SYSTEM_URL || 'https://pawn360-ver.vercel.app';
  let endpoint: URL;
  try {
    endpoint = new URL('/api/notifications/payment-proof', shopSystemUrl);
  } catch {
    throw new Error('SHOP_SYSTEM_CONFIG_INVALID');
  }
  if (endpoint.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('SHOP_SYSTEM_CONFIG_INVALID');
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(image.buffer)], { type: image.contentType });
  formData.append('notificationId', notificationId);
  formData.append('file', new File([blob], `slip.${image.extension}`, { type: image.contentType }));
  formData.append('slipUrl', slipUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const serviceToken = String(process.env.SHOP_SYSTEM_API_TOKEN || '').trim();
    if (process.env.NODE_ENV === 'production' && !serviceToken) {
      throw new Error('SHOP_SYSTEM_AUTH_NOT_CONFIGURED');
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: serviceToken ? { Authorization: `Bearer ${serviceToken}` } : undefined,
      body: formData,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('SHOP_SYSTEM_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    const multipart = contentType.includes('multipart/form-data');
    let notificationId: string;
    let lineUserId: string;
    let imageFile: File | null = null;
    let imageId: string | null = null;

    if (multipart) {
      await requireLiffIdentity(request, 'PAWNER');
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_MULTIPART_BYTES) {
        return NextResponse.json(
          { error: 'ไฟล์สลิปมีขนาดใหญ่เกินไป', code: 'SLIP_TOO_LARGE' },
          { status: 413 },
        );
      }
      const formData = await request.formData();
      notificationId = boundedText(formData.get('notificationId'), 128, true) || '';
      const claimedLineId = boundedText(formData.get('lineUserId'), 128, true) || '';
      lineUserId = await requireLiffOwner(request, 'PAWNER', claimedLineId);
      const fileValue = formData.get('file');
      imageFile = fileValue instanceof File ? fileValue : null;
    } else {
      requireInternalRequest(request, ['INTERNAL_API_SECRET']);
      const body = await readBoundedJsonObject(request, 16 * 1024);
      notificationId = boundedText(body.notificationId, 128, true) || '';
      lineUserId = boundedText(body.lineUserId, 128, true) || '';
      imageId = boundedText(body.imageId, 128, true);
      if (!/^U[A-Za-z0-9]{20,64}$/.test(lineUserId) || !imageId || !/^[A-Za-z0-9_-]{1,128}$/.test(imageId)) {
        return NextResponse.json({ error: 'ข้อมูลคำขอไม่ถูกต้อง', code: 'INVALID_REQUEST' }, { status: 400 });
      }
    }

    const { db } = await connectToDatabase();
    const notificationsCollection = db.collection('notifications');
    const notification = await notificationsCollection.findOne({
      shopNotificationId: notificationId,
      lineUserId,
    });
    if (!notification) {
      return NextResponse.json({ error: 'ไม่พบคำขอที่ระบุ', code: 'NOTIFICATION_NOT_FOUND' }, { status: 404 });
    }

    releaseLock = await acquireFinancialLock(`customer-payment-proof:${String(notification._id)}`, 120);
    const current = await notificationsCollection.findOne({ _id: notification._id });
    if (!current) {
      return NextResponse.json({ error: 'ไม่พบคำขอที่ระบุ', code: 'NOTIFICATION_NOT_FOUND' }, { status: 404 });
    }
    if (['payment_pending', 'payment_uploaded'].includes(current.status) && current.paymentProofUrl) {
      return NextResponse.json({ success: true, alreadyUploaded: true });
    }
    if (current.status !== 'confirmed') {
      return NextResponse.json(
        { error: 'คำขอนี้ยังไม่พร้อมรับหลักฐานการชำระ', code: 'INVALID_STATE' },
        { status: 409 },
      );
    }

    let rawImage: Buffer;
    if (multipart && imageFile) {
      if (imageFile.size > MAX_SLIP_BYTES) {
        throw new TransactionRequestError('SLIP_TOO_LARGE', 413, 'ไฟล์สลิปมีขนาดใหญ่เกินไป');
      }
      rawImage = Buffer.from(await imageFile.arrayBuffer());
    } else if (!multipart && imageId) {
      rawImage = await downloadLineImage(imageId);
    } else {
      return NextResponse.json({ error: 'ไม่พบไฟล์สลิป', code: 'SLIP_REQUIRED' }, { status: 400 });
    }
    const image = validateSlipImage(rawImage);

    const filename = `slip-${String(notification._id)}-${Date.now()}.${image.extension}`;
    const blob = await putPrivateBlob(`slips/${filename}`, image.buffer, image.contentType);
    const updateResult = await notificationsCollection.updateOne(
      { _id: notification._id, status: 'confirmed' },
      {
        $set: {
          status: 'payment_pending',
          paymentProofUrl: blob.signedUrl,
          updatedAt: new Date(),
        },
      },
    );
    if (updateResult.modifiedCount !== 1) {
      return NextResponse.json({ error: 'สถานะคำขอถูกเปลี่ยนแล้ว', code: 'STATE_CONFLICT' }, { status: 409 });
    }

    try {
      await sendToShopSystem(notificationId, image, blob.signedUrl);
    } catch {
      await notificationsCollection.updateOne(
        { _id: notification._id, status: 'payment_pending' },
        { $set: { status: 'payment_uploaded', updatedAt: new Date() } },
      );
      return NextResponse.json(
        {
          success: false,
          error: 'ระบบบันทึกสลิปแล้ว แต่การส่งต่อไปยังร้านล่าช้า ระบบจะเก็บรายการไว้ให้',
          code: 'SHOP_DELIVERY_DELAYED',
        },
        { status: 503, headers: { 'Retry-After': '30' } },
      );
    }

    try {
      await getLineClient().pushMessage(lineUserId, {
        type: 'text',
        text: 'อัพโหลดสลิปสำเร็จ\n\nกำลังรอพนักงานตรวจสอบ คุณจะได้รับแจ้งเตือนเมื่อการตรวจสอบเสร็จสิ้น',
      });
    } catch {
      console.warn('[customer:payment-proof] LINE confirmation delayed');
    }

    return NextResponse.json({
      success: true,
      message: 'อัพโหลดสลิปสำเร็จ กำลังรอพนักงานตรวจสอบ',
    });
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    if (error instanceof InternalAuthError) return internalAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[customer:payment-proof] failed');
    return sanitizedServerError('เกิดข้อผิดพลาดในการอัพโหลดสลิป กรุณาลองใหม่');
  } finally {
    await releaseLock?.();
  }
}
