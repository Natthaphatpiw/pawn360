import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import bcrypt from 'bcrypt';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lineId, storeName, ownerData, address, phone, taxId } = body;

    if (!lineId || !storeName || !ownerData || !address || !phone) {
      return NextResponse.json(
        { error: 'กรุณากรอกข้อมูลให้ครบถ้วน' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');
    const storesCollection = db.collection('stores');

    // Check if lineId already exists in users
    const existingUser = await usersCollection.findOne({ lineId });
    if (existingUser) {
      return NextResponse.json(
        { error: 'LINE ID นี้ได้ลงทะเบียนไว้แล้ว' },
        { status: 400 }
      );
    }

    // Create password hash
    const passwordHash = await bcrypt.hash(ownerData.password, 12);

    // Create user document
    const userDoc = {
      email: ownerData.email,
      passwordHash,
      role: 'owner',
      fullName: ownerData.fullName,
      phone,
      profileImage: null,
      address,
      lineId, // เพิ่ม lineId ใน user document
      isActive: true,
      lastLogin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const userResult = await usersCollection.insertOne(userDoc);
    const userId = userResult.insertedId;

    // Create store document
    const storeDoc = {
      storeName,
      ownerName: ownerData.fullName,
      ownerEmail: ownerData.email,
      phone,
      taxId: taxId || null,
      address,
      interestRate: 10, // Default interest rate
      password: passwordHash, // Store hashed password
      ownerId: userId,
      logoUrl: null,
      stampUrl: null,
      signatureUrl: null,
      interestPresets: [
        { days: 7, rate: 3.0 },
        { days: 15, rate: 5.0 },
        { days: 30, rate: 10.0 },
      ],
      contractTemplate: {
        header: 'สัญญาจำนำทองคำ',
        footer: 'ขอบคุณที่ใช้บริการ',
        terms: 'เงื่อนไขการจำนำมาตรฐาน',
      },
      lineIds: [lineId], // เพิ่ม lineIds เป็น array
      passwordHash, // Keep for backward compatibility
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const storeResult = await storesCollection.insertOne(storeDoc);

    return NextResponse.json({
      success: true,
      message: 'ลงทะเบียนร้านค้าสำเร็จ',
      userId: userId.toString(),
      storeId: storeResult.insertedId.toString(),
    });
  } catch (error: any) {
    console.error('Store registration error:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการลงทะเบียน' },
      { status: 500 }
    );
  }
}
