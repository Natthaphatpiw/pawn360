import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import {
  boundedText,
  readBoundedJsonObject,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const DUMMY_PASSWORD_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8O2fq3UjKZl6QfNU9LvkX75SwhiuAu';

export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request, 8 * 1024);
    const claimedLineId = boundedText(body.lineId, 80, true) || '';
    const storeId = boundedText(body.storeId, 24, true) || '';
    const password = boundedText(body.password, 128, true) || '';
    if (!ObjectId.isValid(storeId)) {
      return NextResponse.json(
        { error: 'ข้อมูลร้านค้าหรือรหัสผ่านไม่ถูกต้อง', code: 'STORE_LINK_INVALID' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let lineId: string;
    try {
      lineId = await requireLiffOwner(request, 'STORE', claimedLineId);
    } catch (error) {
      return liffAuthErrorResponse(error);
    }
    await enforceActorRateLimit({
      scope: 'store-link-employee',
      actor: lineId,
      limit: 10,
      windowSeconds: 10 * 60,
    });

    const { db } = await connectToDatabase();
    const storesCollection = db.collection('stores');
    const storeObjectId = new ObjectId(storeId);
    const store = await storesCollection.findOne(
      { _id: storeObjectId, isActive: { $ne: false } },
      { projection: { _id: 1, storeName: 1, lineIds: 1, passwordHash: 1, password: 1 } },
    );
    const passwordHash = typeof store?.passwordHash === 'string'
      ? store.passwordHash
      : typeof store?.password === 'string' && store.password.startsWith('$2')
        ? store.password
        : '';
    const passwordMatches = await bcrypt
      .compare(password, passwordHash || DUMMY_PASSWORD_HASH)
      .catch(() => false);
    if (!store || !passwordHash || !passwordMatches) {
      return NextResponse.json(
        { error: 'ข้อมูลร้านค้าหรือรหัสผ่านไม่ถูกต้อง', code: 'STORE_LINK_INVALID' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (Array.isArray(store.lineIds) && store.lineIds.includes(lineId)) {
      return NextResponse.json(
        { success: true, alreadyLinked: true, storeName: store.storeName },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const result = await storesCollection.updateOne(
      { _id: storeObjectId, isActive: { $ne: false } },
      {
        $addToSet: { lineIds: lineId },
        $set: { updatedAt: new Date() },
      },
    );
    if (result.matchedCount !== 1) throw new Error('STORE_LINK_UPDATE_FAILED');

    return NextResponse.json(
      { success: true, message: 'เชื่อมโยงพนักงานกับร้านค้าสำเร็จ', storeName: store.storeName },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if (error instanceof ActorRateLimitError) {
      return NextResponse.json(
        {
          error: error.status === 429
            ? 'ลองเชื่อมโยงร้านค้าถี่เกินไป กรุณารอสักครู่'
            : 'ระบบเชื่อมโยงร้านค้ายังไม่พร้อม กรุณาลองใหม่',
          code: error.code,
          retryable: true,
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
    console.error('[stores:link-employee] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการเชื่อมโยง', code: 'STORE_LINK_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
