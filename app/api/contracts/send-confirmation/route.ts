import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { sendConfirmationMessage } from '@/lib/line/client';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
  try {
    const { lineId, itemId, modifications, newContract } = await request.json();

    if (!lineId || !itemId || !modifications || !newContract) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');

    // Update item with pending confirmation status
    // Also update the item's storeId to match the selected store
    await itemsCollection.updateOne(
      { _id: new ObjectId(itemId) },
      {
        $set: {
          confirmationStatus: 'pending',
          confirmationModifications: modifications,
          confirmationNewContract: newContract,
          confirmationTimestamp: new Date(),
          updatedAt: new Date(),
          // 🔥 Update item's storeId to match the selected store
          storeId: newContract.storeId ? new ObjectId(newContract.storeId) : undefined
        }
      }
    );

    // Send LINE message
    await sendConfirmationMessage(lineId, modifications, newContract);

    return NextResponse.json({
      success: true,
      message: 'Confirmation message sent successfully'
    });
  } catch (error: any) {
    console.error('Error sending confirmation:', error);
    return NextResponse.json(
      { error: 'Failed to send confirmation message' },
      { status: 500 }
    );
  }
}
