import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';

export class TransactionLockError extends Error {
  constructor(
    public readonly code: 'TRANSACTION_BUSY' | 'TRANSACTION_LOCK_UNAVAILABLE',
    public readonly status: 409 | 503,
  ) {
    super(code);
    this.name = 'TransactionLockError';
  }
}

let redisClient: Redis | null | undefined;

function redis(): Redis | null {
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

/**
 * A short distributed mutex around non-atomic legacy multi-table mutations.
 * The token-aware Lua release cannot delete a lock acquired by a newer call.
 */
export async function acquireTransactionLock(
  scope: string,
  entityId: string,
  ttlSeconds = 300,
): Promise<() => Promise<void>> {
  if (!/^[a-z0-9:_-]{1,80}$/i.test(scope) || !/^[a-z0-9-]{1,128}$/i.test(entityId)) {
    throw new TransactionLockError('TRANSACTION_LOCK_UNAVAILABLE', 503);
  }

  const client = redis();
  if (!client) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      throw new TransactionLockError('TRANSACTION_LOCK_UNAVAILABLE', 503);
    }
    return async () => undefined;
  }

  const key = `transaction-lock:v1:${scope}:${entityId}`;
  const token = randomUUID();
  try {
    const acquired = await client.set(key, token, { nx: true, ex: ttlSeconds });
    if (acquired !== 'OK') {
      throw new TransactionLockError('TRANSACTION_BUSY', 409);
    }
  } catch (error) {
    if (error instanceof TransactionLockError) throw error;
    throw new TransactionLockError('TRANSACTION_LOCK_UNAVAILABLE', 503);
  }

  return async () => {
    try {
      await client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        [key],
        [token],
      );
    } catch {
      // TTL is the final safety net. Never turn a completed mutation into a
      // user-visible failure just because lock cleanup was unavailable.
    }
  };
}

export function transactionLockErrorResponse(error: unknown): Response | null {
  if (!(error instanceof TransactionLockError)) return null;
  const busy = error.code === 'TRANSACTION_BUSY';
  return Response.json(
    {
      error: busy
        ? 'รายการกำลังถูกดำเนินการ กรุณารอสักครู่แล้วลองใหม่'
        : 'ระบบธุรกรรมยังไม่พร้อม กรุณาลองใหม่ภายหลัง',
      code: error.code,
    },
    {
      status: error.status,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': busy ? '10' : '30',
      },
    },
  );
}
