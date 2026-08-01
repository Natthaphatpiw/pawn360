import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  LiffAuthError,
  requireLiffIdentity,
  type LiffRole,
} from '@/lib/security/liff-auth';

const MAX_INTERNAL_TOKEN_LENGTH = 4_096;

export class InternalAuthError extends Error {
  constructor(
    public readonly code: 'INTERNAL_AUTH_CONFIG_MISSING' | 'INTERNAL_AUTH_REQUIRED',
    public readonly status: 401 | 503,
  ) {
    super(code);
    this.name = 'InternalAuthError';
  }
}

function localMockAllowed(): boolean {
  return process.env.NODE_ENV !== 'production'
    && process.env.NEXT_PUBLIC_LIFF_MOCK === 'true';
}

/**
 * Verifies the LIFF ID token and binds the request to the claimed LINE user.
 * Request bodies and URL parameters are identifiers only; they are never proof
 * of identity.
 */
export async function requireLiffOwner(
  request: Request,
  role: LiffRole,
  claimedLineId: string,
): Promise<string> {
  const normalizedLineId = String(claimedLineId || '').trim();
  if (localMockAllowed()) return normalizedLineId;

  const identity = await requireLiffIdentity(request, role);
  if (!normalizedLineId || identity.lineId !== normalizedLineId) {
    throw new LiffAuthError('LIFF_AUTH_SUBJECT_MISMATCH', 403);
  }
  return identity.lineId;
}

/** Admin LIFF access requires both a valid channel token and an explicit LINE
 * subject allowlist. Possession of an OA/LIFF link alone is not authorization. */
export async function requireAdminLiffIdentity(request: Request): Promise<string> {
  const identity = await requireLiffIdentity(request, 'ADMIN');
  const allowed = new Set(
    String(process.env.ADMIN_LINE_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => /^U[A-Za-z0-9]{20,64}$/.test(value)),
  );
  if (allowed.size === 0) {
    throw new LiffAuthError('ADMIN_AUTH_CONFIG_MISSING', 503, true);
  }
  if (!allowed.has(identity.lineId)) {
    throw new LiffAuthError('ADMIN_AUTH_REQUIRED', 403);
  }
  return identity.lineId;
}

export function liffAuthErrorResponse(error: unknown): NextResponse {
  if (error instanceof LiffAuthError) {
    const message = error.status === 403
      ? 'คุณไม่มีสิทธิ์ดำเนินการกับข้อมูลนี้'
      : error.status === 503
        ? 'ไม่สามารถตรวจสอบสิทธิ์ได้ชั่วคราว กรุณาลองใหม่'
        : 'กรุณาเปิดหน้านี้ผ่าน LINE และเข้าสู่ระบบใหม่';

    return NextResponse.json(
      { error: message, code: error.code },
      {
        status: error.status,
        headers: {
          'Cache-Control': 'no-store',
          ...(error.retryable ? { 'Retry-After': '15' } : {}),
        },
      },
    );
  }

  return NextResponse.json(
    { error: 'ไม่สามารถตรวจสอบสิทธิ์ได้ชั่วคราว', code: 'LIFF_AUTH_ERROR' },
    {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' },
    },
  );
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Authorizes cron/admin-to-server calls. Vercel Cron sends CRON_SECRET as a
 * Bearer token. INTERNAL_API_SECRET is accepted for non-cron internal callers.
 */
export function requireInternalRequest(
  request: Request,
  envNames: readonly string[] = ['INTERNAL_API_SECRET', 'CRON_SECRET'],
): void {
  const secrets = envNames
    .map((name) => String(process.env[name] || '').trim())
    .filter(Boolean);

  if (secrets.length === 0) {
    throw new InternalAuthError('INTERNAL_AUTH_CONFIG_MISSING', 503);
  }

  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (
    !token
    || token.length > MAX_INTERNAL_TOKEN_LENGTH
    || !secrets.some((secret) => safeEqual(token, secret))
  ) {
    throw new InternalAuthError('INTERNAL_AUTH_REQUIRED', 401);
  }
}

export function internalAuthErrorResponse(error: unknown): NextResponse {
  if (error instanceof InternalAuthError) {
    const message = error.status === 503
      ? 'ระบบภายในยังไม่พร้อม'
      : 'ไม่ได้รับอนุญาต';
    return NextResponse.json(
      { error: message, code: error.code },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { error: 'ไม่ได้รับอนุญาต', code: 'INTERNAL_AUTH_REQUIRED' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}
