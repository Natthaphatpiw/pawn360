import crypto from 'crypto';

// Replay-attack window: webhook timestamps must be within this tolerance of now.
const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Verifies webhook signature from Shop System
 * @param payload - The webhook payload object
 * @param signature - The signature from X-Webhook-Signature header
 * @returns boolean indicating if signature is valid
 */
export function verifyWebhookSignature(
  payload: any,
  signature: string
): boolean {
  const secret = process.env.WEBHOOK_SECRET || '';
  if (!secret || !signature || signature.length > 512) return false;

  const notificationId = typeof payload?.notificationId === 'string'
    ? payload.notificationId
    : '';
  const timestamp = typeof payload?.timestamp === 'string'
    ? payload.timestamp
    : '';
  if (!notificationId || !timestamp) return false;

  // Create expected signature using the same algorithm as Shop System
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${notificationId}-${timestamp}`)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  return signatureBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

/**
 * Verifies the full, exact Shop webhook body. Unlike the legacy signature,
 * this binds `type` and `data` as well as notificationId/timestamp.
 */
export function verifyShopWebhookBodySignature(
  rawBody: string,
  signature: string,
): boolean {
  const secret = process.env.WEBHOOK_SECRET || '';
  if (!secret || !rawBody || !signature || signature.length > 512) return false;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  return signatureBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

/**
 * Production defaults to full-body HMAC. The old id/timestamp-only protocol is
 * available solely through an explicit migration flag for the Shop provider.
 */
export function verifyConfiguredShopWebhookSignature(
  rawBody: string,
  payload: unknown,
  signature: string,
): boolean {
  const mode = String(process.env.SHOP_WEBHOOK_SIGNATURE_MODE || 'body-hmac-v2').trim();
  if (mode === 'body-hmac-v2') {
    return verifyShopWebhookBodySignature(rawBody, signature);
  }
  if (mode === 'legacy-id-timestamp' && process.env.SHOP_WEBHOOK_ALLOW_LEGACY_HMAC === 'true') {
    return verifyWebhookSignature(payload, signature);
  }
  return false;
}

/**
 * Generates webhook signature for sending requests to Shop System
 * @param notificationId - The notification ID
 * @param timestamp - ISO timestamp string
 * @returns signature string
 */
export function generateWebhookSignature(
  notificationId: string,
  timestamp: string
): string {
  const secret = process.env.WEBHOOK_SECRET || '';
  if (!secret) {
    throw new Error('WEBHOOK_SECRET is not configured');
  }

  return crypto
    .createHmac('sha256', secret)
    .update(`${notificationId}-${timestamp}`)
    .digest('hex');
}

export function generateShopWebhookBodySignature(rawBody: string): string {
  const secret = process.env.WEBHOOK_SECRET || '';
  if (!secret) throw new Error('WEBHOOK_SECRET is not configured');
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Checks if webhook timestamp is recent (within 5 minutes)
 * Prevents replay attacks
 */
export function isTimestampValid(timestamp: string): boolean {
  const webhookTime = new Date(timestamp).getTime();
  const currentTime = Date.now();

  return Number.isFinite(webhookTime)
    && Math.abs(currentTime - webhookTime) < WEBHOOK_TIMESTAMP_TOLERANCE_MS;
}
