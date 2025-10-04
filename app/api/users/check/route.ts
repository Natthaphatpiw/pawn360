import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lineId = searchParams.get('lineId');

    if (!lineId) {
      return NextResponse.json(
        { error: 'lineId is required' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const customersCollection = db.collection('customers');

    const customer = await customersCollection.findOne({ lineId });

    return NextResponse.json({
      success: true,
      exists: !!customer,
    });
  } catch (error: any) {
    console.error('Error checking user:', error);
    return NextResponse.json(
      { error: 'Failed to check user', exists: false },
      { status: 500 }
    );
  }
}
