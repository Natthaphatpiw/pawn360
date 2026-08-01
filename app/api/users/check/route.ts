import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const claimedLineId = String(searchParams.get('lineId') || '').trim();

    if (!claimedLineId) {
      return NextResponse.json(
        { error: 'ข้อมูลบัญชีไม่ครบถ้วน', code: 'LINE_ID_REQUIRED' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let lineId: string;
    try {
      lineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);
    } catch (error) {
      return liffAuthErrorResponse(error);
    }
    await enforceActorRateLimit({
      scope: 'customer-registration-check',
      actor: lineId,
      limit: 30,
      windowSeconds: 10 * 60,
    });

    const { db } = await connectToDatabase();
    const customersCollection = db.collection('customers');

    const customer = await customersCollection.findOne(
      { lineId },
      { projection: { fullName: 1, phone: 1 } },
    );

    return NextResponse.json(
      {
        success: true,
        exists: Boolean(customer),
        customer: customer
          ? { fullName: customer.fullName, phone: customer.phone }
          : null,
      },
      { headers: { 'Cache-Control': 'no-store, private' } },
    );
  } catch (error) {
    if (error instanceof ActorRateLimitError) {
      return NextResponse.json(
        {
          error: error.status === 429
            ? 'ตรวจสอบข้อมูลถี่เกินไป กรุณารอสักครู่'
            : 'ระบบควบคุมการใช้งานยังไม่พร้อม กรุณาลองใหม่',
          code: error.code,
          retryable: true,
        },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(error.retryAfterSeconds),
          },
        },
      );
    }
    console.error('[users:check] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถตรวจสอบข้อมูลผู้ใช้ได้', code: 'USER_LOOKUP_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
