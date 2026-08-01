import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Item } from '@/lib/db/models';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';
import { refreshBlobUrls } from '@/lib/storage/blob';

const ALLOWED_STATUSES = new Set<Item['status']>([
  'pending',
  'active',
  'redeemed',
  'lost',
  'sold',
  'temporary',
]);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const claimedLineId = String(searchParams.get('lineId') || '').trim();
    const requestedStatus = String(searchParams.get('status') || '').trim();

    if (!claimedLineId) {
      return NextResponse.json(
        { error: 'ข้อมูลบัญชีไม่ครบถ้วน', code: 'LINE_ID_REQUIRED' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (requestedStatus && !ALLOWED_STATUSES.has(requestedStatus as Item['status'])) {
      return NextResponse.json(
        { error: 'สถานะสินค้าไม่ถูกต้อง', code: 'ITEM_STATUS_INVALID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let lineId: string;
    try {
      lineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);
    } catch (error) {
      return liffAuthErrorResponse(error);
    }
    await enforceActorRateLimit({
      scope: 'pawner-item-list',
      actor: lineId,
      limit: 60,
      windowSeconds: 10 * 60,
    });

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection<Item>('items');

    const query: { lineId: string; status?: Item['status'] } = { lineId };
    if (requestedStatus) {
      query.status = requestedStatus as Item['status'];
    }

    const items = await itemsCollection
      .find(query, {
        projection: {
          brand: 1,
          model: 1,
          type: 1,
          condition: 1,
          images: 1,
          status: 1,
          estimatedValue: 1,
          createdAt: 1,
        },
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    const safeItems = await Promise.all(items.map(async (item) => ({
      ...item,
      _id: item._id?.toString(),
      images: await refreshBlobUrls(item.images),
    })));

    return NextResponse.json(
      { success: true, items: safeItems },
      { headers: { 'Cache-Control': 'no-store, private' } },
    );
  } catch (error) {
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
    console.error('[items:list] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถโหลดรายการสินค้าได้', code: 'ITEM_LIST_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
