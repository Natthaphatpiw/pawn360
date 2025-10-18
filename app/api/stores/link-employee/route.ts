import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lineId, storeId, password } = body;

    if (!lineId || !storeId || !password) {
      return NextResponse.json(
        { error: 'กรุณากรอกข้อมูลให้ครบถ้วน' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const storesCollection = db.collection('stores');

    // Find store
    const store = await storesCollection.findOne({ _id: new ObjectId(storeId) });

    if (!store) {
      return NextResponse.json(
        { error: 'ไม่พบร้านค้าในระบบ' },
        { status: 404 }
      );
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, store.passwordHash);

    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'รหัสผ่านไม่ถูกต้อง' },
        { status: 401 }
      );
    }

    // Check if lineId already linked
    if (store.lineIds && store.lineIds.includes(lineId)) {
      return NextResponse.json(
        { error: 'LINE ID นี้ได้เชื่อมโยงกับร้านนี้แล้ว' },
        { status: 400 }
      );
    }

    // Add lineId to store's lineIds array
    await storesCollection.updateOne(
      { _id: new ObjectId(storeId) },
      {
        $addToSet: { lineIds: lineId },
        $set: { updatedAt: new Date() }
      }
    );

    return NextResponse.json({
      success: true,
      message: 'เชื่อมโยงพนักงานกับร้านค้าสำเร็จ',
      storeName: store.storeName,
    });
  } catch (error: any) {
    console.error('Link employee error:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการเชื่อมโยง' },
      { status: 500 }
    );
  }
}
