import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { sendConfirmationMessage } from '@/lib/line/client';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';

export async function POST(request: NextRequest) {
  try {
    const { itemId, storeId, password } = await request.json();

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
    const contractsCollection = db.collection('contracts');

    // 1. ดึงข้อมูลร้านค้าและตรวจสอบรหัสผ่าน
    const store = await storesCollection.findOne({ _id: new ObjectId(storeId) });

    if (!store) {
      return NextResponse.json(
        { error: 'ไม่พบร้านค้า' },
        { status: 404 }
      );
    }

    // ตรวจสอบรหัสผ่าน
    const passwordMatch = await bcrypt.compare(password, store.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'รหัสผ่านไม่ถูกต้อง' },
        { status: 401 }
      );
    }

    // 2. ดึงข้อมูลรายการจำนำ
    const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });

    if (!item) {
      return NextResponse.json(
        { error: 'ไม่พบรายการจำนำ' },
        { status: 404 }
      );
    }

    if (item.status !== 'pending') {
      return NextResponse.json(
        { error: 'รายการนี้ถูกประมวลผลแล้ว' },
        { status: 400 }
      );
    }

    // 3. ดึงข้อมูลลูกค้า
    const customer = await customersCollection.findOne({ lineId: item.lineId });

    if (!customer) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลลูกค้า' },
        { status: 404 }
      );
    }

    // 4. เตรียมข้อมูลสัญญาและส่งการยืนยันเสมอ
    const startDate = new Date();

    // ใช้ค่าที่ต่อรองแล้ว (ถ้ามี) หรือค่าเริ่มต้น
    const pawnedPrice = item.negotiatedAmount || item.desiredAmount || 0;
    const interestRate = item.negotiatedInterestRate || item.interestRate || 3;
    const periodDays = item.negotiatedDays || item.loanDays || 30;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + periodDays);

    // คำนวณดอกเบี้ยและยอดรวม
    const interestAmount = (pawnedPrice * interestRate * (periodDays / 30)) / 100;
    const remainingAmount = pawnedPrice + interestAmount;

    // เตรียมข้อมูลสัญญาสำหรับการยืนยัน
    const proposedContract = {
      pawnedPrice,
      interestRate,
      periodDays,
      interestAmount,
      remainingAmount,
      storeName: store.storeName,
      storeId: storeId,
    };

    // สร้างข้อมูลการแก้ไข (แม้จะไม่มีการแก้ไขจริง ก็ส่งเป็นการยืนยัน)
    const modifications = {
      type: 'contract_creation', // แสดงว่าเป็นการสร้างสัญญาใหม่ ไม่ใช่การแก้ไข
      originalValues: null,
      newValues: proposedContract,
      changes: [] // ไม่มีการเปลี่ยนแปลง เพราะเป็นการสร้างใหม่
    };

    // บันทึกข้อมูลการยืนยันใน item
    await itemsCollection.updateOne(
      { _id: new ObjectId(itemId) },
      {
        $set: {
          confirmationStatus: 'pending',
          confirmationModifications: modifications,
          confirmationProposedContract: proposedContract,
          confirmationTimestamp: new Date(),
          updatedAt: new Date()
        }
      }
    );

    // ส่งการยืนยันให้ user เสมอ
    await sendConfirmationMessage(item.lineId, modifications, proposedContract);

    return NextResponse.json({
      success: true,
      message: 'ส่งการยืนยันให้ลูกค้าเรียบร้อยแล้ว',
      status: 'confirmation_sent'
    });
  } catch (error: any) {
    console.error('Error creating contract:', error);
    return NextResponse.json(
      { error: 'Failed to create contract' },
      { status: 500 }
    );
  }
}
