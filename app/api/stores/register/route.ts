import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { connectToDatabase } from '@/lib/db/mongodb';
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

function rateLimitResponse(error: ActorRateLimitError) {
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
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(error.retryAfterSeconds),
      },
    },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request, 48 * 1024);
    const claimedLineId = boundedText(body.lineId, 80, true) || '';
    let lineId: string;
    try {
      lineId = await requireLiffOwner(request, 'STORE', claimedLineId);
    } catch (error) {
      return liffAuthErrorResponse(error);
    }
    await enforceActorRateLimit({
      scope: 'store-register',
      actor: lineId,
      limit: 3,
      windowSeconds: 60 * 60,
    });

    const storeName = boundedText(body.storeName, 200, true) || '';
    const phone = boundedText(body.phone, 32, true) || '';
    const taxId = boundedText(body.taxId, 32, false);
    const ownerData = body.ownerData;
    const rawAddress = body.address;
    if (
      !ownerData
      || typeof ownerData !== 'object'
      || Array.isArray(ownerData)
      || !rawAddress
      || typeof rawAddress !== 'object'
      || Array.isArray(rawAddress)
    ) {
      return NextResponse.json(
        { error: 'กรุณากรอกข้อมูลให้ครบถ้วน', code: 'STORE_REGISTRATION_INVALID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const owner = ownerData as Record<string, unknown>;
    const addressInput = rawAddress as Record<string, unknown>;
    const ownerFullName = boundedText(owner.fullName, 200, true) || '';
    const ownerEmail = (boundedText(owner.email, 254, true) || '').toLowerCase();
    const password = boundedText(owner.password, 128, true) || '';
    const address = {
      houseNumber: boundedText(addressInput.houseNumber, 100, true) || '',
      village: boundedText(addressInput.village, 160, false) || '',
      street: boundedText(addressInput.street, 160, false) || '',
      subDistrict: boundedText(addressInput.subDistrict, 160, true) || '',
      district: boundedText(addressInput.district, 160, true) || '',
      province: boundedText(addressInput.province, 160, true) || '',
      country: boundedText(addressInput.country, 100, false) || 'ประเทศไทย',
      postcode: boundedText(addressInput.postcode, 16, true) || '',
    };
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)
      || password.length < 8
      || !/^\+?[0-9 -]{8,20}$/.test(phone)
      || (taxId && !/^[0-9-]{10,20}$/.test(taxId))
    ) {
      return NextResponse.json(
        { error: 'ข้อมูลผู้ดูแลร้านค้าไม่ถูกต้อง', code: 'STORE_REGISTRATION_INVALID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { client, db } = await connectToDatabase();
    const usersCollection = db.collection('users');
    const storesCollection = db.collection('stores');
    const session = client.startSession();
    let userId = '';
    let storeId = '';
    try {
      await session.withTransaction(async () => {
        const existingUser = await usersCollection.findOne(
          { $or: [{ lineId }, { email: ownerEmail }] },
          { session, projection: { _id: 1 } },
        );
        const existingStore = await storesCollection.findOne(
          { $or: [{ username: ownerEmail }, { lineIds: lineId }] },
          { session, projection: { _id: 1 } },
        );
        if (existingUser || existingStore) throw new Error('STORE_ACCOUNT_EXISTS');

        const now = new Date();
        const userResult = await usersCollection.insertOne(
          {
            email: ownerEmail,
            passwordHash,
            role: 'owner',
            fullName: ownerFullName,
            phone,
            profileImage: null,
            address,
            lineId,
            isActive: true,
            lastLogin: null,
            createdAt: now,
            updatedAt: now,
          },
          { session },
        );
        const storeResult = await storesCollection.insertOne(
          {
            storeName,
            username: ownerEmail,
            ownerName: ownerFullName,
            ownerEmail,
            phone,
            taxId: taxId || null,
            address,
            interestRate: 10,
            password: passwordHash,
            passwordHash,
            ownerId: userResult.insertedId,
            logoUrl: null,
            stampUrl: null,
            signatureUrl: null,
            interestPresets: [
              { days: 7, rate: 3.0 },
              { days: 15, rate: 5.0 },
              { days: 30, rate: 10.0 },
            ],
            contractTemplate: {
              header: 'สัญญาสินเชื่อทองคำ',
              footer: 'ขอบคุณที่ใช้บริการ',
              terms: 'เงื่อนไขการขอสินเชื่อมาตรฐาน',
            },
            lineIds: [lineId],
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
          { session },
        );
        userId = userResult.insertedId.toString();
        storeId = storeResult.insertedId.toString();
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'STORE_ACCOUNT_EXISTS') {
        return NextResponse.json(
          { error: 'บัญชีนี้ลงทะเบียนร้านค้าไว้แล้ว', code: 'STORE_ACCOUNT_EXISTS' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }

    if (!userId || !storeId) throw new Error('STORE_REGISTRATION_NOT_COMMITTED');
    return NextResponse.json(
      { success: true, message: 'ลงทะเบียนร้านค้าสำเร็จ', userId, storeId },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if (error instanceof ActorRateLimitError) return rateLimitResponse(error);
    console.error('[stores:register] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการลงทะเบียน', code: 'STORE_REGISTRATION_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
