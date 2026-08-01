import { NextResponse } from 'next/server';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';
import type { PinRole } from '@/lib/security/pin';
import {
  liffAuthErrorResponse,
  requireLiffOwner,
} from '@/lib/security/request-auth';

/**
 * A PIN is a second factor for a verified LINE subject; it is never a
 * replacement for LIFF authentication. This also prevents an attacker who
 * only knows a Drop Point LINE ID from setting or brute-forcing its PIN.
 */
export async function requirePinActor(
  request: Request,
  role: PinRole,
  lineId: string,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  await requireLiffOwner(request, role, lineId);
  await enforceActorRateLimit({
    scope: `pin:${scope}`,
    actor: `${role}:${lineId}`,
    limit,
    windowSeconds,
  });
}

export function pinAccessErrorResponse(error: unknown): NextResponse {
  if (error instanceof ActorRateLimitError) {
    return NextResponse.json(
      {
        error: error.status === 429
          ? 'ลองรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
          : 'ระบบควบคุมความปลอดภัยยังไม่พร้อม กรุณาลองใหม่',
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
  return liffAuthErrorResponse(error);
}
