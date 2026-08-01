import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

const localLocks = new Map<string, { token: string; expiresAt: number }>();
let redisClient: Redis | null | undefined;

export class FinancialLockError extends Error {
  constructor(
    public readonly code: 'FINANCIAL_LOCK_UNAVAILABLE' | 'FINANCIAL_MUTATION_IN_PROGRESS',
    public readonly status: 409 | 503,
  ) {
    super(code);
    this.name = 'FinancialLockError';
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

function lockKey(resource: string): string {
  const digest = crypto.createHash('sha256').update(resource).digest('hex');
  return `financial-mutation:v1:${digest}`;
}

/**
 * Prevents duplicate financial state transitions across concurrent functions.
 * Production fails closed when Redis is unavailable; local development uses a
 * process-local lock only for ergonomics.
 */
export async function acquireFinancialLock(
  resource: string,
  ttlSeconds = 120,
): Promise<() => Promise<void>> {
  const key = lockKey(resource);
  const token = crypto.randomUUID();
  const redis = getRedis();

  if (redis) {
    let acquired: unknown;
    try {
      acquired = await redis.set(key, token, { nx: true, ex: ttlSeconds });
    } catch {
      throw new FinancialLockError('FINANCIAL_LOCK_UNAVAILABLE', 503);
    }
    if (acquired !== 'OK') {
      throw new FinancialLockError('FINANCIAL_MUTATION_IN_PROGRESS', 409);
    }
    return async () => {
      await redis.eval<[string], number>(RELEASE_LOCK_SCRIPT, [key], [token]).catch(() => {});
    };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new FinancialLockError('FINANCIAL_LOCK_UNAVAILABLE', 503);
  }

  const now = Date.now();
  const existing = localLocks.get(key);
  if (existing && existing.expiresAt > now) {
    throw new FinancialLockError('FINANCIAL_MUTATION_IN_PROGRESS', 409);
  }
  localLocks.set(key, { token, expiresAt: now + ttlSeconds * 1_000 });
  return async () => {
    if (localLocks.get(key)?.token === token) localLocks.delete(key);
  };
}

export function financialLockErrorResponse(error: unknown): Response | null {
  if (!(error instanceof FinancialLockError)) return null;
  const busy = error.status === 409;
  return Response.json(
    {
      error: busy
        ? 'ระบบกำลังดำเนินรายการนี้ กรุณารอสักครู่แล้วตรวจสอบสถานะ'
        : 'ไม่สามารถยืนยันรายการได้ชั่วคราว กรุณาลองใหม่',
      code: error.code,
    },
    {
      status: error.status,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': busy ? '3' : '15',
      },
    },
  );
}
