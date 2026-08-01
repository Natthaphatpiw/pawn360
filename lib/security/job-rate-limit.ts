import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';

export type AIJobKind = 'estimate' | 'condition';

export class JobRateLimitError extends Error {
  constructor(
    public readonly code: 'JOB_RATE_LIMITED' | 'JOB_RATE_LIMIT_UNAVAILABLE',
    public readonly status: 429 | 503,
    public readonly retryAfterSeconds: number,
  ) {
    super(code);
    this.name = 'JobRateLimitError';
  }
}

const ADMIT_SCRIPT = `
local short_count = tonumber(redis.call('GET', KEYS[1]) or '0')
local daily_count = tonumber(redis.call('GET', KEYS[2]) or '0')
if short_count >= tonumber(ARGV[1]) then return 1 end
if daily_count >= tonumber(ARGV[2]) then return 2 end
if short_count == 0 then
  redis.call('SET', KEYS[1], '1', 'EX', ARGV[3])
else
  redis.call('INCR', KEYS[1])
end
if daily_count == 0 then
  redis.call('SET', KEYS[2], '1', 'EX', ARGV[4])
else
  redis.call('INCR', KEYS[2])
end
return 0
`;

const WINDOW_SECONDS = 10 * 60;
const DAY_SECONDS = 24 * 60 * 60;

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

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function limits(kind: AIJobKind): { window: number; daily: number } {
  const prefix = kind === 'estimate' ? 'ESTIMATE' : 'CONDITION';
  return {
    window: positiveInteger(
      process.env[`JOB_RATE_LIMIT_${prefix}_PER_10_MIN`],
      kind === 'estimate' ? 12 : 24,
    ),
    daily: positiveInteger(
      process.env[`JOB_RATE_LIMIT_${prefix}_PER_DAY`],
      kind === 'estimate' ? 60 : 120,
    ),
  };
}

function ownerHash(lineId: string): string {
  const secret = process.env.AI_SAFETY_IDENTIFIER_SECRET?.trim();
  return secret
    ? crypto.createHmac('sha256', secret).update(lineId).digest('hex')
    : crypto.createHash('sha256').update(`pawnline-job-owner-v1:${lineId}`).digest('hex');
}

/**
 * Per-owner admission control for paid AI work. Queue retries do not pass this
 * code path, so provider backoff never consumes the user's allowance twice.
 */
export async function enforceAIJobRateLimit(lineId: string, kind: AIJobKind): Promise<void> {
  const client = redis();
  if (!client) {
    // Both production job queues already require Redis. Fail closed here so a
    // configuration incident cannot silently remove the spend guard.
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      throw new JobRateLimitError('JOB_RATE_LIMIT_UNAVAILABLE', 503, 30);
    }
    return;
  }

  const nowSeconds = Math.floor(Date.now() / 1_000);
  const shortBucket = Math.floor(nowSeconds / WINDOW_SECONDS);
  const dayBucket = new Date().toISOString().slice(0, 10);
  const hash = ownerHash(lineId);
  const { window, daily } = limits(kind);

  try {
    const result = Number(await client.eval<[string, string, string, string], number>(
      ADMIT_SCRIPT,
      [
        `job-admission:v1:${kind}:${hash}:10m:${shortBucket}`,
        `job-admission:v1:${kind}:${hash}:day:${dayBucket}`,
      ],
      [String(window), String(daily), String(WINDOW_SECONDS + 60), String(DAY_SECONDS + 60)],
    ));
    if (result === 1) {
      const retryAfter = WINDOW_SECONDS - (nowSeconds % WINDOW_SECONDS);
      throw new JobRateLimitError('JOB_RATE_LIMITED', 429, Math.max(1, retryAfter));
    }
    if (result === 2) {
      const tomorrow = new Date();
      tomorrow.setUTCHours(24, 0, 0, 0);
      throw new JobRateLimitError(
        'JOB_RATE_LIMITED',
        429,
        Math.max(60, Math.ceil((tomorrow.getTime() - Date.now()) / 1_000)),
      );
    }
  } catch (error) {
    if (error instanceof JobRateLimitError) throw error;
    throw new JobRateLimitError('JOB_RATE_LIMIT_UNAVAILABLE', 503, 30);
  }
}

export function aiJobRateLimitResponse(error: JobRateLimitError) {
  const message = error.status === 429
    ? 'ส่งคำขอประมวลผลถี่เกินไป กรุณารอแล้วลองใหม่อีกครั้ง'
    : 'ระบบควบคุมคิวไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง';
  return {
    body: {
      error: message,
      code: error.code.toLowerCase(),
      retryable: true,
      retryAfterSeconds: error.retryAfterSeconds,
    },
    status: error.status,
    headers: { 'Retry-After': String(error.retryAfterSeconds), 'Cache-Control': 'no-store' },
  };
}
