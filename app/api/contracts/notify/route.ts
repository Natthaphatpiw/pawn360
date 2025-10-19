import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { sendContractCompletionNotification } from '@/lib/line/client';

export async function POST(request: NextRequest) {
  try {
    const { itemId, lineId, contractData } = await request.json();

    console.log('Contract notification request:', { itemId, lineId: lineId?.substring(0, 10) + '...' });

    if (!itemId || !lineId || !contractData) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Fetch item data from database
    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');
    const item = await itemsCollection.findOne({ _id: require('mongodb').ObjectId.createFromHexString(itemId) });

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // Send LINE notification
    const result = await sendContractCompletionNotification(lineId, contractData, item);

    console.log('Contract notification sent successfully:', result.contractNumber);

    return NextResponse.json({
      success: true,
      contractNumber: result.contractNumber
    });
  } catch (error) {
    console.error('Error in contract notification:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}
