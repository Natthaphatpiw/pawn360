import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';

let redisClient: Redis | null | undefined;

const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

export class ActorRateLimitError extends Error {
  constructor(
    public readonly code: 'RATE_LIMITED' | 'RATE_LIMIT_UNAVAILABLE',
    public readonly status: 429 | 503,
    public readonly retryAfterSeconds: number,
  ) {
    super(code);
    this.name = 'ActorRateLimitError';
  }
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

function production(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function actorDigest(actor: string): string {
  const secret = process.env.RATE_LIMIT_IDENTIFIER_SECRET
    || process.env.AI_SAFETY_IDENTIFIER_SECRET
    || process.env.INTERNAL_API_SECRET
    || '';
  if (secret) {
    return crypto.createHmac('sha256', secret).update(actor).digest('hex');
  }
  return crypto.createHash('sha256').update(`pawnline-rate-limit-v1:${actor}`).digest('hex');
}

/**
 * Fixed-window, per-actor admission control. Redis keys contain only a digest,
 * never a LINE user ID, phone number, IP address, or other direct identifier.
 */
export async function enforceActorRateLimit(options: {
  scope: string;
  actor: string;
  limit: number;
  windowSeconds: number;
}): Promise<void> {
  const { scope, actor, limit, windowSeconds } = options;
  const client = getRedis();
  if (!client) {
    if (production()) {
      throw new ActorRateLimitError('RATE_LIMIT_UNAVAILABLE', 503, 30);
    }
    return;
  }

  const nowSeconds = Math.floor(Date.now() / 1_000);
  const bucket = Math.floor(nowSeconds / windowSeconds);
  const safeScope = scope.replace(/[^a-z0-9:_-]/gi, '').slice(0, 80);
  const key = `actor-limit:v1:${safeScope}:${actorDigest(actor)}:${bucket}`;

  try {
    const count = await client.eval<[string], number>(
      FIXED_WINDOW_SCRIPT,
      [key],
      [String(windowSeconds + 30)],
    );
    if (count > limit) {
      const retryAfter = Math.max(1, windowSeconds - (nowSeconds % windowSeconds));
      throw new ActorRateLimitError('RATE_LIMITED', 429, retryAfter);
    }
  } catch (error) {
    if (error instanceof ActorRateLimitError) throw error;
    if (production()) {
      throw new ActorRateLimitError('RATE_LIMIT_UNAVAILABLE', 503, 30);
    }
  }
}
