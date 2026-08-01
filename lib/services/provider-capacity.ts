import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';

import {
  ProviderError,
  ProviderName,
} from '@/lib/services/provider-error';

type CapacityProvider = Exclude<ProviderName, 'unknown'>;

interface ProviderCapacityOptions {
  provider: CapacityProvider;
  model: string;
  operation: string;
  estimatedTokens?: number;
  leaseMs?: number;
}

interface CapacityLimits {
  requestsPerMinute: number;
  tokensPerMinute: number;
  concurrency: number;
}

interface ProviderCapacityLease {
  /**
   * Reconciles a successful request with provider-reported tokens and always
   * releases concurrency. Omit actualTokens after an ambiguous transport
   * failure so the conservative token reservation remains until the bucket
   * expires.
   */
  settle(actualTokens?: number): Promise<void>;
}

const DEFAULT_LIMITS: Readonly<Record<CapacityProvider, CapacityLimits>> = {
  openai: { requestsPerMinute: 240, tokensPerMinute: 1_000_000, concurrency: 16 },
  anthropic: { requestsPerMinute: 120, tokensPerMinute: 500_000, concurrency: 8 },
  parallel: { requestsPerMinute: 120, tokensPerMinute: 0, concurrency: 12 },
  exa: { requestsPerMinute: 120, tokensPerMinute: 0, concurrency: 8 },
  serpapi: { requestsPerMinute: 120, tokensPerMinute: 0, concurrency: 12 },
};

const CAPACITY_PREFIX = 'provider-capacity:v2';
const MINUTE_MS = 60_000;
const BUCKET_TTL_SECONDS = 180;
const DEFAULT_LEASE_MS = 120_000;
const MAX_LEASE_MS = 15 * 60_000;

const ACQUIRE_SCRIPT = `
local now = tonumber(ARGV[1])
local leaseExpiry = tonumber(ARGV[2])
local leaseToken = ARGV[3]
local globalRpmLimit = tonumber(ARGV[4])
local modelRpmLimit = tonumber(ARGV[5])
local globalTpmLimit = tonumber(ARGV[6])
local modelTpmLimit = tonumber(ARGV[7])
local globalConcurrencyLimit = tonumber(ARGV[8])
local modelConcurrencyLimit = tonumber(ARGV[9])
local reservedTokens = tonumber(ARGV[10])
local bucketTtl = tonumber(ARGV[11])
local leaseTtl = tonumber(ARGV[12])
local retryAfterMs = tonumber(ARGV[13])

redis.call('zremrangebyscore', KEYS[5], '-inf', now)
redis.call('zremrangebyscore', KEYS[6], '-inf', now)

if redis.call('zcard', KEYS[5]) >= globalConcurrencyLimit then
  local nextLease = redis.call('zrange', KEYS[5], 0, 0, 'WITHSCORES')
  if nextLease[2] then retryAfterMs = math.max(1000, tonumber(nextLease[2]) - now) end
  return {0, 'concurrency', retryAfterMs}
end
if redis.call('zcard', KEYS[6]) >= modelConcurrencyLimit then
  local nextLease = redis.call('zrange', KEYS[6], 0, 0, 'WITHSCORES')
  if nextLease[2] then retryAfterMs = math.max(1000, tonumber(nextLease[2]) - now) end
  return {0, 'concurrency', retryAfterMs}
end

local globalRpm = tonumber(redis.call('get', KEYS[1]) or '0')
local modelRpm = tonumber(redis.call('get', KEYS[2]) or '0')
if globalRpm + 1 > globalRpmLimit or modelRpm + 1 > modelRpmLimit then
  return {0, 'rpm', retryAfterMs}
end

local globalTpm = tonumber(redis.call('get', KEYS[3]) or '0')
local modelTpm = tonumber(redis.call('get', KEYS[4]) or '0')
if globalTpmLimit > 0 and globalTpm + reservedTokens > globalTpmLimit then
  return {0, 'tpm', retryAfterMs}
end
if modelTpmLimit > 0 and modelTpm + reservedTokens > modelTpmLimit then
  return {0, 'tpm', retryAfterMs}
end

redis.call('incr', KEYS[1])
redis.call('expire', KEYS[1], bucketTtl)
redis.call('incr', KEYS[2])
redis.call('expire', KEYS[2], bucketTtl)
if reservedTokens > 0 then
  redis.call('incrby', KEYS[3], reservedTokens)
  redis.call('expire', KEYS[3], bucketTtl)
  redis.call('incrby', KEYS[4], reservedTokens)
  redis.call('expire', KEYS[4], bucketTtl)
end
redis.call('zadd', KEYS[5], leaseExpiry, leaseToken)
redis.call('pexpire', KEYS[5], leaseTtl)
redis.call('zadd', KEYS[6], leaseExpiry, leaseToken)
redis.call('pexpire', KEYS[6], leaseTtl)
return {1, 'ok', 0}
`;

const SETTLE_SCRIPT = `
local leaseToken = ARGV[1]
local tokenDelta = tonumber(ARGV[2])
local bucketTtl = tonumber(ARGV[3])

if tokenDelta ~= 0 then
  local globalTokens = math.max(0, tonumber(redis.call('get', KEYS[1]) or '0') + tokenDelta)
  local modelTokens = math.max(0, tonumber(redis.call('get', KEYS[2]) or '0') + tokenDelta)
  redis.call('set', KEYS[1], globalTokens, 'EX', bucketTtl)
  redis.call('set', KEYS[2], modelTokens, 'EX', bucketTtl)
end
redis.call('zrem', KEYS[3], leaseToken)
redis.call('zrem', KEYS[4], leaseToken)
return 1
`;

let redisClient: Redis | null | undefined;

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

function isFailClosed(): boolean {
  const configured = String(process.env.PROVIDER_CAPACITY_FAIL_CLOSED || '').trim().toLowerCase();
  if (configured) return ['1', 'true', 'yes', 'on'].includes(configured);
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function safeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._:-]/g, '-').slice(0, 100) || 'default';
}

function envSegment(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 100) || 'DEFAULT';
}

function limitFromEnv(name: string, fallback: number, allowZero = false): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < (allowZero ? 0 : 1)) return fallback;
  return Math.floor(parsed);
}

function resolveLimits(provider: CapacityProvider, model: string): {
  global: CapacityLimits;
  model: CapacityLimits;
} {
  const defaults = DEFAULT_LIMITS[provider];
  const providerEnv = envSegment(provider);
  const modelEnv = envSegment(model);
  const global: CapacityLimits = {
    requestsPerMinute: limitFromEnv(
      `PROVIDER_CAPACITY_${providerEnv}_RPM`,
      defaults.requestsPerMinute,
    ),
    tokensPerMinute: limitFromEnv(
      `PROVIDER_CAPACITY_${providerEnv}_TPM`,
      defaults.tokensPerMinute,
      true,
    ),
    concurrency: limitFromEnv(
      `PROVIDER_CAPACITY_${providerEnv}_CONCURRENCY`,
      defaults.concurrency,
    ),
  };
  return {
    global,
    model: {
      requestsPerMinute: limitFromEnv(
        `PROVIDER_CAPACITY_${providerEnv}_${modelEnv}_RPM`,
        global.requestsPerMinute,
      ),
      tokensPerMinute: limitFromEnv(
        `PROVIDER_CAPACITY_${providerEnv}_${modelEnv}_TPM`,
        global.tokensPerMinute,
        true,
      ),
      concurrency: limitFromEnv(
        `PROVIDER_CAPACITY_${providerEnv}_${modelEnv}_CONCURRENCY`,
        global.concurrency,
      ),
    },
  };
}

export class ProviderCapacityError extends ProviderError {
  constructor(provider: CapacityProvider, operation: string, retryAfterMs: number) {
    super(`${provider} capacity is temporarily exhausted`, {
      provider,
      kind: 'RATE_LIMITED',
      retryable: true,
      retryAfterMs,
      operation,
    });
    this.name = 'ProviderCapacityError';
  }
}

export async function acquireProviderCapacity(
  options: ProviderCapacityOptions,
): Promise<ProviderCapacityLease> {
  const redis = getRedis();
  if (!redis) {
    if (isFailClosed()) {
      throw new ProviderError('Provider capacity store is unavailable', {
        provider: options.provider,
        kind: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
        retryAfterMs: 30_000,
        operation: options.operation,
      });
    }
    return { settle: async () => undefined };
  }

  const now = Date.now();
  const minuteBucket = Math.floor(now / MINUTE_MS);
  const retryAfterMs = Math.max(1_000, ((minuteBucket + 1) * MINUTE_MS) - now + 250);
  const providerSegment = safeSegment(options.provider);
  const modelSegment = safeSegment(options.model);
  const globalPrefix = `${CAPACITY_PREFIX}:${providerSegment}:all`;
  const modelPrefix = `${CAPACITY_PREFIX}:${providerSegment}:${modelSegment}`;
  const keys = [
    `${globalPrefix}:rpm:${minuteBucket}`,
    `${modelPrefix}:rpm:${minuteBucket}`,
    `${globalPrefix}:tpm:${minuteBucket}`,
    `${modelPrefix}:tpm:${minuteBucket}`,
    `${globalPrefix}:concurrency`,
    `${modelPrefix}:concurrency`,
  ];
  const limits = resolveLimits(options.provider, options.model);
  const reservedTokens = Math.max(0, Math.ceil(Number(options.estimatedTokens) || 0));
  const leaseMs = Math.max(
    30_000,
    Math.min(MAX_LEASE_MS, Math.ceil(Number(options.leaseMs) || DEFAULT_LEASE_MS)),
  );
  const leaseToken = crypto.randomUUID();

  let result: unknown;
  try {
    result = await redis.eval<
      [string, string, string, string, string, string, string, string, string, string, string, string, string],
      unknown
    >(
      ACQUIRE_SCRIPT,
      keys,
      [
        String(now),
        String(now + leaseMs),
        leaseToken,
        String(limits.global.requestsPerMinute),
        String(limits.model.requestsPerMinute),
        String(limits.global.tokensPerMinute),
        String(limits.model.tokensPerMinute),
        String(limits.global.concurrency),
        String(limits.model.concurrency),
        String(reservedTokens),
        String(BUCKET_TTL_SECONDS),
        String(leaseMs + 60_000),
        String(retryAfterMs),
      ],
    );
  } catch (cause) {
    throw new ProviderError('Provider capacity store is unavailable', {
      provider: options.provider,
      kind: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
      retryAfterMs: 30_000,
      operation: options.operation,
      cause,
    });
  }

  const tuple = Array.isArray(result) ? result : [];
  if (Number(tuple[0]) !== 1) {
    const providerRetryAfterMs = Math.max(1_000, Number(tuple[2]) || retryAfterMs);
    throw new ProviderCapacityError(options.provider, options.operation, providerRetryAfterMs);
  }

  let settled = false;
  return {
    async settle(actualTokens?: number): Promise<void> {
      if (settled) return;
      settled = true;
      const hasActualTokens = actualTokens !== undefined && Number.isFinite(actualTokens);
      const actual = hasActualTokens ? Math.max(0, Math.ceil(actualTokens)) : reservedTokens;
      const tokenDelta = actual - reservedTokens;
      try {
        await redis.eval<[string, string, string], number>(
          SETTLE_SCRIPT,
          [keys[2], keys[3], keys[4], keys[5]],
          [leaseToken, String(tokenDelta), String(BUCKET_TTL_SECONDS)],
        );
      } catch {
        // The provider operation has already completed. Never duplicate a
        // billable request merely because reconciliation failed; the lease and
        // conservative token reservation expire automatically.
        console.warn('Provider capacity reconciliation failed.', {
          provider: options.provider,
          operation: options.operation,
        });
      }
    },
  };
}

export async function withProviderCapacity<T>(
  options: ProviderCapacityOptions,
  operation: () => Promise<T>,
  actualTokens?: (result: T) => number | undefined,
  actualTokensOnError?: (error: unknown) => number | undefined,
): Promise<T> {
  const lease = await acquireProviderCapacity(options);
  try {
    const result = await operation();
    await lease.settle(actualTokens?.(result));
    return result;
  } catch (error) {
    await lease.settle(actualTokensOnError?.(error));
    throw error;
  }
}
