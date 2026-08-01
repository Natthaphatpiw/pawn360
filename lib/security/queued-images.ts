const MAX_QUEUE_IMAGE_COUNT = 4;
const MAX_IMAGE_URL_LENGTH = 4096;

export const MAX_QUEUE_REQUEST_BODY_BYTES = 128 * 1024;

export type QueuedImageValidation =
  | { ok: true; images: string[] }
  | { ok: false; status: number; error: string; code: string };

function configuredBlobStoreId(): string {
  const explicit = String(process.env.BLOB_STORE_ID || '')
    .trim()
    .replace(/^store_/, '');
  const tokenDerived = String(process.env.BLOB_READ_WRITE_TOKEN || '')
    .trim()
    .split('_')[3]
    ?.trim();
  return (explicit || tokenDerived || '').toLowerCase();
}

/**
 * Queue jobs carry image references, never image bytes. In production those
 * references must point at our private Vercel Blob store so an attacker cannot
 * turn the vision workers into an SSRF/open-proxy surface.
 */
export function validateQueuedImageUrls(images: unknown): QueuedImageValidation {
  if (!Array.isArray(images) || images.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'กรุณาอัพโหลดรูปภาพอย่างน้อย 1 รูป',
      code: 'images_required',
    };
  }
  if (images.length > MAX_QUEUE_IMAGE_COUNT) {
    return {
      ok: false,
      status: 400,
      error: `อัพโหลดรูปภาพได้สูงสุด ${MAX_QUEUE_IMAGE_COUNT} รูป`,
      code: 'too_many_images',
    };
  }

  const production = process.env.VERCEL_ENV === 'production'
    || process.env.NODE_ENV === 'production';
  const blobStoreId = configuredBlobStoreId();
  if (production && !blobStoreId) {
    return {
      ok: false,
      status: 503,
      error: 'บริการจัดเก็บรูปภาพยังไม่พร้อม กรุณาลองใหม่',
      code: 'image_store_unavailable',
    };
  }
  const normalized: string[] = [];
  for (const value of images) {
    if (typeof value !== 'string' || value.length > MAX_IMAGE_URL_LENGTH) {
      return {
        ok: false,
        status: 413,
        error: 'กรุณาอัพโหลดรูปภาพก่อนส่งคำขอวิเคราะห์',
        code: 'image_upload_required',
      };
    }

    const trimmed = value.trim();
    if (trimmed.toLowerCase().startsWith('data:')) {
      return {
        ok: false,
        status: 413,
        error: 'กรุณาอัพโหลดรูปภาพก่อนส่งคำขอวิเคราะห์',
        code: 'image_upload_required',
      };
    }

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:') throw new Error('HTTPS required');
      const expectedHosts = new Set([
        `${blobStoreId}.private.blob.vercel-storage.com`,
        `${blobStoreId}.public.blob.vercel-storage.com`,
      ]);
      const pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
      if (
        production
        && (!expectedHosts.has(parsed.hostname.toLowerCase())
          || !pathname.startsWith('pawn-items/'))
      ) {
        return {
          ok: false,
          status: 400,
          error: 'แหล่งที่มาของรูปภาพไม่ถูกต้อง กรุณาอัพโหลดใหม่',
          code: 'invalid_image_source',
        };
      }
      normalized.push(parsed.toString());
    } catch {
      return {
        ok: false,
        status: 413,
        error: 'กรุณาอัพโหลดรูปภาพก่อนส่งคำขอวิเคราะห์',
        code: 'image_upload_required',
      };
    }
  }

  return { ok: true, images: normalized };
}
