import crypto from 'crypto';

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
  const secret = process.env.WEBHOOK_SECRET || 'pawn360-webhook-secret';

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
  const secret = process.env.WEBHOOK_SECRET || 'pawn360-webhook-secret';

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
  const fiveMinutes = 5 * 60 * 1000;

  return Math.abs(currentTime - webhookTime) < fiveMinutes;
}
