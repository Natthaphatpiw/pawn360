import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/mongodb';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lineId, idNumberLast4 } = body;

    // Validation
    if (!lineId) {
      return NextResponse.json(
        { error: 'Missing lineId' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const customersCollection = db.collection('customers');
    const contractsCollection = db.collection('contracts');

    // Find customer
    const customer = await customersCollection.findOne({ lineId });

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Optional: Verify ID number last 4 digits
    if (idNumberLast4) {
      const last4 = customer.idNumber.slice(-4);
      if (last4 !== idNumberLast4) {
        return NextResponse.json(
          { error: 'Invalid ID number' },
          { status: 401 }
        );
      }
    }

    // Get all active contracts for this customer
    const contracts = await contractsCollection
      .find({
        lineId,
        status: { $in: ['active', 'overdue'] },
      })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      contracts,
      customer: {
        fullName: customer.fullName,
        phone: customer.phone,
        totalContracts: customer.totalContracts,
      },
    });
  } catch (error) {
    console.error('Error looking up contracts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
