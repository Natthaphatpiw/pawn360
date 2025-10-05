import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
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

    // 4. สร้างสัญญา
    const contractNumber = `PW${Date.now()}`;
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

    const newContract = {
      contractNumber,
      status: 'active',
      customerId: customer._id,
      lineId: item.lineId,
      item: {
        itemId: item._id,
        brand: item.brand,
        model: item.model,
        type: item.type,
        serialNo: item.serialNo || '',
        condition: item.condition,
        defects: item.defects || '',
        accessories: item.accessories || '',
        images: item.images || [],
      },
      pawnDetails: {
        aiEstimatedPrice: item.estimatedValue || 0,
        pawnedPrice,
        interestRate,
        periodDays,
        totalInterest: interestAmount,
        remainingAmount,
        fineAmount: 0,
        payInterest: 0,
        soldAmount: 0,
      },
      dates: {
        startDate,
        dueDate,
        extendedDate: null,
        redeemedDate: null,
      },
      storeId: new ObjectId(storeId),
      storeName: store.storeName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await contractsCollection.insertOne(newContract);

    // 5. อัปเดตสถานะสินค้า
    await itemsCollection.updateOne(
      { _id: new ObjectId(itemId) },
      {
        $set: {
          status: 'contracted',
          storeId: new ObjectId(storeId),
        },
        $push: {
          contractHistory: result.insertedId as any,
        } as any,
      }
    );

    // 6. อัปเดตข้อมูลลูกค้า
    await customersCollection.updateOne(
      { _id: customer._id },
      {
        $set: {
          storeId: new ObjectId(storeId),
        },
        $push: {
          contractsID: result.insertedId as any,
        } as any,
        $inc: {
          totalContracts: 1,
          totalValue: pawnedPrice,
        },
      }
    );

    return NextResponse.json({
      success: true,
      contractId: result.insertedId,
      contractNumber,
    });
  } catch (error: any) {
    console.error('Error creating contract:', error);
    return NextResponse.json(
      { error: 'Failed to create contract' },
      { status: 500 }
    );
  }
}
