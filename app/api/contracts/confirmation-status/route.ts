import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');

    if (!itemId) {
      return NextResponse.json(
        { error: 'itemId is required' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');

    const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: item.confirmationStatus || 'pending'
    });
  } catch (error: any) {
    console.error('Error checking confirmation status:', error);
    return NextResponse.json(
      { error: 'Failed to check confirmation status' },
      { status: 500 }
    );
  }
}
