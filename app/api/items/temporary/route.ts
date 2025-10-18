import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Item } from '@/lib/db/models';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      lineId,
      brand,
      model,
      type,
      serialNo,
      condition,
      defects,
      note,
      accessories,
      images,
      estimatedValue,
    } = body;

    // Validation
    if (!lineId || !brand || !model || !type) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection<Item>('items');

    // Create temporary item
    const newItem: Item = {
      lineId,
      brand,
      model,
      type,
      serialNo,
      condition,
      defects,
      note,
      accessories,
      images: images || [],
      status: 'temporary',
      currentContractId: null,
      contractHistory: [],
      desiredAmount: estimatedValue || 0,
      estimatedValue: estimatedValue || 0,
      loanDays: 0,
      interestRate: 0,
      negotiationStatus: 'none',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert item into database
    const itemResult = await itemsCollection.insertOne(newItem);

    if (!itemResult.insertedId) {
      return NextResponse.json(
        { error: 'Failed to create temporary item' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      itemId: itemResult.insertedId,
      message: 'บันทึกข้อมูลชั่วคราวเรียบร้อยแล้ว',
    });
  } catch (error) {
    console.error('Temporary item error:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการบันทึกชั่วคราว' },
      { status: 500 }
    );
  }
}
