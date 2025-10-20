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
    const contractsCollection = db.collection('contracts');

    // อัพเดทสถานะสัญญาที่เลยกำหนดก่อนแสดงผล
    await updateOverdueContracts(db, lineId);

    // ค้นหาสัญญาทั้งหมดที่มี lineId นี้
    const contracts = await contractsCollection
      .find({ lineId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      contracts,
    });
  } catch (error: any) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contracts' },
      { status: 500 }
    );
  }
}

// Function to update overdue contracts
async function updateOverdueContracts(db: any, lineId: string) {
  try {
    const contractsCollection = db.collection('contracts');
    const currentDate = new Date();

    // Find contracts that are active and past due date
    const overdueContracts = await contractsCollection
      .find({
        lineId,
        status: 'active',
        'dates.dueDate': { $lt: currentDate }
      })
      .toArray();

    if (overdueContracts.length > 0) {
      console.log(`Updating ${overdueContracts.length} overdue contracts for user ${lineId}`);

      // Update status to overdue
      await contractsCollection.updateMany(
        {
          lineId,
          status: 'active',
          'dates.dueDate': { $lt: currentDate }
        },
        {
          $set: {
            status: 'overdue',
            updatedAt: new Date()
          }
        }
      );

      console.log('Overdue contracts updated successfully');
    }
  } catch (error) {
    console.error('Error updating overdue contracts:', error);
    // Don't throw error to prevent breaking the main flow
  }
}
