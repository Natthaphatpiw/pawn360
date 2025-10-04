import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid item ID' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');
    const customersCollection = db.collection('customers');

    // Find the item
    const item = await itemsCollection.findOne({ _id: new ObjectId(id) });

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // Find the customer
    const customer = await customersCollection.findOne({ lineId: item.lineId });

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Return combined data for store to verify
    return NextResponse.json({
      success: true,
      item: {
        _id: item._id,
        brand: item.brand,
        model: item.model,
        type: item.type,
        serialNo: item.serialNo,
        condition: item.condition,
        defects: item.defects,
        note: item.note,
        accessories: item.accessories,
        images: item.images,
        status: item.status,
      },
      customer: {
        _id: customer._id,
        title: customer.title,
        firstName: customer.firstName,
        lastName: customer.lastName,
        fullName: customer.fullName,
        phone: customer.phone,
        idNumber: customer.idNumber,
        address: customer.address,
      },
    });
  } catch (error) {
    console.error('Error fetching pawn request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
