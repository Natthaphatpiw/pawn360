import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { requireStoreMembership } from '@/lib/security/contract-access';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import { sanitizedServerError } from '@/lib/security/transaction-request';

export async function GET(request: NextRequest) {
  try {
    await requireLiffIdentity(request, 'STORE');
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');

    if (!itemId || !ObjectId.isValid(itemId)) {
      return NextResponse.json(
        { error: 'รหัสรายการไม่ถูกต้อง', code: 'INVALID_ITEM_ID' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');

    const item = await itemsCollection.findOne(
      { _id: new ObjectId(itemId) },
      { projection: { confirmationStatus: 1, storeId: 1 } },
    );

    if (!item || !item.storeId) {
      return NextResponse.json(
        { error: 'ไม่พบรายการ', code: 'ITEM_NOT_FOUND' },
        { status: 404 }
      );
    }

    await requireStoreMembership(request, db, item.storeId);

    return NextResponse.json({
      status: item.confirmationStatus || 'pending'
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    console.error('[contracts:confirmation-status] failed');
    return sanitizedServerError('ไม่สามารถตรวจสอบสถานะได้ กรุณาลองใหม่');
  }
}
