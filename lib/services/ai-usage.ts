import crypto from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Redis } from '@upstash/redis';

import { ProviderError, ProviderName } from '@/lib/services/provider-error';

export interface AIUsageContextInput {
  /** Queue/job identifier only. Never pass LINE IDs, emails, names, or URLs. */
  jobId?: string;
  /** Stable pseudonym such as the output of deriveAISafetyIdentifier(). */
  safetyIdentifier?: string;
}

export interface AIUsageEvent {
  provider: ProviderName;
  operation: string;
  model?: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  costUsd: number;
  /** Whether cost came from provider usage, a conservative upper bound, or is known to be zero. */
  costBasis?: 'provider_usage' | 'upper_bound' | 'known_zero';
  /** Provider/client correlation ID only; never place a user identifier here. */
  requestId?: string;
  latencyMs: number;
  cacheStatus?: string;
  fallbackUsed?: boolean;
  success: boolean;
  errorKind?: string;
}

interface AIUsageStore extends AIUsageContextInput {
  events: AIUsageEvent[];
  actualCostUsd: number;
}

export interface AIBudgetReservation {
  reservedCostUsd: number;
  settle(actualCostUsd: number): Promise<void>;
}

const storage = new AsyncLocalStorage<AIUsageStore>();
export const MAX_AI_SAFETY_IDENTIFIER_LENGTH = 64;
const DEFAULT_USAGE_TTL_SECONDS = 90 * 24 * 60 * 60;
const MONTH_TTL_SECONDS = 400 * 24 * 60 * 60;
const RESERVE_SCRIPT = `
local amount = tonumber(ARGV[1])
local month_limit = tonumber(ARGV[2])
local job_limit = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local month_value = tonumber(redis.call('GET', KEYS[1]) or '0')
if month_limit > 0 and month_value + amount > month_limit then return -1 end
if #KEYS > 1 then
  local job_value = tonumber(redis.call('GET', KEYS[2]) or '0')
  if job_limit > 0 and job_value + amount > job_limit then return -2 end
end
redis.call('INCRBYFLOAT', KEYS[1], amount)
redis.call('EXPIRE', KEYS[1], ttl)
if #KEYS > 1 then
  redis.call('INCRBYFLOAT', KEYS[2], amount)
  redis.call('EXPIRE', KEYS[2], ttl)
end
return 1
`;
const SETTLE_SCRIPT = `
local delta = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
for i, key in ipairs(KEYS) do
  local value = tonumber(redis.call('GET', key) or '0') + delta
  if value < 0 then value = 0 end
  redis.call('SET', key, tostring(value), 'EX', ttl)
end
return 1
`;
const RESERVE_OWNER_SCRIPT = `
local amount = tonumber(ARGV[1])
local owner_limit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if owner_limit > 0 and current + amount > owner_limit then return -1 end
redis.call('INCRBYFLOAT', KEYS[1], amount)
redis.call('EXPIRE', KEYS[1], ttl)
return 1
`;
const SETTLE_ONE_SCRIPT = `
local delta = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local value = tonumber(redis.call('GET', KEYS[1]) or '0') + delta
if value < 0 then value = 0 end
redis.call('SET', KEYS[1], tostring(value), 'EX', ttl)
return 1
`;

let redisClient: Redis | null | undefined;

function positiveNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function usageTtlSeconds(): number {
  const parsed = Math.floor(positiveNumber(process.env.AI_USAGE_TTL_SECONDS));
  return parsed || DEFAULT_USAGE_TTL_SECONDS;
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

function safeKeyPart(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function monthKey(now = new Date()): string {
  return `ai-usage:month:${now.toISOString().slice(0, 7)}`;
}

function jobCostKey(jobId: string): string {
  return `ai-usage:job-cost:${safeKeyPart(jobId)}`;
}

function ownerDailyCostKey(safetyIdentifier: string, now = new Date()): string {
  return `ai-usage:owner-day:${now.toISOString().slice(0, 10)}:${safeKeyPart(safetyIdentifier)}`;
}

export function deriveAISafetyIdentifier(rawOwnerId: string): string {
  const normalized = rawOwnerId.trim();
  const secret = process.env.AI_SAFETY_IDENTIFIER_SECRET?.trim();
  const digest = secret
    ? crypto.createHmac('sha256', secret).update(normalized).digest('hex')
    : crypto.createHash('sha256').update(`pawnline-user-v1:${normalized}`).digest('hex');
  // OpenAI safety_identifier accepts at most 64 characters. Preserve the
  // non-PII prefix while retaining 240 bits of the HMAC/hash digest.
  return `usr_${digest.slice(0, MAX_AI_SAFETY_IDENTIFIER_LENGTH - 4)}`;
}

function normalizeSafetyIdentifier(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized
    ? normalized.slice(0, MAX_AI_SAFETY_IDENTIFIER_LENGTH)
    : undefined;
}

export function getAIUsageContext(): Readonly<AIUsageStore> | undefined {
  return storage.getStore();
}

export function getAISafetyIdentifier(): string | undefined {
  return normalizeSafetyIdentifier(storage.getStore()?.safetyIdentifier);
}

/** Queue workers should wrap each job with this export before running a pipeline. */
export function runWithAIUsageContext<T>(
  input: AIUsageContextInput,
  task: () => T
): T {
  const parent = storage.getStore();
  const store: AIUsageStore = {
    jobId: input.jobId || parent?.jobId,
    safetyIdentifier: normalizeSafetyIdentifier(
      input.safetyIdentifier || parent?.safetyIdentifier
    ),
    events: parent?.events || [],
    actualCostUsd: parent?.actualCostUsd || 0,
  };
  return storage.run(store, task);
}

export async function reserveAIBudget(
  estimatedCostUsd: number,
  provider: ProviderName,
  operation: string
): Promise<AIBudgetReservation> {
  const amount = Number.isFinite(estimatedCostUsd) && estimatedCostUsd > 0
    ? estimatedCostUsd
    : 0;
  if (amount === 0) return { reservedCostUsd: 0, settle: async () => undefined };

  const monthlyLimit = positiveNumber(process.env.AI_MONTHLY_BUDGET_USD);
  const jobLimit = positiveNumber(process.env.AI_MAX_JOB_COST_USD);
  const ownerDailyLimit = positiveNumber(process.env.AI_MAX_OWNER_DAILY_COST_USD);
  // Cost ceilings are a production safety boundary, not optional telemetry.
  // Empty/zero limits would silently turn off admission control, so fail before
  // any paid provider request. Staging/local environments may intentionally
  // omit them while exercising mocks or explicitly controlled smoke tests.
  if (
    process.env.NODE_ENV === 'production'
    && (monthlyLimit <= 0 || jobLimit <= 0 || ownerDailyLimit <= 0)
  ) {
    throw new ProviderError('AI production budget limits are not configured', {
      provider,
      kind: 'CONFIGURATION',
      retryable: false,
      operation,
    });
  }
  const redis = getRedis();
  const context = storage.getStore();

  if (!redis) {
    if (monthlyLimit > 0 || jobLimit > 0 || ownerDailyLimit > 0) {
      throw new ProviderError('AI budget guard is unavailable', {
        provider,
        kind: 'BUDGET_EXHAUSTED',
        retryable: false,
        operation,
      });
    }
    return { reservedCostUsd: 0, settle: async () => undefined };
  }

  if (jobLimit > 0 && !context?.jobId && amount > jobLimit) {
    throw new ProviderError('AI request exceeds the per-job budget', {
      provider,
      kind: 'BUDGET_EXHAUSTED',
      retryable: false,
      operation,
    });
  }

  const keys = [monthKey()];
  if (context?.jobId) keys.push(jobCostKey(context.jobId));
  const ownerKey = context?.safetyIdentifier
    ? ownerDailyCostKey(context.safetyIdentifier)
    : null;
  let ownerReserved = false;
  if (ownerKey && ownerDailyLimit > 0) {
    try {
      const ownerResult = Number(await redis.eval<[string, string, string], number>(
        RESERVE_OWNER_SCRIPT,
        [ownerKey],
        [String(amount), String(ownerDailyLimit), String(2 * 24 * 60 * 60)],
      ));
      if (ownerResult !== 1) {
        throw new ProviderError('AI owner daily budget limit reached', {
          provider,
          kind: 'BUDGET_EXHAUSTED',
          retryable: false,
          operation,
        });
      }
      ownerReserved = true;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('AI budget guard is unavailable', {
        provider,
        kind: 'BUDGET_EXHAUSTED',
        retryable: false,
        operation,
      });
    }
  }
  let result: number;
  try {
    result = Number(await redis.eval(
      RESERVE_SCRIPT,
      keys,
      [String(amount), String(monthlyLimit), String(jobLimit), String(MONTH_TTL_SECONDS)]
    ));
  } catch {
    if (ownerReserved && ownerKey) {
      await redis.eval<[string, string], number>(
        SETTLE_ONE_SCRIPT,
        [ownerKey],
        [String(-amount), String(2 * 24 * 60 * 60)],
      ).catch(() => undefined);
    }
    throw new ProviderError('AI budget guard is unavailable', {
      provider,
      kind: 'BUDGET_EXHAUSTED',
      retryable: false,
      operation,
    });
  }
  if (result !== 1) {
    if (ownerReserved && ownerKey) {
      await redis.eval<[string, string], number>(
        SETTLE_ONE_SCRIPT,
        [ownerKey],
        [String(-amount), String(2 * 24 * 60 * 60)],
      ).catch(() => undefined);
    }
    throw new ProviderError('AI budget limit reached', {
      provider,
      kind: 'BUDGET_EXHAUSTED',
      retryable: false,
      operation,
    });
  }

  let settled = false;
  return {
    reservedCostUsd: amount,
    settle: async (actualCostUsd: number) => {
      if (settled) return;
      settled = true;
      const actual = Number.isFinite(actualCostUsd) && actualCostUsd > 0 ? actualCostUsd : 0;
      const delta = actual - amount;
      try {
        await Promise.all([
          redis.eval(
            SETTLE_SCRIPT,
            keys,
            [String(delta), String(MONTH_TTL_SECONDS)]
          ),
          ownerReserved && ownerKey
            ? redis.eval<[string, string], number>(
                SETTLE_ONE_SCRIPT,
                [ownerKey],
                [String(delta), String(2 * 24 * 60 * 60)],
              )
            : Promise.resolve(1),
        ]);
      } catch {
        // Keeping the conservative reservation is safer than undercounting.
      }
    },
  };
}

export async function recordAIUsageEvent(event: AIUsageEvent): Promise<void> {
  const safeEvent: AIUsageEvent & { timestamp: string } = {
    ...event,
    costUsd: Number.isFinite(event.costUsd) ? Math.max(0, event.costUsd) : 0,
    latencyMs: Number.isFinite(event.latencyMs) ? Math.max(0, Math.round(event.latencyMs)) : 0,
    timestamp: new Date().toISOString(),
  };
  const context = storage.getStore();
  if (context) {
    context.events.push(safeEvent);
    context.actualCostUsd += safeEvent.costUsd;
  }

  const redis = getRedis();
  if (!redis) return;
  const day = safeEvent.timestamp.slice(0, 10);
  const aggregateKey = `ai-usage:day:${day}`;
  const pipeline = redis.pipeline()
    .hincrbyfloat(aggregateKey, 'cost_usd', safeEvent.costUsd)
    .hincrby(aggregateKey, 'calls', 1)
    .hincrby(aggregateKey, `provider:${safeEvent.provider}`, 1)
    .expire(aggregateKey, usageTtlSeconds());
  if (context?.jobId) {
    const eventKey = `ai-usage:job-events:${safeKeyPart(context.jobId)}`;
    pipeline.rpush(eventKey, JSON.stringify(safeEvent)).expire(eventKey, usageTtlSeconds());
  }
  try {
    await pipeline.exec();
  } catch {
    // Usage persistence must not turn a completed provider call into user failure.
  }
}
