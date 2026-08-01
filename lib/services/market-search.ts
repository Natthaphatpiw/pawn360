import crypto from 'crypto';
import Parallel from 'parallel-web';
import { Redis } from '@upstash/redis';

import {
  normalizeProviderError,
  ProviderError,
  ProviderErrorKind,
  ProviderName,
} from '@/lib/services/provider-error';
import {
  recordAIUsageEvent,
  reserveAIBudget,
} from '@/lib/services/ai-usage';
import { withProviderCapacity } from '@/lib/services/provider-capacity';

export type MarketSearchProvider = 'parallel' | 'exa';
export type MarketSearchCacheStatus = 'miss' | 'hit' | 'stale_fallback';

export interface MarketSearchRequest {
  objective: string;
  searchQueries: string[];
  /** Canonical product/spec identity. Never include user IDs, serials, or image URLs. */
  cacheKey?: string;
  maxResults?: number;
  maxCharsTotal?: number;
}

export interface MarketSearchItem {
  title: string;
  url: string;
  excerpts: string[];
  publishedDate: string | null;
  provider: MarketSearchProvider;
}

export interface MarketSearchProviderFailure {
  provider: ProviderName;
  kind: ProviderErrorKind;
  retryable: boolean;
  status?: number;
  retryAfterMs?: number;
  requestId?: string;
}

export interface MarketSearchMetadata {
  provider: MarketSearchProvider;
  requestId: string | null;
  latencyMs: number;
  resultCount: number;
  cacheStatus: MarketSearchCacheStatus;
  fallbackUsed: boolean;
  /** Cost incurred by this invocation. Cache hits/stale reads are zero. */
  costUsd: number;
  /** Original provider cost retained on cached records for cost analytics. */
  sourceCostUsd: number;
  warnings: string[];
  providerFailures: MarketSearchProviderFailure[];
}

export interface MarketSearchResponse {
  items: MarketSearchItem[];
  metadata: MarketSearchMetadata;
}

interface CachedMarketSearch {
  version: string;
  freshUntilMs: number;
  response: MarketSearchResponse;
}

const CACHE_VERSION = 'v1';
const CACHE_PREFIX = `market-search:${CACHE_VERSION}`;
const DEFAULT_FRESH_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_STALE_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_PARALLEL_TIMEOUT_MS = 12_000;
const DEFAULT_EXA_TIMEOUT_MS = 30_000;
const DEFAULT_EXA_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_CHARS_TOTAL = 16_000;
const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_EXCERPT_CHARS_PER_RESULT = 2_500;
const DEFAULT_SINGLEFLIGHT_LOCK_MS = 60_000;
const DEFAULT_SINGLEFLIGHT_WAIT_MS = 10_000;
const TRACKING_PARAM_PATTERN = /^(utm_|gclid$|fbclid$|mc_[ce]id$|ref$|ref_|source$)/i;

const RELEASE_SINGLEFLIGHT_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

interface SearchFlightLease {
  key: string;
  token: string;
}

let redisClient: Redis | null | undefined;

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const freshTtlSeconds = () => positiveInt(
  process.env.MARKET_SEARCH_CACHE_TTL_SECONDS,
  DEFAULT_FRESH_TTL_SECONDS
);

const staleTtlSeconds = () => Math.max(
  freshTtlSeconds(),
  positiveInt(process.env.MARKET_SEARCH_STALE_TTL_SECONDS, DEFAULT_STALE_TTL_SECONDS)
);

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
    console.warn('Market search cache initialization failed.');
    redisClient = null;
  }
  return redisClient;
}

const normalizeText = (value: unknown, maxLength: number): string =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

function normalizeUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM_PATTERN.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeItems(
  provider: MarketSearchProvider,
  rawItems: Array<{
    title?: unknown;
    url?: unknown;
    excerpts?: unknown;
    publishedDate?: unknown;
  }>,
  maxResults: number
): MarketSearchItem[] {
  const seen = new Set<string>();
  const items: MarketSearchItem[] = [];
  const excerptLimit = positiveInt(
    process.env.MARKET_SEARCH_MAX_EXCERPT_CHARS_PER_RESULT,
    DEFAULT_EXCERPT_CHARS_PER_RESULT
  );

  for (const raw of rawItems) {
    const url = normalizeUrl(raw.url);
    if (!url || seen.has(url)) continue;
    const title = normalizeText(raw.title, 500);
    if (!title) continue;
    const excerpts = (Array.isArray(raw.excerpts) ? raw.excerpts : [])
      .map((excerpt) => normalizeText(excerpt, excerptLimit))
      .filter(Boolean)
      .slice(0, 4);
    if (excerpts.length === 0) continue;
    seen.add(url);
    items.push({
      title,
      url,
      excerpts,
      publishedDate: raw.publishedDate ? normalizeText(raw.publishedDate, 50) : null,
      provider,
    });
    if (items.length >= maxResults) break;
  }
  return items;
}

function buildCacheKey(request: MarketSearchRequest): string {
  const identity = request.cacheKey?.trim().toLowerCase() || JSON.stringify({
    objective: normalizeText(request.objective, 2_000).toLowerCase(),
    queries: request.searchQueries.map((query) => normalizeText(query, 300).toLowerCase()),
  });
  const digest = crypto.createHash('sha256').update(identity).digest('hex');
  return `${CACHE_PREFIX}:${digest}`;
}

async function readCache(key: string): Promise<CachedMarketSearch | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const cached = await redis.get<CachedMarketSearch>(key);
    if (
      cached?.version === CACHE_VERSION
      && cached.response?.items?.length > 0
      && cached.response?.metadata
    ) {
      return cached;
    }
  } catch {
    console.warn('Market search cache read failed.');
  }
  return null;
}

async function writeCache(key: string, response: MarketSearchResponse): Promise<void> {
  const redis = getRedis();
  if (!redis || response.items.length === 0) return;
  const record: CachedMarketSearch = {
    version: CACHE_VERSION,
    freshUntilMs: Date.now() + freshTtlSeconds() * 1000,
    response,
  };
  try {
    await redis.set(key, record, { ex: staleTtlSeconds() });
  } catch {
    console.warn('Market search cache write failed.');
  }
}

function singleflightLockMs(): number {
  return Math.max(
    15_000,
    Math.min(
      120_000,
      positiveInt(process.env.MARKET_SEARCH_SINGLEFLIGHT_LOCK_MS, DEFAULT_SINGLEFLIGHT_LOCK_MS),
    ),
  );
}

async function acquireSearchFlight(cacheKey: string): Promise<SearchFlightLease | null | undefined> {
  const redis = getRedis();
  if (!redis) return undefined;
  const key = `${cacheKey}:flight`;
  const token = crypto.randomUUID();
  try {
    const acquired = await redis.set(key, token, { nx: true, px: singleflightLockMs() });
    return acquired === 'OK' ? { key, token } : null;
  } catch {
    console.warn('Market search single-flight acquisition failed.');
    return undefined;
  }
}

async function releaseSearchFlight(lease: SearchFlightLease | undefined): Promise<void> {
  if (!lease) return;
  const redis = getRedis();
  if (!redis) return;
  await redis.eval<[string], number>(
    RELEASE_SINGLEFLIGHT_SCRIPT,
    [lease.key],
    [lease.token],
  ).catch(() => undefined);
}

async function waitForSearchFlight(cacheKey: string): Promise<{
  cached?: CachedMarketSearch;
  lease?: SearchFlightLease;
}> {
  const waitMs = Math.max(
    1_000,
    Math.min(
      30_000,
      positiveInt(process.env.MARKET_SEARCH_SINGLEFLIGHT_WAIT_MS, DEFAULT_SINGLEFLIGHT_WAIT_MS),
    ),
  );
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const cached = await readCache(cacheKey);
    if (cached && cached.freshUntilMs > Date.now()) return { cached };
    const lease = await acquireSearchFlight(cacheKey);
    if (lease) return { lease };
    if (lease === undefined) return {};
    const delayMs = Math.min(deadline - Date.now(), 250 + Math.floor(Math.random() * 500));
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return {};
}

function cachedResponse(
  cached: CachedMarketSearch,
  cacheStatus: 'hit' | 'stale_fallback',
  failures: MarketSearchProviderFailure[] = []
): MarketSearchResponse {
  return {
    items: cached.response.items,
    metadata: {
      ...cached.response.metadata,
      cacheStatus,
      latencyMs: 0,
      costUsd: 0,
      fallbackUsed: cached.response.metadata.fallbackUsed || failures.length > 0,
      providerFailures: failures,
    },
  };
}

function publicFailure(error: ProviderError): MarketSearchProviderFailure {
  return {
    provider: error.provider,
    kind: error.kind,
    retryable: error.retryable,
    status: error.status,
    retryAfterMs: error.retryAfterMs,
    requestId: error.requestId,
  };
}

async function readBoundedExaJson(response: Response): Promise<any> {
  const maxBytes = Math.min(
    8 * 1024 * 1024,
    positiveInt(process.env.EXA_SEARCH_MAX_RESPONSE_BYTES, DEFAULT_EXA_MAX_RESPONSE_BYTES),
  );
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderError('Exa response exceeded the size limit', {
      provider: 'exa',
      kind: 'INVALID_RESPONSE',
      retryable: true,
      status: response.status,
      operation: 'market_search',
    });
  }
  if (!response.body) {
    throw new ProviderError('Exa returned an empty response', {
      provider: 'exa',
      kind: 'INVALID_RESPONSE',
      retryable: true,
      status: response.status,
      operation: 'market_search',
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ProviderError('Exa response exceeded the size limit', {
          provider: 'exa',
          kind: 'INVALID_RESPONSE',
          retryable: true,
          status: response.status,
          operation: 'market_search',
        });
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(body);
  } catch (cause) {
    throw new ProviderError('Exa returned invalid JSON', {
      provider: 'exa',
      kind: 'INVALID_RESPONSE',
      retryable: true,
      status: response.status,
      operation: 'market_search',
      cause,
    });
  }
}

function parallelMode(): 'turbo' | 'basic' | 'advanced' {
  const configured = process.env.PARALLEL_SEARCH_MODE?.trim().toLowerCase();
  if (configured === 'turbo' || configured === 'advanced') return configured;
  // Basic, not turbo. Turbo is a fifth of the price but measured against live
  // Thai queries it returns off-model pages - a search for "iPhone 14 Pro
  // 256GB" came back with 15/16/17 Pro price-index articles - which the
  // exact-model gate then correctly rejects, starving the estimate and failing
  // the whole job. The ~USD 0.004 saved per cache miss is not worth sending a
  // pawner to manual valuation.
  return 'basic';
}

async function searchParallel(request: MarketSearchRequest): Promise<MarketSearchResponse> {
  const apiKey = process.env.PARALLEL_API_KEY;
  if (!apiKey) {
    throw new ProviderError('Parallel search is not configured', {
      provider: 'parallel',
      kind: 'CONFIGURATION',
      retryable: false,
      operation: 'market_search',
    });
  }

  const timeoutMs = positiveInt(process.env.PARALLEL_SEARCH_TIMEOUT_MS, DEFAULT_PARALLEL_TIMEOUT_MS);
  const mode = parallelMode();
  const maxResults = Math.min(
    request.maxResults || DEFAULT_MAX_RESULTS,
    positiveInt(process.env.PARALLEL_SEARCH_MAX_RESULTS, DEFAULT_MAX_RESULTS),
  );
  const client = new Parallel({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  const startedAt = Date.now();
  const estimatedCostUsd = mode === 'turbo' ? 0.001 : 0.005;
  const reservation = await reserveAIBudget(estimatedCostUsd, 'parallel', 'market_search');
  // A provider request is billable once it returns, even if every returned
  // result is later rejected by our normalization/quality gate.
  let chargedCostUsd = 0;

  try {
    // Once dispatched, a timeout/transport failure may still be billable.
    // Reserve the conservative request price and replace it only when the
    // provider supplies a more authoritative amount.
    const result = await withProviderCapacity(
      {
        provider: 'parallel',
        model: mode,
        operation: 'market_search',
        leaseMs: timeoutMs + 15_000,
      },
      () => {
        chargedCostUsd = estimatedCostUsd;
        return client.search({
          objective: normalizeText(request.objective, 3_000),
          search_queries: request.searchQueries
            .map((query) => normalizeText(query, 300))
            .filter(Boolean)
            .slice(0, 3),
          max_chars_total: request.maxCharsTotal || DEFAULT_MAX_CHARS_TOTAL,
          mode,
          client_model: 'gpt-5.6-terra',
          advanced_settings: {
            max_results: maxResults,
            excerpt_settings: {
              max_chars_per_result: positiveInt(
                process.env.MARKET_SEARCH_MAX_EXCERPT_CHARS_PER_RESULT,
                DEFAULT_EXCERPT_CHARS_PER_RESULT
              ),
            },
            fetch_policy: {
              max_age_seconds: 24 * 60 * 60,
              timeout_seconds: Math.max(1, Math.floor(timeoutMs / 1000)),
              disable_cache_fallback: false,
            },
          },
        }, { timeout: timeoutMs });
      },
    );
    const items = normalizeItems('parallel', result.results.map((item) => ({
      title: item.title,
      url: item.url,
      excerpts: item.excerpts,
      publishedDate: item.publish_date,
    })), maxResults);
    if (items.length === 0) {
      throw new ProviderError('Parallel returned no usable search results', {
        provider: 'parallel',
        kind: 'EMPTY_RESULT',
        retryable: false,
        requestId: result.search_id,
        operation: 'market_search',
      });
    }
    const costUsd = estimatedCostUsd;
    await reservation.settle(costUsd);
    await recordAIUsageEvent({
      provider: 'parallel',
      operation: 'market_search',
      model: mode,
      costUsd,
      latencyMs: Date.now() - startedAt,
      cacheStatus: 'miss',
      fallbackUsed: false,
      success: true,
    });
    return {
      items,
      metadata: {
        provider: 'parallel',
        requestId: result.search_id || null,
        latencyMs: Date.now() - startedAt,
        resultCount: items.length,
        cacheStatus: 'miss',
        fallbackUsed: false,
        costUsd,
        sourceCostUsd: costUsd,
        warnings: (result.warnings || []).map((warning) => normalizeText(
          (warning as any)?.message || (warning as any)?.type || warning,
          300
        )),
        providerFailures: [],
      },
    };
  } catch (error) {
    await reservation.settle(chargedCostUsd);
    const failure = normalizeProviderError('parallel', error, 'market_search');
    await recordAIUsageEvent({
      provider: 'parallel',
      operation: 'market_search',
      model: mode,
      costUsd: chargedCostUsd,
      latencyMs: Date.now() - startedAt,
      cacheStatus: 'miss',
      fallbackUsed: false,
      success: false,
      errorKind: failure.kind,
    });
    throw failure;
  }
}

async function searchExa(request: MarketSearchRequest): Promise<MarketSearchResponse> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new ProviderError('Exa search is not configured', {
      provider: 'exa',
      kind: 'CONFIGURATION',
      retryable: false,
      operation: 'market_search',
    });
  }

  const timeoutMs = positiveInt(process.env.EXA_SEARCH_TIMEOUT_MS, DEFAULT_EXA_TIMEOUT_MS);
  const maxResults = Math.min(
    request.maxResults || DEFAULT_MAX_RESULTS,
    positiveInt(process.env.EXA_SEARCH_MAX_RESULTS, 5),
  );
  const startedAt = Date.now();
  const query = request.searchQueries
    .map((value) => normalizeText(value, 300))
    .filter(Boolean)
    .slice(0, 3)
    .join(' OR ');

  const reservation = await reserveAIBudget(0.02, 'exa', 'market_search');
  let chargedCostUsd = 0;
  try {
    const result = await withProviderCapacity(
      {
        provider: 'exa',
        model: 'instant',
        operation: 'market_search',
        leaseMs: timeoutMs + 15_000,
      },
      async () => {
        chargedCostUsd = 0.007;
        const response = await fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: query || request.objective,
            type: 'instant',
            numResults: maxResults,
            userLocation: 'TH',
            systemPrompt: normalizeText(request.objective, 3_000),
            contents: {
              highlights: {
                query: normalizeText(request.objective, 1_000),
                maxCharacters: positiveInt(
                  process.env.MARKET_SEARCH_MAX_EXCERPT_CHARS_PER_RESULT,
                  DEFAULT_EXCERPT_CHARS_PER_RESULT
                ),
              },
              maxAgeHours: 24,
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
          cache: 'no-store',
          redirect: 'error',
        });
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          throw normalizeProviderError('exa', {
            status: response.status,
            headers: response.headers,
          }, 'market_search');
        }
        const data = await readBoundedExaJson(response);
        if (
          !data
          || typeof data !== 'object'
          || !Array.isArray(data.results)
          || typeof data.requestId !== 'string'
          || data.requestId.length === 0
          || (data.costDollars?.total !== undefined
            && (!Number.isFinite(data.costDollars.total) || data.costDollars.total < 0))
        ) {
          throw new ProviderError('Exa returned a malformed success response', {
            provider: 'exa',
            kind: 'INVALID_RESPONSE',
            retryable: false,
            status: response.status,
            operation: 'market_search',
          });
        }
        return data;
      },
    );
    chargedCostUsd = Number(result.costDollars?.total || 0.007);
    const items = normalizeItems('exa', (result.results as unknown[]).map((entry) => {
      const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
      return {
        title: item.title,
        url: item.url,
        excerpts: item.highlights,
        publishedDate: item.publishedDate,
      };
    }), maxResults);
    if (items.length === 0) {
      throw new ProviderError('Exa returned no usable search results', {
        provider: 'exa',
        kind: 'EMPTY_RESULT',
        retryable: false,
        requestId: result.requestId,
        operation: 'market_search',
      });
    }
    const costUsd = chargedCostUsd;
    await reservation.settle(costUsd);
    await recordAIUsageEvent({
      provider: 'exa',
      operation: 'market_search',
      model: 'instant',
      costUsd,
      latencyMs: Date.now() - startedAt,
      cacheStatus: 'miss',
      fallbackUsed: true,
      success: true,
    });
    return {
      items,
      metadata: {
        provider: 'exa',
        requestId: result.requestId || null,
        latencyMs: Date.now() - startedAt,
        resultCount: items.length,
        cacheStatus: 'miss',
        fallbackUsed: true,
        costUsd,
        sourceCostUsd: costUsd,
        warnings: [],
        providerFailures: [],
      },
    };
  } catch (error) {
    await reservation.settle(chargedCostUsd);
    const failure = normalizeProviderError('exa', error, 'market_search');
    await recordAIUsageEvent({
      provider: 'exa',
      operation: 'market_search',
      model: 'instant',
      costUsd: chargedCostUsd,
      latencyMs: Date.now() - startedAt,
      cacheStatus: 'miss',
      fallbackUsed: true,
      success: false,
      errorKind: failure.kind,
    });
    throw failure;
  }
}

/**
 * Search order: fresh cache -> Parallel -> Exa -> stale cache.
 * Provider failures are normalized and returned as metadata when a fallback succeeds.
 */
export async function searchMarket(request: MarketSearchRequest): Promise<MarketSearchResponse> {
  const searchQueries = request.searchQueries.filter((query) => query.trim()).slice(0, 3);
  if (!request.objective.trim() || searchQueries.length === 0) {
    throw new ProviderError('Market search request is invalid', {
      provider: 'unknown',
      kind: 'INVALID_REQUEST',
      retryable: false,
      operation: 'market_search',
    });
  }

  const normalizedRequest = { ...request, searchQueries };
  const cacheKey = buildCacheKey(normalizedRequest);
  const cached = await readCache(cacheKey);
  if (cached && cached.freshUntilMs > Date.now()) {
    const response = cachedResponse(cached, 'hit');
    await recordAIUsageEvent({
      provider: response.metadata.provider,
      operation: 'market_search',
      model: 'cache',
      costUsd: 0,
      latencyMs: 0,
      cacheStatus: 'hit',
      fallbackUsed: response.metadata.fallbackUsed,
      success: true,
    });
    return response;
  }

  let flight = await acquireSearchFlight(cacheKey);
  if (flight === null) {
    const waited = await waitForSearchFlight(cacheKey);
    if (waited.cached) {
      const response = cachedResponse(waited.cached, 'hit');
      await recordAIUsageEvent({
        provider: response.metadata.provider,
        operation: 'market_search',
        model: 'singleflight_cache',
        costUsd: 0,
        latencyMs: 0,
        cacheStatus: 'hit',
        fallbackUsed: response.metadata.fallbackUsed,
        success: true,
      });
      return response;
    }
    flight = waited.lease;
    if (!flight) {
      if (cached) {
        const response = cachedResponse(cached, 'stale_fallback');
        await recordAIUsageEvent({
          provider: response.metadata.provider,
          operation: 'market_search',
          model: 'singleflight_stale_cache',
          costUsd: 0,
          latencyMs: 0,
          cacheStatus: 'stale_fallback',
          fallbackUsed: true,
          success: true,
        });
        return response;
      }
      throw new ProviderError('An identical market search is already in progress', {
        provider: 'unknown',
        kind: 'RATE_LIMITED',
        retryable: true,
        retryAfterMs: 5_000,
        operation: 'market_search',
      });
    }
  }

  // Close the race between the first cache read and lock acquisition.
  if (flight) {
    const racedCache = await readCache(cacheKey);
    if (racedCache && racedCache.freshUntilMs > Date.now()) {
      await releaseSearchFlight(flight);
      flight = undefined;
      const response = cachedResponse(racedCache, 'hit');
      await recordAIUsageEvent({
        provider: response.metadata.provider,
        operation: 'market_search',
        model: 'singleflight_cache',
        costUsd: 0,
        latencyMs: 0,
        cacheStatus: 'hit',
        fallbackUsed: response.metadata.fallbackUsed,
        success: true,
      });
      return response;
    }
  }

  try {
    const failures: MarketSearchProviderFailure[] = [];
    try {
      const response = await searchParallel(normalizedRequest);
      await writeCache(cacheKey, response);
      console.log('Market search usage:', response.metadata);
      return response;
    } catch (error) {
      const normalized = normalizeProviderError('parallel', error, 'market_search');
      failures.push(publicFailure(normalized));
      console.warn('Parallel market search failed; trying Exa:', publicFailure(normalized));
    }

    try {
      const response = await searchExa(normalizedRequest);
      response.metadata.providerFailures = failures;
      await writeCache(cacheKey, response);
      console.log('Market search usage:', response.metadata);
      return response;
    } catch (error) {
      const normalized = normalizeProviderError('exa', error, 'market_search');
      failures.push(publicFailure(normalized));
      console.warn('Exa market search failed:', publicFailure(normalized));
    }

    if (cached) {
      const response = cachedResponse(cached, 'stale_fallback', failures);
      await recordAIUsageEvent({
        provider: response.metadata.provider,
        operation: 'market_search',
        model: 'cache',
        costUsd: 0,
        latencyMs: 0,
        cacheStatus: 'stale_fallback',
        fallbackUsed: true,
        success: true,
      });
      console.warn('Market search is using stale cache:', response.metadata);
      return response;
    }

    const retryable = failures.some((failure) => failure.retryable);
    const retryAfterMs = failures
      .map((failure) => failure.retryAfterMs)
      .filter((value): value is number => typeof value === 'number')
      .sort((a, b) => b - a)[0];
    const terminalKind: ProviderErrorKind = failures.every(
      (failure) => failure.kind === 'CONFIGURATION'
    )
      ? 'CONFIGURATION'
      : failures.some((failure) => failure.kind === 'BUDGET_EXHAUSTED')
        ? 'BUDGET_EXHAUSTED'
        : failures.some((failure) => failure.kind === 'AUTHENTICATION')
          ? 'AUTHENTICATION'
          : retryable
            ? 'UPSTREAM_UNAVAILABLE'
            : 'EMPTY_RESULT';
    throw new ProviderError('All market search providers failed', {
      provider: 'unknown',
      kind: terminalKind,
      retryable: terminalKind === 'UPSTREAM_UNAVAILABLE',
      retryAfterMs,
      operation: 'market_search',
    });
  } finally {
    await releaseSearchFlight(flight);
  }
}
