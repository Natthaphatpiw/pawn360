import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { sendConfirmationMessage } from '@/lib/line/client';
import { requireStoreMembership } from '@/lib/security/contract-access';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
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
    const body = await readBoundedJsonObject(request, 64 * 1024);
    const itemId = String(body.itemId || '').trim();
    const rawContract = body.newContract;
    if (!ObjectId.isValid(itemId) || !rawContract || typeof rawContract !== 'object' || Array.isArray(rawContract)) {
      return NextResponse.json(
        { error: 'ข้อมูลคำขอไม่ถูกต้อง', code: 'INVALID_REQUEST' },
        { status: 400 },
      );
    }

    const contractInput = rawContract as Record<string, unknown>;
    const storeId = String(contractInput.storeId || '').trim();
    const pawnPrice = finiteNumber(contractInput.pawnPrice, { min: 1, max: 100_000_000, required: true }) || 0;
    const interestRate = finiteNumber(contractInput.interestRate, { min: 0, max: 100, required: true }) || 0;
    const loanDays = finiteNumber(contractInput.loanDays, { min: 1, max: 3_650, required: true }) || 0;
    if (!ObjectId.isValid(storeId) || !Number.isInteger(loanDays)) {
      return NextResponse.json(
        { error: 'ข้อมูลสัญญาไม่ถูกต้อง', code: 'INVALID_CONTRACT_TERMS' },
        { status: 400 },
      );
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
          desiredAmount: 1,
          estimatedValue: 1,
          loanDays: 1,
          interestRate: 1,
          confirmationNotificationFingerprint: 1,
        },
      },
    );
    if (!item || typeof item.lineId !== 'string') {
      return NextResponse.json({ error: 'ไม่พบรายการ', code: 'ITEM_NOT_FOUND' }, { status: 404 });
    }

    const { store } = await requireStoreMembership(request, db, storeId);
    if (item.storeId && String(item.storeId) !== storeId) {
      throw new LiffAuthError('CONTRACT_ACCESS_DENIED', 403);
    }
    releaseLock = await acquireFinancialLock(`mongo-contract:send-confirmation:${itemId}`);

    const originalAmount = Number(item.desiredAmount || item.estimatedValue || 0);
    const originalDays = Number(item.loanDays || 30);
    const originalRate = Number(item.interestRate || 0);
    const modifications = {
      original: { amount: originalAmount, days: originalDays, rate: originalRate },
      new: { amount: pawnPrice, days: loanDays, rate: interestRate },
      hasChanges: originalAmount !== pawnPrice || originalDays !== loanDays || originalRate !== interestRate,
    };
    const interest = Math.round((pawnPrice * interestRate * loanDays) / 30) / 100;
    const newContract = {
      itemId,
      pawnPrice,
      interestRate,
      loanDays,
      interest,
      total: pawnPrice + interest,
      item: [item.brand, item.model].filter(Boolean).join(' '),
      storeId,
      storeName: typeof store.storeName === 'string' ? store.storeName.slice(0, 255) : '',
    };
    const notificationFingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify({ itemId, modifications, newContract }))
      .digest('hex');
    if (item.confirmationNotificationFingerprint === notificationFingerprint) {
      return NextResponse.json({ success: true, alreadySent: true });
    }

    const updateResult = await itemsCollection.updateOne(
      { _id: item._id },
      {
        $set: {
          confirmationStatus: 'pending',
          confirmationModifications: modifications,
          confirmationNewContract: newContract,
          confirmationTimestamp: new Date(),
          updatedAt: new Date(),
          storeId: new ObjectId(storeId),
        },
      },
    );
    if (updateResult.matchedCount !== 1) {
      return NextResponse.json({ error: 'ไม่พบรายการ', code: 'ITEM_NOT_FOUND' }, { status: 404 });
    }

    await sendConfirmationMessage(
      item.lineId,
      modifications,
      newContract,
      retryKeyFromDigest(notificationFingerprint),
    );
    await itemsCollection.updateOne(
      { _id: item._id },
      {
        $set: {
          confirmationNotificationFingerprint: notificationFingerprint,
          confirmationNotificationSentAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );

    return NextResponse.json({
      success: true,
      message: 'ส่งข้อความยืนยันแล้ว',
    });
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[contract:send-confirmation] failed');
    return sanitizedServerError('ไม่สามารถส่งข้อความยืนยันได้ชั่วคราว กรุณาลองใหม่');
  } finally {
    await releaseLock?.();
  }
}
