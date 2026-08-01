import crypto from 'node:crypto';
import type { Message } from '@line/bot-sdk';

export class LinePushError extends Error {
  public readonly code: string;

  constructor(
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    const code = `LINE_PUSH_FAILED_${status}`;
    super(code);
    this.code = code;
    this.name = 'LinePushError';
  }
}

export function lineRetryKeyFromMaterial(material: string): string {
  const digest = crypto.createHash('sha256').update(material).digest('hex');
  const bytes = Buffer.from(digest.slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function pushLineMessage(params: {
  channelAccessToken?: string | null;
  to?: string | null;
  messages: Message | Message[];
  signal?: AbortSignal;
  retryKey?: string;
}) {
  const token = String(params.channelAccessToken || '').trim();
  const to = String(params.to || '').trim();
  const messages = Array.isArray(params.messages) ? params.messages : [params.messages];

  if (!token || !to || messages.length === 0) {
    return { success: false, skipped: true };
  }
  if (token.length > 4_096 || to.length > 128 || messages.length > 5) {
    throw new Error('LINE_PUSH_REQUEST_INVALID');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (params.retryKey && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.retryKey)) {
    headers['X-Line-Retry-Key'] = params.retryKey;
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      to,
      messages,
    }),
    cache: 'no-store',
    redirect: 'error',
    signal: params.signal,
  });

  if (
    response.status === 409
    && response.headers.has('x-line-accepted-request-id')
    && params.retryKey
  ) {
    return { success: true, deduplicated: true };
  }

  if (!response.ok) {
    // Provider bodies can contain request details. Keep retry/log errors
    // machine-readable without propagating provider payloads into logs.
    const rawRetryAfter = Number.parseInt(response.headers.get('retry-after') || '', 10);
    const retryAfterSeconds = Number.isFinite(rawRetryAfter) && rawRetryAfter > 0
      ? Math.min(rawRetryAfter, 3_600)
      : undefined;
    throw new LinePushError(response.status, retryAfterSeconds);
  }

  return { success: true };
}

export async function pushLineTextMessage(params: {
  channelAccessToken?: string | null;
  to?: string | null;
  text: string;
  signal?: AbortSignal;
  retryKey?: string;
}) {
  if (!params.text) return { success: false, skipped: true };
  return pushLineMessage({
    channelAccessToken: params.channelAccessToken,
    to: params.to,
    messages: { type: 'text', text: params.text },
    signal: params.signal,
    retryKey: params.retryKey,
  });
}
