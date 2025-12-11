import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    console.log('API called with id:', id);

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');
    const customersCollection = db.collection('customers');

    console.log('Searching for item with id:', id);
    // ค้นหา item จาก itemId
    const item = await itemsCollection.findOne({ _id: new ObjectId(id) });
    console.log('Item found:', item ? 'yes' : 'no');

    if (!item) {
      return NextResponse.json(
        { error: 'ไม่พบรายการจำนำ' },
        { status: 404 }
      );
    }

    // ค้นหา customer จาก lineId
    const customer = await customersCollection.findOne({ lineId: item.lineId });

    if (!customer) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลลูกค้า' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      item,
      customer: {
        lineId: customer.lineId,
        title: customer.title,
        firstName: customer.firstName,
        lastName: customer.lastName,
        fullName: customer.fullName,
        phone: customer.phone,
        idNumber: customer.idNumber,
        address: customer.address
      }
    });
  } catch (error) {
    console.error('Error fetching pawn request:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { pawnedPrice, totalInterest } = body;

    if (!pawnedPrice || typeof pawnedPrice !== 'number') {
      return NextResponse.json(
        { error: 'กรุณาระบุราคาจำนำที่ถูกต้อง' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const pawnRequestsCollection = db.collection('pawnRequests');

    const result = await pawnRequestsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          pawnedPrice,
          totalInterest,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'ไม่พบรายการจำนำ' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'อัพเดทราคาเรียบร้อยแล้ว'
    });
  } catch (error) {
    console.error('Error updating pawn request:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการอัพเดท' },
      { status: 500 }
    );
  }
}