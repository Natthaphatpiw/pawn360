import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/mongodb';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lineId } = body;

    // Validation
    if (!lineId) {
      return NextResponse.json(
        { error: 'Missing lineId' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const contractsCollection = db.collection('contracts');

    // Get all contracts for this customer (all statuses)
    const contracts = await contractsCollection
      .find({ lineId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      contracts,
    });
  } catch (error) {
    console.error('Error fetching contract history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
