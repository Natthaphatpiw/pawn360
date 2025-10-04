import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const storesCollection = db.collection('stores');

    const stores = await storesCollection
      .find({})
      .project({ _id: 1, storeName: 1 })
      .sort({ storeName: 1 })
      .toArray();

    return NextResponse.json({
      success: true,
      stores,
    });
  } catch (error: any) {
    console.error('Error fetching stores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stores' },
      { status: 500 }
    );
  }
}
