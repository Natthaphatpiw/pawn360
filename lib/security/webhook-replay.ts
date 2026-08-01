import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';

const DEFAULT_REPLAY_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_PROCESSING_LEASE_SECONDS = 5 * 60;
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;
const MAX_LOCAL_CLAIMS = 2_000;

let redisClient: Redis | null | undefined;
const localClaims = new Map<string, {
  expiresAt: number;
  state: 'processing' | 'completed';
  token: string;
}>();

export class WebhookReplayError extends Error {
  constructor(
    public readonly code:
      | 'WEBHOOK_BODY_TOO_LARGE'
      | 'WEBHOOK_CONTENT_TYPE_INVALID'
      | 'WEBHOOK_REPLAY_STORE_UNAVAILABLE'
      | 'WEBHOOK_EVENT_IN_PROGRESS',
    public readonly status: 413 | 415 | 503,
  ) {
    super(code);
    this.name = 'WebhookReplayError';
  }
}

export interface WebhookClaim {
  duplicate: boolean;
  key?: string;
  token?: string;
  local?: boolean;
}

function production(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }
  try {
    redisClient = new Redis({ url, token });
  } catch {
    redisClient = null;
  }
  return redisClient;
}

async function readBoundedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new WebhookReplayError('WEBHOOK_BODY_TOO_LARGE', 413);
  }
  if (!request.body) return new Uint8Array();

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
        throw new WebhookReplayError('WEBHOOK_BODY_TOO_LARGE', 413);
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
  return bytes;
}

/** Read the exact signed webhook body with an actual streaming byte ceiling. */
export async function readBoundedWebhookText(
  request: Request,
  maxBytes = MAX_WEBHOOK_BODY_BYTES,
): Promise<string> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new WebhookReplayError('WEBHOOK_CONTENT_TYPE_INVALID', 415);
  }
  const bytes = await readBoundedBytes(request, maxBytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new WebhookReplayError('WEBHOOK_CONTENT_TYPE_INVALID', 415);
  }
}

function digestClaim(namespace: string, material: string, signingSecret: string): string {
  return crypto
    .createHmac('sha256', signingSecret)
    .update(`${namespace}\0${material}`)
    .digest('hex');
}

function localClaim(
  key: string,
  leaseSeconds: number,
): WebhookClaim {
  const now = Date.now();
  const existing = localClaims.get(key);
  if (existing && existing.expiresAt > now) {
    if (existing.state === 'completed') return { duplicate: true };
    throw new WebhookReplayError('WEBHOOK_EVENT_IN_PROGRESS', 503);
  }
  const token = crypto.randomUUID();
  localClaims.set(key, {
    expiresAt: now + leaseSeconds * 1_000,
    state: 'processing',
    token,
  });
  if (localClaims.size > MAX_LOCAL_CLAIMS) {
    for (const [candidate, candidateClaim] of localClaims) {
      if (candidateClaim.expiresAt <= now) localClaims.delete(candidate);
    }
  }
  return { duplicate: false, key, token, local: true };
}

/**
 * Atomically reserves a signed webhook event. Only an HMAC digest and a random
 * claim token are persisted; raw payloads and user identifiers are not stored.
 */
export async function claimWebhookEvent(options: {
  namespace: string;
  material: string;
  signingSecret: string;
  ttlSeconds?: number;
  leaseSeconds?: number;
}): Promise<WebhookClaim> {
  const ttlSeconds = options.ttlSeconds || DEFAULT_REPLAY_TTL_SECONDS;
  const leaseSeconds = Math.min(
    ttlSeconds,
    options.leaseSeconds || DEFAULT_PROCESSING_LEASE_SECONDS,
  );
  const digest = digestClaim(options.namespace, options.material, options.signingSecret);
  const key = `webhook-event:v1:${options.namespace}:${digest}`;
  const client = getRedis();

  if (!client) {
    if (production()) {
      throw new WebhookReplayError('WEBHOOK_REPLAY_STORE_UNAVAILABLE', 503);
    }
    return localClaim(key, leaseSeconds);
  }

  const token = crypto.randomUUID();
  try {
    const result = await client.set(key, token, { nx: true, ex: leaseSeconds });
    if (result !== null) return { duplicate: false, key, token };

    const existing = await client.get<string>(key);
    if (existing === 'completed') return { duplicate: true };
    if (existing === null) {
      // The lease expired between SET NX and GET; make one fresh attempt.
      const retried = await client.set(key, token, { nx: true, ex: leaseSeconds });
      if (retried !== null) return { duplicate: false, key, token };
    }
    throw new WebhookReplayError('WEBHOOK_EVENT_IN_PROGRESS', 503);
  } catch (error) {
    if (error instanceof WebhookReplayError) throw error;
    if (production()) {
      throw new WebhookReplayError('WEBHOOK_REPLAY_STORE_UNAVAILABLE', 503);
    }
    return localClaim(key, leaseSeconds);
  }
}

const COMPLETE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], 'completed', 'EX', ARGV[2])
  return 1
end
return 0
`;

/** Convert a short processing lease into a durable completed marker. */
export async function completeWebhookClaim(
  claim: WebhookClaim,
  ttlSeconds = DEFAULT_REPLAY_TTL_SECONDS,
): Promise<void> {
  if (claim.duplicate || !claim.key || !claim.token) return;
  if (claim.local) {
    const existing = localClaims.get(claim.key);
    if (!existing || existing.token !== claim.token || existing.state !== 'processing') {
      throw new WebhookReplayError('WEBHOOK_EVENT_IN_PROGRESS', 503);
    }
    localClaims.set(claim.key, {
      expiresAt: Date.now() + ttlSeconds * 1_000,
      state: 'completed',
      token: 'completed',
    });
    return;
  }

  const client = getRedis();
  if (!client) throw new WebhookReplayError('WEBHOOK_REPLAY_STORE_UNAVAILABLE', 503);
  try {
    const completed = await client.eval<[string, string], number>(
      COMPLETE_SCRIPT,
      [claim.key],
      [claim.token, String(ttlSeconds)],
    );
    if (completed !== 1) throw new WebhookReplayError('WEBHOOK_EVENT_IN_PROGRESS', 503);
  } catch (error) {
    if (error instanceof WebhookReplayError) throw error;
    throw new WebhookReplayError('WEBHOOK_REPLAY_STORE_UNAVAILABLE', 503);
  }
}

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/** Release a claim only after processing failed so the provider retry can run. */
export async function releaseWebhookClaim(claim: WebhookClaim): Promise<void> {
  if (claim.duplicate || !claim.key || !claim.token) return;
  if (claim.local) {
    const existing = localClaims.get(claim.key);
    if (existing?.token === claim.token && existing.state === 'processing') {
      localClaims.delete(claim.key);
    }
    return;
  }
  const client = getRedis();
  if (!client) return;
  try {
    await client.eval<[string], number>(RELEASE_SCRIPT, [claim.key], [claim.token]);
  } catch {
    // The short-lived reservation safely expires; never log the key/token.
  }
}

export function webhookReplayErrorResponse(error: unknown): Response | null {
  if (!(error instanceof WebhookReplayError)) return null;
  const message = error.status === 413
    ? 'Payload too large'
    : error.status === 415
      ? 'Unsupported payload'
      : error.code === 'WEBHOOK_EVENT_IN_PROGRESS'
        ? 'Webhook event is still processing'
        : 'Webhook processing temporarily unavailable';
  return Response.json(
    { error: message, code: error.code },
    {
      status: error.status,
      headers: {
        'Cache-Control': 'no-store',
        ...(error.status === 503
          ? { 'Retry-After': error.code === 'WEBHOOK_EVENT_IN_PROGRESS' ? '5' : '30' }
          : {}),
      },
    },
  );
}
