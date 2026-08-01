import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import { sendNegotiationMessage } from '@/lib/line/client';
import { uploadQRCodeToBlob } from '@/lib/storage/blob';
import { generateQRCode, generateQRCodeData } from '@/lib/utils/qrcode';
import { requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import { acquireTransactionLock, transactionLockErrorResponse } from '@/lib/security/transaction-lock';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';
import {
  boundedText,
  finiteNumber,
  readBoundedJsonObject,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request) as any;
    const {
      itemId,
      storeId,
      password,
      negotiatedAmount,
      negotiatedDays,
      negotiatedInterestRate,
    } = body;

    if (!itemId || !storeId || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    const safeItemId = boundedText(itemId, 64, true) || '';
    const safeStoreId = boundedText(storeId, 64, true) || '';
    const safePassword = boundedText(password, 256, true) || '';
    if (!ObjectId.isValid(safeItemId) || !ObjectId.isValid(safeStoreId)) {
      return NextResponse.json({ error: 'รหัสรายการไม่ถูกต้อง' }, { status: 400 });
    }
    const identity = await requireLiffIdentity(request, 'STORE');
    await enforceActorRateLimit({
      scope: 'pawn-negotiation-password',
      actor: `${identity.lineId}:${safeStoreId}`,
      limit: 20,
      windowSeconds: 5 * 60,
    });
    releaseLock = await acquireTransactionLock('pawn-negotiation', safeItemId, 90);

    const { db } = await connectToDatabase();
    const storesCollection = db.collection('stores');
    const itemsCollection = db.collection('items');
    const customersCollection = db.collection('customers');

    // ตรวจสอบร้านค้าและรหัสผ่าน
    const storeObjectId = new ObjectId(safeStoreId);
    const store = await storesCollection.findOne({
      _id: storeObjectId,
      lineIds: identity.lineId,
      isActive: { $ne: false },
    });
    if (!store) {
      return NextResponse.json(
        { error: 'Store not found' },
        { status: 404 }
      );
    }

    const passwordHash = store.passwordHash || store.password;
    if (!passwordHash) {
      return NextResponse.json({ error: 'บัญชีร้านค้ายังไม่พร้อมใช้งาน' }, { status: 409 });
    }
    const isPasswordValid = await bcrypt.compare(safePassword, passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // ดึงข้อมูล item
    const item = await itemsCollection.findOne({
      _id: new ObjectId(safeItemId),
      storeId: storeObjectId,
      status: 'pending',
    });
    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // แปลงค่าให้เป็น number ก่อนบันทึก
    const amountNum = finiteNumber(negotiatedAmount, { min: 1, max: 100_000_000, required: true }) || 0;
    const daysNum = finiteNumber(negotiatedDays, { min: 1, max: 365, required: true }) || 0;
    const rateNum = finiteNumber(negotiatedInterestRate, { min: 0, max: 100, required: true }) || 0;

    const alreadyPending = item.negotiationStatus === 'pending';
    const samePendingOffer = alreadyPending
      && Number(item.negotiatedAmount) === amountNum
      && Number(item.negotiatedDays) === daysNum
      && Number(item.negotiatedInterestRate) === rateNum;
    if (alreadyPending && !samePendingOffer) {
      return NextResponse.json(
        { error: 'รายการนี้มีข้อเสนอที่กำลังรอยืนยันอยู่แล้ว' },
        { status: 409 },
      );
    }
    if (!alreadyPending && !['none', 'accepted'].includes(item.negotiationStatus)) {
      return NextResponse.json(
        { error: 'สถานะข้อเสนอปัจจุบันไม่รองรับการต่อรอง' },
        { status: 409 },
      );
    }

    // Prepare the QR artifact before the state transition. A provider/storage
    // error therefore leaves the previous offer state retryable.
    const qrData = generateQRCodeData(safeItemId);
    const qrCodeDataURL = await generateQRCode(qrData);
    const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');
    const qrBuffer = Buffer.from(base64Data, 'base64');
    const signedUrl = await uploadQRCodeToBlob(safeItemId, qrBuffer);

    // อัปเดตข้อมูลการต่อรองใน item
    if (!samePendingOffer) {
      const updated = await itemsCollection.updateOne(
        {
          _id: new ObjectId(safeItemId),
          storeId: storeObjectId,
          status: 'pending',
          negotiationStatus: { $in: ['none', 'accepted'] },
        },
        {
          $set: {
            negotiatedAmount: amountNum,
            negotiatedDays: daysNum,
            negotiatedInterestRate: rateNum,
            negotiationStatus: 'pending',
            updatedAt: new Date(),
          },
        }
      );
      if (updated.modifiedCount !== 1) {
        return NextResponse.json(
          { error: 'รายการนี้มีข้อเสนอที่กำลังรอยืนยันอยู่แล้ว' },
          { status: 409 },
        );
      }
    }

    // อัปเดต QR Code ใน pawnRequest
    await customersCollection.updateOne(
      { lineId: item.lineId, 'pawnRequests.itemId': new ObjectId(safeItemId) },
      {
        $set: {
          'pawnRequests.$.qrCode': signedUrl,
        },
      }
    );

    // คำนวณดอกเบี้ยและยอดรวม (ใช้ค่าที่แปลงแล้ว)
    const interest = (amountNum * rateNum * (daysNum / 30)) / 100;
    const totalAmount = amountNum + interest;

    // ส่งการแจ้งเตือนไปยังลูกค้า (ใช้ค่าที่แปลงแล้ว)
    await sendNegotiationMessage(
      item.lineId,
      safeItemId,
      amountNum,
      daysNum,
      rateNum,
      interest,
      totalAmount,
      signedUrl
    );

    return NextResponse.json({
      success: true,
      resent: samePendingOffer,
      message: 'Negotiation sent to customer',
    });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    if (error instanceof ActorRateLimitError) {
      return NextResponse.json(
        {
          error: error.status === 429
            ? 'ลองตรวจสอบรหัสผ่านถี่เกินไป กรุณารอแล้วลองใหม่'
            : 'ระบบตรวจสอบความปลอดภัยยังไม่พร้อม กรุณาลองใหม่',
          code: error.code,
        },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(error.retryAfterSeconds),
          },
        },
      );
    }
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Negotiation error');
    return sanitizedServerError('ไม่สามารถส่งข้อเสนอได้ กรุณาลองใหม่');
  } finally {
    if (releaseLock) await releaseLock();
  }
}
