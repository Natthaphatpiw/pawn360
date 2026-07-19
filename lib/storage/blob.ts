import {
  del,
  issueSignedToken,
  presignUrl,
  put,
  type PutBlobResult,
} from '@vercel/blob';

type BlobPutBody = Parameters<typeof put>[1];

const PRIVATE_ACCESS = 'private' as const;
const DEFAULT_SIGNED_URL_EXPIRATION_SECONDS = 7 * 24 * 60 * 60;
const MAX_SIGNED_URL_EXPIRATION_SECONDS = 7 * 24 * 60 * 60;
const QR_CODE_FOLDER = 'cont360';

const BLOB_PATH_PREFIXES = [
  'cont360/',
  'pawn-items/',
  'contracts/',
  'slips/',
  'uploads/',
  'droppoint-verification/',
  'drop-point-returns/',
  'penalty-slips/',
  'contract-action-slips/',
  'signatures/',
  'investor-slips/',
  'redemption-slips/',
  'redemption-receipts/',
  'payment-slips/',
  'bank/',
];

export interface PrivateBlobUploadResult extends PutBlobResult {
  signedUrl: string;
}

function getBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      'Vercel Blob is not configured. Please set BLOB_READ_WRITE_TOKEN in the environment.',
    );
  }
  return token;
}

function normalizePathname(value: string): string {
  return value.replace(/^\/+/, '');
}

function isBlobHostname(hostname: string): boolean {
  return hostname.endsWith('.blob.vercel-storage.com');
}

function isKnownBlobPathname(pathname: string): boolean {
  return BLOB_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function extractBlobPathname(value: string): string | null {
  if (!value) return null;

  if (!value.includes('://')) {
    const pathname = normalizePathname(value);
    return isKnownBlobPathname(pathname) ? pathname : null;
  }

  try {
    const parsed = new URL(value);
    if (!isBlobHostname(parsed.hostname)) return null;
    const pathname = normalizePathname(decodeURIComponent(parsed.pathname));
    return pathname || null;
  } catch {
    return null;
  }
}

export async function getPrivateBlobSignedUrl(
  urlOrPathname: string,
  expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRATION_SECONDS,
  options: { useCache?: boolean } = {},
): Promise<string> {
  const pathname = extractBlobPathname(urlOrPathname) ?? normalizePathname(urlOrPathname);
  if (!pathname) {
    throw new Error('A Vercel Blob pathname is required.');
  }

  const safeExpiresInSeconds = Math.min(
    Math.max(Math.floor(expiresInSeconds), 1),
    MAX_SIGNED_URL_EXPIRATION_SECONDS,
  );
  const validUntil = Date.now() + safeExpiresInSeconds * 1000;
  const signedToken = await issueSignedToken({
    pathname,
    operations: ['get'],
    validUntil,
    token: getBlobToken(),
  });
  const { presignedUrl } = await presignUrl(signedToken, {
    access: PRIVATE_ACCESS,
    operation: 'get',
    pathname,
    validUntil,
    useCache: options.useCache,
  });

  return presignedUrl;
}

export async function putPrivateBlob(
  pathname: string,
  body: BlobPutBody,
  contentType: string,
  options: { allowOverwrite?: boolean; useCache?: boolean } = {},
): Promise<PrivateBlobUploadResult> {
  const normalizedPathname = normalizePathname(pathname);
  if (!normalizedPathname) {
    throw new Error('A Vercel Blob pathname is required.');
  }

  const blob = await put(normalizedPathname, body, {
    access: PRIVATE_ACCESS,
    contentType,
    addRandomSuffix: false,
    allowOverwrite: options.allowOverwrite,
    token: getBlobToken(),
  });
  const signedUrl = await getPrivateBlobSignedUrl(blob.pathname, undefined, {
    useCache: options.useCache,
  });

  return { ...blob, signedUrl };
}

export async function refreshBlobUrls(urls?: string[]): Promise<string[]> {
  if (!urls || urls.length === 0) return urls || [];

  return Promise.all(
    urls.map(async (url) => {
      if (!url) return url;
      const pathname = extractBlobPathname(url);
      if (!pathname) return url;

      try {
        return await getPrivateBlobSignedUrl(pathname);
      } catch {
        return url;
      }
    }),
  );
}

export async function uploadQRCodeToBlob(
  itemId: string,
  qrCodeBuffer: Buffer,
): Promise<string> {
  const pathname = `${QR_CODE_FOLDER}/qr-${itemId}.png`;
  const blob = await putPrivateBlob(pathname, qrCodeBuffer, 'image/png', {
    allowOverwrite: true,
    useCache: false,
  });
  return blob.signedUrl;
}

export async function getQRCodeSignedUrl(
  itemId: string,
  expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRATION_SECONDS,
): Promise<string> {
  return getPrivateBlobSignedUrl(
    `${QR_CODE_FOLDER}/qr-${itemId}.png`,
    expiresInSeconds,
    { useCache: false },
  );
}

export async function uploadSignatureToBlob(
  contractId: string,
  signatureDataURL: string,
): Promise<string> {
  const base64Data = signatureDataURL.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const blob = await putPrivateBlob(
    `${QR_CODE_FOLDER}/signature-${contractId}.png`,
    buffer,
    'image/png',
    { allowOverwrite: true, useCache: false },
  );
  return blob.signedUrl;
}

export async function testBlobConnection(): Promise<boolean> {
  const pathname = `${QR_CODE_FOLDER}/test-connection-${Date.now()}.txt`;

  try {
    const blob = await putPrivateBlob(pathname, 'test', 'text/plain');
    await del(blob.pathname, {
      token: getBlobToken(),
    });
    console.log('✅ Vercel Blob connection successful!');
    return true;
  } catch (error) {
    console.error('❌ Vercel Blob connection failed:', error);
    return false;
  }
}
