import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Store } from '@/lib/db/models';
import bcrypt from 'bcrypt';

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const storesCollection = db.collection<Store>('stores');

    const stores = await storesCollection
      .find({})
      .project({ _id: 1, storeName: 1, interestRate: 1 })
      .sort({ storeName: 1 })
      .toArray();

    return NextResponse.json({
      success: true,
      stores,
    });
  } catch (error: any) {
    console.error('Error fetching stores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stores' },
      { status: 500 }
    );
  }
}

// Verify store password
export async function POST(request: NextRequest) {
  try {
    const { storeId, password } = await request.json();

    if (!storeId) {
      return NextResponse.json(
        { error: 'กรุณาระบุรหัสร้านค้า' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const storesCollection = db.collection<Store>('stores');

    const store = await storesCollection.findOne({ _id: new (await import('mongodb')).ObjectId(storeId) });

    if (!store) {
      return NextResponse.json(
        { error: 'ไม่พบร้านค้า' },
        { status: 404 }
      );
    }

    // Check if store has password field
    const storedPassword = store.passwordHash || store.password;
    if (!storedPassword) {
      // Store has no password - return special response for setting password
      return NextResponse.json({
        success: false,
        needsPassword: true,
        store: {
          _id: store._id,
          storeName: store.storeName
        }
      });
    }

    // If no password provided but store has password, it's invalid
    if (!password) {
      return NextResponse.json(
        { error: 'กรุณาระบุรหัสผ่าน' },
        { status: 400 }
      );
    }

    const isValidPassword = await bcrypt.compare(password, storedPassword);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'รหัสผ่านไม่ถูกต้อง' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      store: {
        _id: store._id,
        storeName: store.storeName,
        interestRate: store.interestRate
      }
    });
  } catch (error) {
    console.error('Error verifying store password:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการตรวจสอบรหัสผ่าน' },
      { status: 500 }
    );
  }
}
