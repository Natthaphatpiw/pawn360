import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { requireLiffIdentity } from '@/lib/security/liff-auth';
import { requireStoreMembership } from '@/lib/security/contract-access';
import {
  internalAuthErrorResponse,
  liffAuthErrorResponse,
  requireInternalRequest,
} from '@/lib/security/request-auth';
import {
  boundedText,
  finiteNumber,
  readBoundedJsonObject,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'รหัสรายการไม่ถูกต้อง' }, { status: 400 });
    }

    const requestedRole = request.headers.get('x-liff-role')?.toUpperCase() === 'STORE'
      ? 'STORE'
      : 'PAWNER';
    const identity = await requireLiffIdentity(request, requestedRole);

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');
    const customersCollection = db.collection('customers');

    // ค้นหา item จาก itemId
    const item = await itemsCollection.findOne({ _id: new ObjectId(id) });

    if (!item) {
      return NextResponse.json(
        { error: 'ไม่พบรายการขอสินเชื่อ' },
        { status: 404 }
      );
    }

    if (requestedRole === 'PAWNER') {
      if (item.lineId !== identity.lineId) {
        return NextResponse.json({ error: 'คุณไม่มีสิทธิ์ดูรายการนี้' }, { status: 403 });
      }
    } else {
      if (!item.storeId) {
        return NextResponse.json({ error: 'คุณไม่มีสิทธิ์ดูรายการนี้' }, { status: 403 });
      }
      const linkedStore = await db.collection('stores').findOne({
        _id: item.storeId,
        lineIds: identity.lineId,
        isActive: { $ne: false },
      });
      if (!linkedStore) {
        return NextResponse.json({ error: 'คุณไม่มีสิทธิ์ดูรายการนี้' }, { status: 403 });
      }
    }

    // ค้นหา customer จาก lineId
    const customer = await customersCollection.findOne({ lineId: item.lineId });

    if (!customer) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลลูกค้า' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      item: {
        _id: item._id,
        brand: item.brand,
        model: item.model,
        type: item.type,
        serialNo: item.serialNo,
        condition: item.condition,
        defects: item.defects,
        note: item.note,
        accessories: item.accessories,
        images: Array.isArray(item.images) ? item.images.slice(0, 4) : [],
        desiredAmount: item.desiredAmount,
        estimatedValue: item.estimatedValue,
        loanDays: item.loanDays,
        interestRate: item.interestRate,
        negotiatedAmount: item.negotiatedAmount,
        negotiatedDays: item.negotiatedDays,
        negotiatedInterestRate: item.negotiatedInterestRate,
        negotiationStatus: item.negotiationStatus,
      },
      customer: {
        lineId: customer.lineId,
        title: customer.title,
        firstName: customer.firstName,
        lastName: customer.lastName,
        fullName: customer.fullName,
        phone: customer.phone,
        idNumber: customer.idNumber,
        address: customer.address
      }
    });
  } catch (error) {
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error fetching pawn request');
    return sanitizedServerError('เกิดข้อผิดพลาดในการดึงข้อมูล');
  }
}

/**
 * Login-first store claim and preview. The compare-and-set filter guarantees
 * that only one store can claim an unassigned QR item, while retries by the
 * same store remain idempotent.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'รหัสรายการไม่ถูกต้อง', code: 'INVALID_ITEM_ID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const body = await readBoundedJsonObject(request, 8 * 1024);
    const action = boundedText(body.action, 32, true);
    const storeId = boundedText(body.storeId, 24, true) || '';
    if (action !== 'claim-preview' || !ObjectId.isValid(storeId)) {
      return NextResponse.json(
        { error: 'ข้อมูลคำขอไม่ถูกต้อง', code: 'INVALID_CLAIM_REQUEST' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { db } = await connectToDatabase();
    await requireStoreMembership(request, db, storeId);
    const itemObjectId = new ObjectId(id);
    const storeObjectId = new ObjectId(storeId);
    const itemsCollection = db.collection('items');
    const claimResult = await itemsCollection.updateOne(
      {
        _id: itemObjectId,
        status: 'pending',
        $or: [
          { storeId: { $exists: false } },
          { storeId: null },
          { storeId: storeObjectId },
          { storeId },
        ],
      },
      {
        $set: {
          storeId: storeObjectId,
          storeClaimedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
    if (claimResult.matchedCount !== 1) {
      const existing = await itemsCollection.findOne(
        { _id: itemObjectId },
        { projection: { _id: 1, status: 1, storeId: 1 } },
      );
      if (!existing) {
        return NextResponse.json(
          { error: 'ไม่พบรายการ', code: 'ITEM_NOT_FOUND' },
          { status: 404, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      return NextResponse.json(
        {
          error: existing.status !== 'pending'
            ? 'รายการนี้ถูกดำเนินการแล้ว'
            : 'รายการนี้ถูกร้านค้าอื่นรับไปแล้ว',
          code: existing.status !== 'pending' ? 'ITEM_NOT_PENDING' : 'ITEM_ALREADY_CLAIMED',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const item = await itemsCollection.findOne(
      { _id: itemObjectId, storeId: storeObjectId },
      {
        projection: {
          _id: 1,
          lineId: 1,
          brand: 1,
          model: 1,
          type: 1,
          serialNo: 1,
          condition: 1,
          defects: 1,
          note: 1,
          accessories: 1,
          images: 1,
          desiredAmount: 1,
          estimatedValue: 1,
          loanDays: 1,
          interestRate: 1,
          negotiatedAmount: 1,
          negotiatedDays: 1,
          negotiatedInterestRate: 1,
          negotiationStatus: 1,
        },
      },
    );
    if (!item || typeof item.lineId !== 'string') {
      return NextResponse.json(
        { error: 'ข้อมูลรายการไม่สมบูรณ์', code: 'ITEM_OWNER_MISSING' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const customer = await db.collection('customers').findOne(
      { lineId: item.lineId },
      {
        projection: {
          _id: 0,
          title: 1,
          firstName: 1,
          lastName: 1,
          fullName: 1,
          phone: 1,
          idNumber: 1,
          address: 1,
        },
      },
    );
    if (!customer) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลผู้ขาย', code: 'CUSTOMER_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json({
      success: true,
      item: {
        _id: item._id,
        brand: item.brand,
        model: item.model,
        type: item.type,
        serialNo: item.serialNo,
        condition: item.condition,
        defects: item.defects,
        note: item.note,
        accessories: item.accessories,
        images: Array.isArray(item.images) ? item.images.slice(0, 4) : [],
        desiredAmount: item.desiredAmount,
        estimatedValue: item.estimatedValue,
        loanDays: item.loanDays,
        interestRate: item.interestRate,
        negotiatedAmount: item.negotiatedAmount,
        negotiatedDays: item.negotiatedDays,
        negotiatedInterestRate: item.negotiatedInterestRate,
        negotiationStatus: item.negotiationStatus,
      },
      customer,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    console.error('[pawn-request:claim-preview] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return sanitizedServerError('ไม่สามารถรับรายการได้ชั่วคราว กรุณาลองใหม่');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    requireInternalRequest(request, ['INTERNAL_API_SECRET']);
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'รหัสรายการไม่ถูกต้อง' }, { status: 400 });
    }
    const body = await readBoundedJsonObject(request) as any;
    const { pawnedPrice, totalInterest } = body;
    const safePawnedPrice = finiteNumber(pawnedPrice, { min: 1, max: 100_000_000, required: true });
    const safeTotalInterest = finiteNumber(totalInterest, { min: 0, max: 100_000_000 }) || 0;

    if (!safePawnedPrice) {
      return NextResponse.json(
        { error: 'กรุณาระบุวงเงินสินเชื่อที่ถูกต้อง' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const pawnRequestsCollection = db.collection('pawnRequests');

    const result = await pawnRequestsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          pawnedPrice: safePawnedPrice,
          totalInterest: safeTotalInterest,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'ไม่พบรายการขอสินเชื่อ' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'อัพเดทราคาเรียบร้อยแล้ว'
    });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'InternalAuthError') return internalAuthErrorResponse(error);
    console.error('Error updating pawn request');
    return sanitizedServerError('เกิดข้อผิดพลาดในการอัพเดท');
  }
}
