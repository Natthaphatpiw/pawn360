import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { sendQRCodeImage } from '@/lib/line/client';
import { uploadQRCodeToBlob } from '@/lib/storage/blob';
import { generateQRCode, generateQRCodeData } from '@/lib/utils/qrcode';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import { acquireTransactionLock, transactionLockErrorResponse } from '@/lib/security/transaction-lock';
import {
  boundedText,
  readBoundedJsonObject,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request) as any;
    const { itemId, lineId } = body;

    if (!itemId || !lineId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    const safeItemId = boundedText(itemId, 64, true) || '';
    if (!ObjectId.isValid(safeItemId)) {
      return NextResponse.json({ error: 'รหัสรายการไม่ถูกต้อง' }, { status: 400 });
    }
    const verifiedLineId = await requireLiffOwner(
      request,
      'PAWNER',
      boundedText(lineId, 128, true) || '',
    );
    releaseLock = await acquireTransactionLock('pawn-negotiation-accept', safeItemId, 90);

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');
    const customersCollection = db.collection('customers');

    // ดึงข้อมูล item
    const item = await itemsCollection.findOne({ _id: new ObjectId(safeItemId) });
    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // ตรวจสอบว่าเป็นเจ้าของ item
    if (item.lineId !== verifiedLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }
    if (item.status !== 'pending') {
      return NextResponse.json(
        { error: 'รายการนี้ไม่สามารถยืนยันข้อเสนอได้แล้ว' },
        { status: 409 },
      );
    }

    const alreadyAccepted = item.negotiationStatus === 'accepted';
    if (!alreadyAccepted && item.negotiationStatus !== 'pending') {
      return NextResponse.json(
        { error: 'รายการนี้ยังไม่มีข้อเสนอที่รอยืนยัน' },
        { status: 409 },
      );
    }

    // Build the immutable QR artifact before changing state. If generation
    // fails, the pending offer remains retryable.
    const qrData = generateQRCodeData(safeItemId);
    const qrCodeDataURL = await generateQRCode(qrData);
    const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');
    const qrBuffer = Buffer.from(base64Data, 'base64');

    const signedUrl = await uploadQRCodeToBlob(safeItemId, qrBuffer);

    if (!alreadyAccepted) {
      const accepted = await itemsCollection.updateOne(
        { _id: new ObjectId(safeItemId), status: 'pending', negotiationStatus: 'pending' },
        {
          $set: {
            negotiationStatus: 'accepted',
            updatedAt: new Date(),
          },
        }
      );
      if (accepted.modifiedCount !== 1) {
        return NextResponse.json(
          { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
          { status: 409 },
        );
      }
    }

    // อัปเดต QR Code ใน pawnRequest
    await customersCollection.updateOne(
      { lineId: verifiedLineId, 'pawnRequests.itemId': new ObjectId(safeItemId) },
      {
        $set: {
          'pawnRequests.$.qrCode': signedUrl,
        },
      }
    );

    // ส่ง QR Code ใหม่ไปยังลูกค้า
    await sendQRCodeImage(verifiedLineId, safeItemId, signedUrl);

    return NextResponse.json({
      success: true,
      alreadyAccepted,
      message: 'Negotiation accepted. New QR code sent.',
    });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Accept negotiation error');
    return sanitizedServerError('ไม่สามารถยืนยันข้อเสนอได้ กรุณาลองใหม่');
  } finally {
    if (releaseLock) await releaseLock();
  }
}
