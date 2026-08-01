import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import { sanitizedServerError } from '@/lib/security/transaction-request';

export async function GET(request: NextRequest) {
  try {
    const { lineId } = await requireLiffIdentity(request, 'PAWNER');

    const { db } = await connectToDatabase();
    const contractsCollection = db.collection('contracts');

    // ค้นหาสัญญาทั้งหมดที่มี lineId นี้
    const contracts = await contractsCollection
      .find({ lineId })
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

    const now = Date.now();
    const safeContracts = contracts.map((contract) => ({
      ...contract,
      status: contract.status === 'active'
        && contract.dates?.dueDate
        && new Date(contract.dates.dueDate).getTime() < now
        ? 'overdue'
        : contract.status,
    }));

    return NextResponse.json({
      success: true,
      contracts: safeContracts,
    });
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    console.error('[contracts:by-line-id] failed');
    return sanitizedServerError('ไม่สามารถโหลดรายการสัญญาได้ กรุณาลองใหม่');
  }
}
