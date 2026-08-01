import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Store } from '@/lib/db/models';
import bcrypt from 'bcrypt';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';
import {
  LiffAuthError,
  requireLiffIdentity,
  type LiffRole,
} from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  boundedText,
  readBoundedJsonObject,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

type StoreRecord = Store & {
  username?: string;
  interestPerday?: number;
  interestSet?: Record<string, number>;
};

// Keep unknown-account and bad-password paths at roughly the same bcrypt cost
// to reduce username-enumeration timing signals.
const DUMMY_PASSWORD_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8O2fq3UjKZl6QfNU9LvkX75SwhiuAu';

function requestedListRole(request: NextRequest): Extract<LiffRole, 'PAWNER' | 'STORE'> {
  return request.headers.get('x-liff-role') === 'STORE' ? 'STORE' : 'PAWNER';
}

async function authenticatedLineId(request: NextRequest, role: LiffRole): Promise<string> {
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LIFF_MOCK === 'true') {
    return 'local-mock';
  }
  return (await requireLiffIdentity(request, role)).lineId;
}

function rateLimitResponse(error: ActorRateLimitError) {
  return NextResponse.json(
    {
      error: error.status === 429
        ? 'ส่งคำขอถี่เกินไป กรุณารอสักครู่'
        : 'ระบบตรวจสอบสิทธิ์ยังไม่พร้อม กรุณาลองใหม่',
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

export async function GET(request: NextRequest) {
  try {
    const role = requestedListRole(request);
    const lineId = await authenticatedLineId(request, role);
    await enforceActorRateLimit({
      scope: `stores-list:${role.toLowerCase()}`,
      actor: lineId,
      limit: 30,
      windowSeconds: 10 * 60,
    });

    const { db } = await connectToDatabase();
    const stores = await db.collection<StoreRecord>('stores')
      .find({ isActive: { $ne: false } })
      .project({
        _id: 1,
        storeName: 1,
        interestRate: 1,
        interestPerday: 1,
        interestSet: 1,
      })
      .sort({ storeName: 1 })
      .limit(500)
      .toArray();

    return NextResponse.json(
      { success: true, stores },
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    );
  } catch (error) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    if (error instanceof ActorRateLimitError) return rateLimitResponse(error);
    console.error('[stores:list] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถโหลดรายการร้านค้าได้', code: 'STORE_LIST_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

/** Verify a store employee using STORE LIFF identity plus the store password. */
export async function POST(request: NextRequest) {
  try {
    const lineId = await authenticatedLineId(request, 'STORE');
    await enforceActorRateLimit({
      scope: 'store-login',
      actor: lineId,
      limit: 10,
      windowSeconds: 10 * 60,
    });

    const body = await readBoundedJsonObject(request, 8 * 1024);
    const username = boundedText(body.username, 120, true) || '';
    const password = boundedText(body.password, 128, true) || '';

    const { db } = await connectToDatabase();
    const store = await db.collection<StoreRecord>('stores').findOne(
      { username, isActive: { $ne: false } },
      { collation: { locale: 'en', strength: 2 } },
    );

    // Deliberately use one response for unknown account, non-member, and bad
    // password so this endpoint cannot enumerate store usernames/memberships.
    const allowedLineIds = Array.isArray(store?.lineIds) ? store.lineIds : [];
    const passwordHash = typeof store?.passwordHash === 'string'
      ? store.passwordHash
      : typeof store?.password === 'string' && store.password.startsWith('$2')
        ? store.password
        : '';
    const isMember = lineId === 'local-mock' || allowedLineIds.includes(lineId);
    const passwordMatches = await bcrypt
      .compare(password, passwordHash || DUMMY_PASSWORD_HASH)
      .catch(() => false);
    const isValidPassword = Boolean(passwordHash) && passwordMatches;

    if (!store || !isMember || !isValidPassword) {
      return NextResponse.json(
        { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', code: 'STORE_LOGIN_INVALID' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        store: {
          _id: store._id,
          storeName: store.storeName,
          interestRate: store.interestRate,
          interestPerday: store.interestPerday,
          interestSet: store.interestSet,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    if (error instanceof ActorRateLimitError) return rateLimitResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    console.error('[stores:login] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถเข้าสู่ระบบร้านค้าได้', code: 'STORE_LOGIN_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
