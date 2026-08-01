import { createHash } from 'node:crypto';
import { extractBlobPathname } from '@/lib/storage/blob';

export const MAX_TRANSACTION_JSON_BYTES = 128 * 1024;
export const MAX_TEXT_FIELD_LENGTH = 2_000;
export const MAX_IMAGE_URL_LENGTH = 4_096;

export class TransactionRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 413 | 415 | 503,
    public readonly userMessage: string,
  ) {
    super(code);
    this.name = 'TransactionRequestError';
  }
}

/**
 * Reads JSON with an actual streaming byte ceiling. Content-Length alone is
 * not sufficient because chunked requests can omit or forge it.
 */
export async function readBoundedJsonObject(
  request: Request,
  maxBytes = MAX_TRANSACTION_JSON_BYTES,
): Promise<Record<string, unknown>> {
  const contentType = (request.headers.get('content-type') || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json' && !contentType.endsWith('+json')) {
    throw new TransactionRequestError(
      'CONTENT_TYPE_REQUIRED',
      415,
      'รูปแบบคำขอไม่ถูกต้อง',
    );
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new TransactionRequestError(
      'REQUEST_TOO_LARGE',
      413,
      'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป',
    );
  }

  if (!request.body) {
    throw new TransactionRequestError('INVALID_JSON', 400, 'ข้อมูลคำขอไม่ถูกต้อง');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new TransactionRequestError(
          'REQUEST_TOO_LARGE',
          413,
          'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป',
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON object required');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof TransactionRequestError) throw error;
    throw new TransactionRequestError('INVALID_JSON', 400, 'ข้อมูลคำขอไม่ถูกต้อง');
  }
}

export function transactionRequestErrorResponse(error: unknown): Response | null {
  if (!(error instanceof TransactionRequestError)) return null;
  return Response.json(
    { error: error.userMessage, code: error.code },
    { status: error.status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function boundedText(
  value: unknown,
  maxLength = MAX_TEXT_FIELD_LENGTH,
  required = false,
): string | null {
  if (value === null || value === undefined) {
    if (required) {
      throw new TransactionRequestError('FIELD_REQUIRED', 400, 'ข้อมูลคำขอไม่ครบถ้วน');
    }
    return null;
  }
  if (typeof value !== 'string') {
    throw new TransactionRequestError('INVALID_FIELD', 400, 'ข้อมูลคำขอไม่ถูกต้อง');
  }
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maxLength) {
    throw new TransactionRequestError('INVALID_FIELD', 400, 'ข้อมูลคำขอไม่ถูกต้อง');
  }
  return normalized || null;
}

export function finiteNumber(
  value: unknown,
  options: { min?: number; max?: number; required?: boolean } = {},
): number | null {
  if (value === null || value === undefined || value === '') {
    if (options.required) {
      throw new TransactionRequestError('FIELD_REQUIRED', 400, 'ข้อมูลคำขอไม่ครบถ้วน');
    }
    return null;
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new TransactionRequestError('INVALID_NUMBER', 400, 'จำนวนเงินหรือค่าตัวเลขไม่ถูกต้อง');
  }
  const number = Number(value);
  if (
    !Number.isFinite(number)
    || (options.min !== undefined && number < options.min)
    || (options.max !== undefined && number > options.max)
  ) {
    throw new TransactionRequestError('INVALID_NUMBER', 400, 'จำนวนเงินหรือค่าตัวเลขไม่ถูกต้อง');
  }
  return number;
}

export function requireUuid(value: unknown): string {
  const normalized = boundedText(value, 64, true) || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new TransactionRequestError('INVALID_ID', 400, 'รหัสรายการไม่ถูกต้อง');
  }
  return normalized;
}

/**
 * Verifies that a URL points to a path in this project's Vercel Blob store.
 * This prevents attacker-controlled URLs from reaching slip/vision providers.
 */
export function requireOwnedBlobUrl(
  value: unknown,
  allowedPrefixes: readonly string[],
): string {
  const normalized = boundedText(value, MAX_IMAGE_URL_LENGTH, true) || '';
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new TransactionRequestError('INVALID_UPLOAD_URL', 400, 'ไฟล์ที่อัปโหลดไม่ถูกต้อง กรุณาอัปโหลดใหม่');
  }
  if (parsed.protocol !== 'https:') {
    throw new TransactionRequestError('INVALID_UPLOAD_URL', 400, 'ไฟล์ที่อัปโหลดไม่ถูกต้อง กรุณาอัปโหลดใหม่');
  }

  // A `.blob.vercel-storage.com` suffix alone is not ownership: an attacker
  // can create a Blob store of their own and choose the same pathname prefix.
  // Bind accepted URLs to this deployment's configured store id.
  const explicitStoreId = String(process.env.BLOB_STORE_ID || '')
    .trim()
    .replace(/^store_/, '');
  const tokenStoreId = String(process.env.BLOB_READ_WRITE_TOKEN || '')
    .trim()
    .split('_')[3]
    ?.trim();
  const storeId = (explicitStoreId || tokenStoreId || '').toLowerCase();
  const expectedPrivateHost = storeId ? `${storeId}.private.blob.vercel-storage.com` : '';
  const expectedPublicHost = storeId ? `${storeId}.public.blob.vercel-storage.com` : '';
  if (
    !storeId
    || (parsed.hostname.toLowerCase() !== expectedPrivateHost
      && parsed.hostname.toLowerCase() !== expectedPublicHost)
  ) {
    throw new TransactionRequestError('INVALID_UPLOAD_URL', 400, 'ไฟล์ที่อัปโหลดไม่ถูกต้อง กรุณาอัปโหลดใหม่');
  }

  const pathname = extractBlobPathname(parsed.toString());
  if (!pathname || !allowedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    throw new TransactionRequestError('INVALID_UPLOAD_URL', 400, 'ไฟล์ที่อัปโหลดไม่ถูกต้อง กรุณาอัปโหลดใหม่');
  }
  return parsed.toString();
}

/** Stable content fingerprint used to reject replayed payment evidence even
 * when a signed Blob URL is regenerated. */
export async function fingerprintOwnedBlob(
  url: string,
  maxBytes = 4 * 1024 * 1024,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new TransactionRequestError(
        'UPLOAD_UNAVAILABLE',
        503,
        'ไม่สามารถอ่านไฟล์ที่อัปโหลดได้ กรุณาลองใหม่',
      );
    }
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new TransactionRequestError('UPLOAD_TOO_LARGE', 413, 'ไฟล์ที่อัปโหลดมีขนาดใหญ่เกินไป');
    }

    const hash = createHash('sha256');
    const reader = response.body.getReader();
    let totalBytes = 0;
    let signature = Buffer.alloc(0);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          throw new TransactionRequestError('UPLOAD_TOO_LARGE', 413, 'ไฟล์ที่อัปโหลดมีขนาดใหญ่เกินไป');
        }
        if (signature.length < 12) {
          signature = Buffer.concat([
            signature,
            Buffer.from(value.subarray(0, Math.max(0, 12 - signature.length))),
          ]);
        }
        hash.update(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (totalBytes === 0) {
      throw new TransactionRequestError('UPLOAD_INVALID', 400, 'ไฟล์ที่อัปโหลดไม่ถูกต้อง');
    }
    const jpeg = signature.length >= 3
      && signature[0] === 0xff
      && signature[1] === 0xd8
      && signature[2] === 0xff;
    const png = signature.length >= 8
      && signature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const webp = signature.length >= 12
      && signature.subarray(0, 4).toString('ascii') === 'RIFF'
      && signature.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!jpeg && !png && !webp) {
      throw new TransactionRequestError(
        'UPLOAD_INVALID_IMAGE',
        415,
        'รองรับเฉพาะไฟล์รูป JPEG, PNG หรือ WebP',
      );
    }
    return hash.digest('hex');
  } catch (error) {
    if (error instanceof TransactionRequestError) throw error;
    throw new TransactionRequestError(
      'UPLOAD_UNAVAILABLE',
      503,
      'ไม่สามารถอ่านไฟล์ที่อัปโหลดได้ กรุณาลองใหม่',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function sanitizedServerError(message = 'ระบบไม่สามารถดำเนินการได้ชั่วคราว กรุณาลองใหม่'): Response {
  return Response.json(
    { error: message, code: 'TEMPORARY_ERROR' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}
