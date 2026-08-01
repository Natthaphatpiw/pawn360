import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Customer } from '@/lib/db/models';
import { linkRichMenuToUser } from '@/lib/line/client';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import {
  boundedText,
  readBoundedJsonObject,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request, 32 * 1024);
    const claimedLineId = boundedText(body.lineId, 80, true) || '';
    let lineId: string;
    try {
      lineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);
    } catch (error) {
      return liffAuthErrorResponse(error);
    }

    await enforceActorRateLimit({
      scope: 'legacy-user-register',
      actor: lineId,
      limit: 5,
      windowSeconds: 15 * 60,
    });

    const title = boundedText(body.title, 32, true) || '';
    const firstName = boundedText(body.firstName, 120, true) || '';
    const lastName = boundedText(body.lastName, 120, true) || '';
    const phone = boundedText(body.phone, 32, true) || '';
    const idNumber = boundedText(body.idNumber, 20, true) || '';
    const address = body.address;
    if (!address || typeof address !== 'object' || Array.isArray(address)) {
      return NextResponse.json(
        { error: 'กรุณากรอกที่อยู่ให้ครบถ้วน', code: 'ADDRESS_REQUIRED' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const addressData = address as Record<string, unknown>;
    if (!/^\+?[0-9 -]{8,20}$/.test(phone) || !/^[0-9A-Za-z-]{6,20}$/.test(idNumber)) {
      return NextResponse.json(
        { error: 'เบอร์โทรหรือเลขประจำตัวไม่ถูกต้อง', code: 'REGISTRATION_DATA_INVALID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { db } = await connectToDatabase();
    const customersCollection = db.collection<Customer>('customers');
    const existingCustomer = await customersCollection.findOne(
      { lineId },
      { projection: { _id: 1 } },
    );
    if (existingCustomer) {
      return NextResponse.json(
        { error: 'บัญชีนี้ลงทะเบียนแล้ว', code: 'USER_ALREADY_REGISTERED' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const newCustomer: Customer = {
      lineId,
      title,
      firstName,
      lastName,
      fullName: `${title} ${firstName} ${lastName}`,
      phone,
      idNumber,
      address: {
        houseNumber: boundedText(addressData.houseNumber, 100, true) || '',
        village: boundedText(addressData.village, 160, false) || undefined,
        street: boundedText(addressData.street, 160, false) || undefined,
        subDistrict: boundedText(addressData.subDistrict, 160, true) || '',
        district: boundedText(addressData.district, 160, true) || '',
        province: boundedText(addressData.province, 160, true) || '',
        country: boundedText(addressData.country, 100, false) || 'ประเทศไทย',
        postcode: boundedText(addressData.postcode, 16, true) || '',
      },
      totalContracts: 0,
      totalValue: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      contractsID: [],
      pawnRequests: [],
    };

    const result = await customersCollection.insertOne(newCustomer);
    const richMenuId = process.env.RICH_MENU_ID_MEMBER;
    if (richMenuId) {
      try {
        await linkRichMenuToUser(lineId, richMenuId);
      } catch (error) {
        console.error('[users:register] rich-menu link delayed', {
          type: error instanceof Error ? error.name : 'unknown',
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        customerId: result.insertedId.toString(),
        message: 'ลงทะเบียนสำเร็จ',
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if (error instanceof ActorRateLimitError) {
      return NextResponse.json(
        {
          error: error.status === 429
            ? 'ส่งคำขอลงทะเบียนถี่เกินไป กรุณารอแล้วลองใหม่'
            : 'ระบบลงทะเบียนยังไม่พร้อม กรุณาลองใหม่',
          code: error.code,
          retryable: true,
        },
        {
          status: error.status,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': String(error.retryAfterSeconds) },
        },
      );
    }
    console.error('[users:register] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถลงทะเบียนได้', code: 'REGISTRATION_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
