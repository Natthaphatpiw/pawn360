import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { putPrivateBlob } from '@/lib/storage/blob';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';
import {
  BoundedUploadError,
  detectUploadType,
  readBoundedMultipartFormData,
} from '@/lib/security/bounded-upload';
import {
  LiffAuthError,
  requireLiffIdentity,
  type LiffRole,
} from '@/lib/security/liff-auth';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 512 * 1024;
const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const RATE_LIMIT_UPLOADS = 12;

function jsonError(error: string, code: string, status: number, retryAfter?: number) {
  return NextResponse.json(
    { error, code },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
      },
    },
  );
}

function requestedRole(request: NextRequest): LiffRole {
  return request.headers.get('x-liff-role') === 'INVESTOR' ? 'INVESTOR' : 'PAWNER';
}

function localMockAllowed(): boolean {
  return process.env.NODE_ENV !== 'production'
    && process.env.NEXT_PUBLIC_LIFF_MOCK === 'true';
}

export async function POST(request: NextRequest) {
  const role = requestedRole(request);
  try {
    let lineId = 'local-mock';
    if (!localMockAllowed()) {
      const identity = await requireLiffIdentity(request, role);
      lineId = identity.lineId;
    }
    await enforceActorRateLimit({
      scope: `upload-image:${role.toLowerCase()}`,
      actor: lineId,
      limit: RATE_LIMIT_UPLOADS,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    });

    const formData = await readBoundedMultipartFormData(request, MAX_MULTIPART_BYTES);
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return jsonError('กรุณาเลือกไฟล์รูปภาพ', 'UPLOAD_FILE_REQUIRED', 400);
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      return jsonError('ไฟล์รูปต้องมีขนาดไม่เกิน 2 MB', 'UPLOAD_TOO_LARGE', 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = detectUploadType(buffer);
    if (!detected || detected.contentType === 'application/pdf') {
      return jsonError(
        'รองรับเฉพาะรูป JPEG, PNG หรือ WebP',
        'UPLOAD_INVALID_IMAGE',
        415,
      );
    }

    const prefix = role === 'INVESTOR' ? 'investor-slips' : 'pawn-items';
    const key = `${prefix}/${role.toLowerCase()}-${Date.now()}-${randomUUID()}.${detected.extension}`;
    const blob = await putPrivateBlob(key, buffer, detected.contentType);

    return NextResponse.json(
      { success: true, url: blob.signedUrl, key: blob.pathname },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof BoundedUploadError) {
      return jsonError(
        error.status === 413 ? 'ไฟล์รูปมีขนาดใหญ่เกิน 2 MB' : 'รูปแบบคำขอไม่ถูกต้อง',
        error.code,
        error.status,
      );
    }
    if (error instanceof ActorRateLimitError) {
      return jsonError(
        error.status === 429
          ? 'อัปโหลดรูปถี่เกินไป กรุณารอสักครู่แล้วลองใหม่'
          : 'บริการอัปโหลดยังไม่พร้อม กรุณาลองใหม่',
        error.code,
        error.status,
        error.retryAfterSeconds,
      );
    }
    if (error instanceof LiffAuthError) {
      const message = error.status === 401
        ? 'กรุณาเข้าสู่ระบบ LINE ใหม่'
        : 'บริการอัปโหลดยังไม่พร้อม กรุณาลองใหม่';
      return jsonError(message, error.code, error.status, error.retryable ? 15 : undefined);
    }

    console.error('[upload:image] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return jsonError('ไม่สามารถอัปโหลดรูปได้ กรุณาลองใหม่', 'UPLOAD_FAILED', 500);
  }
}
