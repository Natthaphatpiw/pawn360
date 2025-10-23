import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Item } from '@/lib/db/models';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lineId = searchParams.get('lineId');
    const status = searchParams.get('status');

    if (!lineId) {
      console.error('Line ID is missing in request');
      return NextResponse.json(
        { error: 'Line ID is required' },
        { status: 400 }
      );
    }

    // Validate lineId format (should be a valid string)
    if (typeof lineId !== 'string' || lineId.trim().length === 0) {
      console.error('Invalid Line ID format:', lineId);
      return NextResponse.json(
        { error: 'Invalid Line ID format' },
        { status: 400 }
      );
    }

    console.log('Fetching items for lineId:', lineId, 'status:', status);

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection<Item>('items');

    // Build query
    const query: any = { lineId: lineId.trim() };
    if (status) {
      query.status = status;
    }

    // Find items for this user with optional status filter
    const items = await itemsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    console.log('Found items:', items.length);

    return NextResponse.json({
      success: true,
      items,
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
