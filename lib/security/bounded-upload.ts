export class BoundedUploadError extends Error {
  constructor(
    public readonly code: 'UPLOAD_TOO_LARGE' | 'UPLOAD_CONTENT_TYPE_INVALID',
    public readonly status: 413 | 415,
  ) {
    super(code);
    this.name = 'BoundedUploadError';
  }
}

export async function readBoundedMultipartFormData(
  request: Request,
  maxBytes: number,
): Promise<FormData> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    throw new BoundedUploadError('UPLOAD_CONTENT_TYPE_INVALID', 415);
  }
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new BoundedUploadError('UPLOAD_TOO_LARGE', 413);
  }
  if (!request.body) throw new BoundedUploadError('UPLOAD_CONTENT_TYPE_INVALID', 415);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new BoundedUploadError('UPLOAD_TOO_LARGE', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const boundedRequest = new Request('http://internal.invalid/upload', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: bytes,
  });
  try {
    return await boundedRequest.formData();
  } catch {
    throw new BoundedUploadError('UPLOAD_CONTENT_TYPE_INVALID', 415);
  }
}

export type DetectedUploadType = {
  contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  extension: 'jpg' | 'png' | 'webp' | 'pdf';
};

export function detectUploadType(buffer: Buffer): DetectedUploadType | null {
  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) return { contentType: 'image/jpeg', extension: 'jpg' };

  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return { contentType: 'image/png', extension: 'png' };

  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return { contentType: 'image/webp', extension: 'webp' };

  if (buffer.length >= 8 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    const tail = buffer.subarray(Math.max(0, buffer.length - 1_024)).toString('latin1');
    if (tail.includes('%%EOF')) return { contentType: 'application/pdf', extension: 'pdf' };
  }

  return null;
}

