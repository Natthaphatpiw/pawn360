import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { sendConfirmationMessage } from '@/lib/line/client';
import { ObjectId } from 'mongodb';
import { requireStoreMembership } from '@/lib/security/contract-access';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  boundedText,
  readBoundedJsonObject,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

function safePositiveNumber(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}
export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request, 8 * 1024);
    const itemId = boundedText(body.itemId, 24, true) || '';
    const storeId = boundedText(body.storeId, 24, true) || '';
    if (!ObjectId.isValid(itemId) || !ObjectId.isValid(storeId)) {
      return NextResponse.json(
        { error: 'รหัสรายการไม่ถูกต้อง', code: 'INVALID_ID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { db } = await connectToDatabase();
    let store;
    try {
      ({ store } = await requireStoreMembership(request, db, storeId));
    } catch (error) {
      return liffAuthErrorResponse(error);
    }

    const itemsCollection = db.collection('items');
    const itemObjectId = new ObjectId(itemId);
    const storeObjectId = new ObjectId(storeId);
    const item = await itemsCollection.findOne({ _id: itemObjectId });
    if (!item) {
      return NextResponse.json(
        { error: 'ไม่พบรายการ', code: 'ITEM_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (item.status !== 'pending' || item.confirmationStatus === 'pending') {
      return NextResponse.json(
        { error: 'รายการนี้ถูกดำเนินการแล้ว', code: 'ITEM_ALREADY_PROCESSED' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (typeof item.lineId !== 'string' || !item.lineId) {
      return NextResponse.json(
        { error: 'ข้อมูลเจ้าของรายการไม่สมบูรณ์', code: 'ITEM_OWNER_MISSING' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const startDate = new Date();
    const pawnedPrice = safePositiveNumber(
      item.confirmationNewContract?.pawnPrice ?? item.negotiatedAmount ?? item.desiredAmount,
      0,
      100_000_000,
    );
    const interestRate = safePositiveNumber(
      item.confirmationNewContract?.interestRate ?? item.negotiatedInterestRate ?? item.interestRate,
      10,
      100,
    );
    const periodDays = Math.round(safePositiveNumber(
      item.confirmationNewContract?.loanDays ?? item.negotiatedDays ?? item.loanDays,
      30,
      3650,
    ));
    if (pawnedPrice <= 0) {
      return NextResponse.json(
        { error: 'ยอดเงินในรายการไม่ถูกต้อง', code: 'ITEM_AMOUNT_INVALID' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const dueDate = new Date(startDate);
    dueDate.setDate(dueDate.getDate() + periodDays);
    const interestAmount = (pawnedPrice * interestRate * (periodDays / 30)) / 100;
    const proposedContract = {
      itemId,
      pawnedPrice,
      interestRate,
      periodDays,
      interestAmount,
      remainingAmount: pawnedPrice + interestAmount,
      storeName: String(store.storeName || 'ร้านค้า'),
      storeId,
      dueDate: dueDate.toISOString(),
    };
    const modifications = {
      type: 'contract_creation',
      originalValues: null,
      newValues: proposedContract,
      changes: [],
    };

    const updateResult = await itemsCollection.updateOne(
      {
        _id: itemObjectId,
        status: 'pending',
        confirmationStatus: { $ne: 'pending' },
      },
      {
        $set: {
          confirmationStatus: 'pending',
          confirmationModifications: modifications,
          confirmationProposedContract: proposedContract,
          confirmationTimestamp: new Date(),
          storeId: storeObjectId,
          updatedAt: new Date(),
        },
      },
    );
    if (updateResult.modifiedCount !== 1) {
      return NextResponse.json(
        { error: 'รายการนี้กำลังถูกดำเนินการ', code: 'ITEM_CONCURRENT_UPDATE' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    try {
      await sendConfirmationMessage(item.lineId, modifications, proposedContract);
    } catch (error) {
      console.error('[stores:verify-contract] LINE delivery failed', {
        type: error instanceof Error ? error.name : 'unknown',
      });
      return NextResponse.json(
        {
          success: true,
          warning: 'บันทึกรายการแล้ว แต่การแจ้งเตือนล่าช้า กรุณาตรวจสอบอีกครั้ง',
          code: 'CONFIRMATION_NOTIFICATION_DELAYED',
          status: 'confirmation_pending',
        },
        { status: 202, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { success: true, message: 'ส่งคำขอยืนยันเรียบร้อยแล้ว', status: 'confirmation_sent' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    console.error('[stores:verify-contract] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถดำเนินรายการได้', code: 'CONTRACT_CONFIRMATION_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
