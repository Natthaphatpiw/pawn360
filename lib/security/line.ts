import crypto from 'crypto';

/**
 * Verifies LINE webhook signature
 * @param body - Raw request body as string
 * @param signature - The signature from x-line-signature header
 * @returns boolean indicating if signature is valid
 */
export function verifyLineSignature(body: string, signature: string): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET!;

  if (!channelSecret) {
    console.error('LINE_CHANNEL_SECRET not configured');
    return false;
  }

  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');

  return signature === hash;
}
