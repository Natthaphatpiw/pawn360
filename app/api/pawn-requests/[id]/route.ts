import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const pawnRequestsCollection = db.collection('pawnRequests');

    const pawnRequest = await pawnRequestsCollection.findOne({
      _id: new ObjectId(id)
    });

    if (!pawnRequest) {
      return NextResponse.json(
        { error: 'ไม่พบรายการจำนำ' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      pawnRequest
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