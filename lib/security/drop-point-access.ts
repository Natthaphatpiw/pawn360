import { NextResponse } from 'next/server';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';

const LINE_ID_PATTERN = /^U[A-Za-z0-9]{20,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class DropPointAccessError extends Error {
  constructor(
    public readonly code: 'LINE_ID_INVALID' | 'RESOURCE_ID_INVALID',
    public readonly messageForUser: string,
  ) {
    super(code);
    this.name = 'DropPointAccessError';
  }
}

function localMockAllowed(): boolean {
  return process.env.NODE_ENV !== 'production'
    && process.env.NEXT_PUBLIC_LIFF_MOCK === 'true';
}

export function assertUuidResourceId(value: string): string {
  const normalized = String(value || '').trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new DropPointAccessError('RESOURCE_ID_INVALID', 'รหัสรายการไม่ถูกต้อง');
  }
  return normalized;
}

/**
 * Authorizes a Drop Point LIFF read request and applies shared per-actor
 * admission control. URL/query LINE IDs identify a record only; the verified
 * LINE ID token remains the source of identity.
 */
export async function requireDropPointActor(
  request: Request,
  claimedLineId: string,
  scope: string,
): Promise<string> {
  const normalized = String(claimedLineId || '').trim();
  if (!LINE_ID_PATTERN.test(normalized) && !localMockAllowed()) {
    throw new DropPointAccessError('LINE_ID_INVALID', 'ข้อมูลบัญชีไม่ถูกต้อง');
  }

  const lineId = await requireLiffOwner(request, 'DROP_POINT', normalized);
  await enforceActorRateLimit({
    scope,
    actor: lineId,
    limit: 60,
    windowSeconds: 10 * 60,
  });
  return lineId;
}

export function dropPointAccessErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof DropPointAccessError) {
    return NextResponse.json(
      { error: error.messageForUser, code: error.code },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (error instanceof LiffAuthError) {
    return liffAuthErrorResponse(error);
  }

  if (error instanceof ActorRateLimitError) {
    return NextResponse.json(
      {
        error: error.status === 429
          ? 'เรียกดูข้อมูลถี่เกินไป กรุณารอสักครู่'
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

  return null;
}
