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

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 512 * 1024;

const ROLE_FOLDERS: Record<LiffRole, ReadonlySet<string>> = {
  PAWNER: new Set([
    'uploads',
    'penalty-slips',
    'contract-action-slips',
    'signatures',
    'redemption-slips',
    'redemption-receipts',
    'payment-slips',
  ]),
  INVESTOR: new Set(['investor-slips', 'signatures']),
  DROP_POINT: new Set(['droppoint-verification', 'drop-point-returns']),
  STORE: new Set(['uploads', 'contracts']),
  ADMIN: new Set(),
};

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

function requestedRole(request: NextRequest): LiffRole | null {
  const value = request.headers.get('x-liff-role');
  if (!value) return 'PAWNER';
  return value === 'PAWNER' || value === 'INVESTOR' || value === 'STORE' || value === 'DROP_POINT'
    ? value
    : null;
}

function localMockAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LIFF_MOCK === 'true';
}

export async function POST(request: NextRequest) {
  try {
    const role = requestedRole(request);
    if (!role) return jsonError('ประเภทผู้ใช้งานไม่ถูกต้อง', 'UPLOAD_ROLE_INVALID', 400);

    const lineId = localMockAllowed()
      ? 'local-mock'
      : (await requireLiffIdentity(request, role)).lineId;
    await enforceActorRateLimit({
      scope: `upload:${role.toLowerCase()}`,
      actor: lineId,
      limit: 12,
      windowSeconds: 10 * 60,
    });

    const formData = await readBoundedMultipartFormData(request, MAX_MULTIPART_BYTES);
    const file = formData.get('file');
    const folderValue = formData.get('folder');
    const folder = typeof folderValue === 'string' && folderValue ? folderValue : 'uploads';

    if (!(file instanceof File)) {
      return jsonError('กรุณาเลือกไฟล์', 'UPLOAD_FILE_REQUIRED', 400);
    }
    if (!ROLE_FOLDERS[role].has(folder)) {
      return jsonError('ไม่อนุญาตให้อัปโหลดไปยังหมวดนี้', 'UPLOAD_FOLDER_FORBIDDEN', 403);
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return jsonError('ไฟล์ต้องมีขนาดไม่เกิน 4 MB', 'UPLOAD_TOO_LARGE', 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = detectUploadType(buffer);
    if (!detected) {
      return jsonError(
        'รองรับเฉพาะ JPEG, PNG, WebP หรือ PDF ที่ถูกต้อง',
        'UPLOAD_FILE_INVALID',
        415,
      );
    }
    if (folder !== 'uploads' && detected.contentType === 'application/pdf') {
      return jsonError('หมวดนี้รองรับเฉพาะไฟล์รูปภาพ', 'UPLOAD_IMAGE_REQUIRED', 415);
    }

    const key = `${folder}/${role.toLowerCase()}-${Date.now()}-${randomUUID()}.${detected.extension}`;
    const blob = await putPrivateBlob(key, buffer, detected.contentType);

    return NextResponse.json(
      { success: true, url: blob.signedUrl, key: blob.pathname },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof BoundedUploadError) {
      return jsonError(
        error.status === 413 ? 'ไฟล์มีขนาดใหญ่เกิน 4 MB' : 'รูปแบบคำขอไม่ถูกต้อง',
        error.code,
        error.status,
      );
    }
    if (error instanceof LiffAuthError) {
      const message = error.status === 401
        ? 'กรุณาเปิดหน้านี้ผ่าน LINE และเข้าสู่ระบบใหม่'
        : error.status === 403
          ? 'คุณไม่มีสิทธิ์อัปโหลดไฟล์นี้'
          : 'ไม่สามารถตรวจสอบสิทธิ์ได้ชั่วคราว';
      return jsonError(message, error.code, error.status, error.retryable ? 15 : undefined);
    }
    if (error instanceof ActorRateLimitError) {
      return jsonError(
        error.status === 429
          ? 'อัปโหลดถี่เกินไป กรุณารอแล้วลองใหม่'
          : 'ระบบอัปโหลดยังไม่พร้อม กรุณาลองใหม่',
        error.code,
        error.status,
        error.retryAfterSeconds,
      );
    }
    console.error('[upload] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return jsonError('ไม่สามารถอัปโหลดไฟล์ได้ กรุณาลองใหม่', 'UPLOAD_FAILED', 500);
  }
}
