import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import bcrypt from 'bcrypt';

export async function POST(request: NextRequest) {
  try {
    const { storeId, password, confirmPassword } = await request.json();

    if (!storeId || !password) {
      return NextResponse.json(
        { error: 'กรุณาระบุรหัสร้านค้าและรหัสผ่าน' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'รหัสผ่านไม่ตรงกัน' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const storesCollection = db.collection('stores');

    const store = await storesCollection.findOne({ _id: new (await import('mongodb')).ObjectId(storeId) });

    if (!store) {
      return NextResponse.json(
        { error: 'ไม่พบร้านค้า' },
        { status: 404 }
      );
    }

    // Check if store already has password
    const existingPassword = store.passwordHash || store.password;
    if (existingPassword) {
      return NextResponse.json(
        { error: 'ร้านค้านี้มีรหัสผ่านอยู่แล้ว' },
        { status: 400 }
      );
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update store with new password
    const result = await storesCollection.updateOne(
      { _id: store._id },
      {
        $set: {
          password: hashedPassword,
          passwordHash: hashedPassword, // Keep both for compatibility
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'ไม่สามารถอัพเดทรหัสผ่านได้' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'ตั้งรหัสผ่านเรียบร้อยแล้ว',
      store: {
        _id: store._id,
        storeName: store.storeName
      }
    });
  } catch (error) {
    console.error('Error setting store password:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการตั้งรหัสผ่าน' },
      { status: 500 }
    );
  }
}
