import crypto from 'crypto';

// Fallback secret used when WEBHOOK_SECRET is not configured (matches the Shop System default).
const DEFAULT_WEBHOOK_SECRET = 'pawn360-webhook-secret';
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
  const secret = process.env.WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET;

  // Create expected signature using the same algorithm as Shop System
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${payload.notificationId}-${payload.timestamp}`)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
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
  const secret = process.env.WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET;

  return crypto
    .createHmac('sha256', secret)
    .update(`${notificationId}-${timestamp}`)
    .digest('hex');
}

/**
 * Checks if webhook timestamp is recent (within 5 minutes)
 * Prevents replay attacks
 */
export function isTimestampValid(timestamp: string): boolean {
  const webhookTime = new Date(timestamp).getTime();
  const currentTime = Date.now();

  return Math.abs(currentTime - webhookTime) < WEBHOOK_TIMESTAMP_TOLERANCE_MS;
}
