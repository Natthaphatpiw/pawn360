import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> }
) {
  try {
    const { contractId } = await params;

    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const contractsCollection = db.collection('contracts');

    const contract = await contractsCollection.findOne({ _id: new ObjectId(contractId) });

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      contract,
    });
  } catch (error: any) {
    console.error('Error fetching contract:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contract' },
      { status: 500 }
    );
  }
}
