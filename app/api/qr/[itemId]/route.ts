import { NextRequest, NextResponse } from 'next/server';
import { getQRCodeSignedUrl } from '@/lib/storage/blob';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import { sanitizedServerError } from '@/lib/security/transaction-request';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await context.params;
    if (!ObjectId.isValid(itemId)) {
      return NextResponse.json(
        { error: 'รหัสรายการไม่ถูกต้อง', code: 'INVALID_ITEM_ID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { db } = await connectToDatabase();
    const item = await db.collection('items').findOne(
      { _id: new ObjectId(itemId) },
      { projection: { _id: 1, lineId: 1 } },
    );
    if (!item || typeof item.lineId !== 'string') {
      return NextResponse.json(
        { error: 'ไม่พบรายการ', code: 'ITEM_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    await requireLiffOwner(request, 'PAWNER', item.lineId);

    // Only the owner can mint a fresh private URL for the QR payload.
    const signedUrl = await getQRCodeSignedUrl(itemId, 3600);

    return NextResponse.json({
      success: true,
      url: signedUrl,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    console.error('[qr:signed-url] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return sanitizedServerError('ไม่สามารถเปิด QR Code ได้ชั่วคราว');
  }
}
