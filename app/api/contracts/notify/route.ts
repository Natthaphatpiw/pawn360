import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { sendContractCompletionNotification } from '@/lib/line/client';
import { requireStoreMembership } from '@/lib/security/contract-access';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  boundedText,
  finiteNumber,
  readBoundedJsonObject,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

function retryKeyFromDigest(digest: string): string {
  const bytes = Buffer.from(digest.slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request, 32 * 1024);
    const itemId = String(body.itemId || '').trim();
    const rawContract = body.contractData;
    if (!ObjectId.isValid(itemId) || !rawContract || typeof rawContract !== 'object' || Array.isArray(rawContract)) {
      return NextResponse.json({ error: 'ข้อมูลคำขอไม่ถูกต้อง', code: 'INVALID_REQUEST' }, { status: 400 });
    }

    const input = rawContract as Record<string, unknown>;
    const contractData = {
      contractNumber: boundedText(input.contractNumber, 64, true) || '',
      price: finiteNumber(input.price, { min: 0, max: 100_000_000, required: true }) || 0,
      interestRate: finiteNumber(input.interestRate, { min: 0, max: 100, required: true }) || 0,
      periodDays: finiteNumber(input.periodDays, { min: 1, max: 3_650, required: true }) || 0,
    };
    if (!Number.isInteger(contractData.periodDays)) {
      return NextResponse.json({ error: 'ข้อมูลสัญญาไม่ถูกต้อง', code: 'INVALID_CONTRACT_TERMS' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');
    const item = await itemsCollection.findOne(
      { _id: new ObjectId(itemId) },
      {
        projection: {
          _id: 1,
          lineId: 1,
          storeId: 1,
          brand: 1,
          model: 1,
          contractNotificationFingerprint: 1,
        },
      },
    );
    if (!item || typeof item.lineId !== 'string' || !item.storeId) {
      return NextResponse.json({ error: 'ไม่พบรายการ', code: 'ITEM_NOT_FOUND' }, { status: 404 });
    }

    await requireStoreMembership(request, db, item.storeId);
    releaseLock = await acquireFinancialLock(`mongo-contract:notify:${itemId}`);

    const fingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify({ itemId, ...contractData }))
      .digest('hex');
    if (item.contractNotificationFingerprint === fingerprint) {
      return NextResponse.json({ success: true, alreadySent: true });
    }

    const result = await sendContractCompletionNotification(
      item.lineId,
      contractData,
      item,
      retryKeyFromDigest(fingerprint),
    );
    await itemsCollection.updateOne(
      { _id: item._id },
      {
        $set: {
          contractNotificationFingerprint: fingerprint,
          contractNotificationSentAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );

    return NextResponse.json({
      success: true,
      contractNumber: result.contractNumber,
    });
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[contract:notify] failed');
    return sanitizedServerError('ไม่สามารถส่งแจ้งเตือนได้ชั่วคราว กรุณาลองใหม่');
  } finally {
    await releaseLock?.();
  }
}
