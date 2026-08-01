import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Item } from '@/lib/db/models';
import { ObjectId } from 'mongodb';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';
import { refreshBlobUrls } from '@/lib/storage/blob';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await context.params;
    if (!ObjectId.isValid(itemId)) {
      return NextResponse.json(
        { error: 'รหัสสินค้าไม่ถูกต้อง', code: 'ITEM_ID_INVALID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let lineId: string;
    try {
      const identity = await requireLiffIdentity(request, 'PAWNER');
      lineId = identity.lineId;
    } catch (error) {
      return liffAuthErrorResponse(error);
    }
    await enforceActorRateLimit({
      scope: 'pawner-item-detail',
      actor: lineId,
      limit: 60,
      windowSeconds: 10 * 60,
    });

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection<Item>('items');

    const item = await itemsCollection.findOne({
      _id: new ObjectId(itemId),
      lineId,
    }, {
      projection: {
        brand: 1,
        model: 1,
        type: 1,
        serialNo: 1,
        condition: 1,
        defects: 1,
        note: 1,
        accessories: 1,
        images: 1,
        status: 1,
        estimatedValue: 1,
        desiredAmount: 1,
        loanDays: 1,
        interestRate: 1,
        createdAt: 1,
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: 'ไม่พบสินค้าหรือคุณไม่มีสิทธิ์เข้าถึง', code: 'ITEM_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        item: {
          ...item,
          _id: item._id?.toString(),
          images: await refreshBlobUrls(item.images),
        },
      },
      { headers: { 'Cache-Control': 'no-store, private' } },
    );
  } catch (error) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    if (error instanceof ActorRateLimitError) {
      return NextResponse.json(
        {
          error: error.status === 429
            ? 'เรียกดูข้อมูลถี่เกินไป กรุณารอสักครู่'
            : 'ระบบควบคุมการใช้งานยังไม่พร้อม กรุณาลองใหม่',
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
    console.error('[items:detail] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถโหลดข้อมูลสินค้าได้', code: 'ITEM_LOOKUP_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
