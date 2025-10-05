import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { sendQRCodeImage } from '@/lib/line/client';
import { uploadQRCodeToS3, getQRCodePresignedUrl } from '@/lib/aws/s3';
import { generateQRCode, generateQRCodeData } from '@/lib/utils/qrcode';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, lineId } = body;

    if (!itemId || !lineId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');
    const customersCollection = db.collection('customers');

    // ดึงข้อมูล item
    const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });
    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // ตรวจสอบว่าเป็นเจ้าของ item
    if (item.lineId !== lineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // อัปเดตสถานะเป็น accepted
    await itemsCollection.updateOne(
      { _id: new ObjectId(itemId) },
      {
        $set: {
          negotiationStatus: 'accepted',
          updatedAt: new Date(),
        },
      }
    );

    // สร้าง QR Code ใหม่
    const qrData = generateQRCodeData(itemId);
    const qrCodeDataURL = await generateQRCode(qrData);
    const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');
    const qrBuffer = Buffer.from(base64Data, 'base64');

    // Upload to S3
    await uploadQRCodeToS3(itemId, qrBuffer);
    const presignedUrl = await getQRCodePresignedUrl(itemId, 7 * 24 * 3600);

    // อัปเดต QR Code ใน pawnRequest
    await customersCollection.updateOne(
      { lineId, 'pawnRequests.itemId': new ObjectId(itemId) },
      {
        $set: {
          'pawnRequests.$.qrCode': presignedUrl,
        },
      }
    );

    // ส่ง QR Code ใหม่ไปยังลูกค้า
    await sendQRCodeImage(lineId, itemId, presignedUrl);

    return NextResponse.json({
      success: true,
      message: 'Negotiation accepted. New QR code sent.',
    });
  } catch (error: any) {
    console.error('Accept negotiation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
