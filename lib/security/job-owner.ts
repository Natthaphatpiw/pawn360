import {
  LiffAuthError,
  requireLiffIdentity,
  VerifiedLiffIdentity,
} from '@/lib/security/liff-auth';

export async function requirePawnerJobIdentity(
  request: Request,
  claimedLineId?: string
): Promise<VerifiedLiffIdentity> {
  // Preserve the repository's explicit local LIFF mock mode without weakening
  // deployed environments. Production always verifies the LINE ID token.
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LIFF_MOCK === 'true') {
    const lineId = claimedLineId?.trim();
    if (!lineId) throw new LiffAuthError('LIFF_AUTH_REQUIRED', 401);
    return { lineId, expiresAt: Date.now() + 60_000, channelId: 'local-mock' };
  }

  const identity = await requireLiffIdentity(request, 'PAWNER');
  if (claimedLineId && claimedLineId !== identity.lineId) {
    throw new LiffAuthError('LIFF_AUTH_SUBJECT_MISMATCH', 403);
  }
  return identity;
}

export async function requirePawnerJobOwner(
  request: Request,
  ownerLineId: string | undefined
): Promise<VerifiedLiffIdentity> {
  if (!ownerLineId) throw new LiffAuthError('LIFF_AUTH_SUBJECT_MISMATCH', 403);
  return requirePawnerJobIdentity(request, ownerLineId);
}

export function jobAuthErrorResponse(error: unknown): {
  status: number;
  body: { error: string; code: string; retryable?: boolean };
} {
  if (error instanceof LiffAuthError) {
    const message = error.status === 403
      ? 'คุณไม่มีสิทธิ์เข้าถึงงานนี้'
      : error.retryable
        ? 'ไม่สามารถตรวจสอบบัญชี LINE ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง'
        : 'กรุณาเข้าสู่ระบบ LINE ใหม่อีกครั้ง';
    return {
      status: error.status,
      body: {
        error: message,
        code: error.code,
        ...(error.retryable ? { retryable: true } : {}),
      },
    };
  }
  return {
    status: 500,
    body: { error: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์', code: 'LIFF_AUTH_ERROR' },
  };
}
