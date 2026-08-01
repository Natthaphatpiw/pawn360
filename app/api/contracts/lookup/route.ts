import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  boundedText,
  readBoundedJsonObject,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request, 16 * 1024);
    const idNumberLast4 = boundedText(body.idNumberLast4, 4);
    if (idNumberLast4 && !/^\d{4}$/.test(idNumberLast4)) {
      return NextResponse.json(
        { error: 'ข้อมูลยืนยันไม่ถูกต้อง', code: 'INVALID_LAST4' },
        { status: 400 }
      );
    }
    const { lineId } = await requireLiffIdentity(request, 'PAWNER');

    const { db } = await connectToDatabase();
    const customersCollection = db.collection('customers');
    const contractsCollection = db.collection('contracts');

    // Find customer
    const customer = await customersCollection.findOne({ lineId });

    if (!customer) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลผู้ใช้', code: 'CUSTOMER_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Optional: Verify ID number last 4 digits
    if (idNumberLast4) {
      const last4 = String(customer.idNumber || '').slice(-4);
      if (last4 !== idNumberLast4) {
        return NextResponse.json(
          { error: 'ข้อมูลยืนยันไม่ถูกต้อง', code: 'IDENTITY_CHECK_FAILED' },
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
      .project({
        _id: 1,
        contractNumber: 1,
        status: 1,
        item: 1,
        pawnDetails: 1,
        dates: 1,
        transactionHistory: 1,
        storeId: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json({
      success: true,
      contracts,
      customer: {
        fullName: customer.fullName,
        totalContracts: customer.totalContracts,
      },
    });
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    console.error('[contracts:lookup] failed');
    return sanitizedServerError();
  }
}
