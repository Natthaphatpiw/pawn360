import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import { sendNegotiationMessage } from '@/lib/line/client';
import { uploadQRCodeToS3, getQRCodePresignedUrl } from '@/lib/aws/s3';
import { generateQRCode, generateQRCodeData } from '@/lib/utils/qrcode';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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

    const { db } = await connectToDatabase();
    const storesCollection = db.collection('stores');
    const itemsCollection = db.collection('items');
    const customersCollection = db.collection('customers');

    // ตรวจสอบร้านค้าและรหัสผ่าน
    const store = await storesCollection.findOne({ _id: new ObjectId(storeId) });
    if (!store) {
      return NextResponse.json(
        { error: 'Store not found' },
        { status: 404 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, store.password);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // ดึงข้อมูล item
    const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });
    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // แปลงค่าให้เป็น number ก่อนบันทึก
    const amountNum = parseFloat(String(negotiatedAmount));
    const daysNum = parseInt(String(negotiatedDays));
    const rateNum = parseFloat(String(negotiatedInterestRate));

    console.log(`💰 Negotiation data: Amount=${amountNum}, Days=${daysNum}, Rate=${rateNum}%`);

    // อัปเดตข้อมูลการต่อรองใน item
    await itemsCollection.updateOne(
      { _id: new ObjectId(itemId) },
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

    // สร้าง QR Code ใหม่พร้อมข้อมูลที่ต่อรองแล้ว
    const qrData = generateQRCodeData(itemId);
    const qrCodeDataURL = await generateQRCode(qrData);
    const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');
    const qrBuffer = Buffer.from(base64Data, 'base64');

    // Upload to S3
    await uploadQRCodeToS3(itemId, qrBuffer);
    const presignedUrl = await getQRCodePresignedUrl(itemId, 7 * 24 * 3600);

    // อัปเดต QR Code ใน pawnRequest
    await customersCollection.updateOne(
      { lineId: item.lineId, 'pawnRequests.itemId': new ObjectId(itemId) },
      {
        $set: {
          'pawnRequests.$.qrCode': presignedUrl,
        },
      }
    );

    // คำนวณดอกเบี้ยและยอดรวม (ใช้ค่าที่แปลงแล้ว)
    const interest = (amountNum * rateNum * (daysNum / 30)) / 100;
    const totalAmount = amountNum + interest;

    console.log(`💰 Negotiation calculation: Interest=${interest}, Total=${totalAmount}`);

    // ส่งการแจ้งเตือนไปยังลูกค้า (ใช้ค่าที่แปลงแล้ว)
    await sendNegotiationMessage(
      item.lineId,
      itemId,
      amountNum,
      daysNum,
      rateNum,
      interest,
      totalAmount,
      presignedUrl
    );

    return NextResponse.json({
      success: true,
      message: 'Negotiation sent to customer',
    });
  } catch (error: any) {
    console.error('Negotiation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
