import crypto from 'crypto';
import { Redis } from '@upstash/redis';

export type LiffRole = 'PAWNER' | 'INVESTOR' | 'STORE' | 'DROP_POINT' | 'ADMIN';

export interface VerifiedLiffIdentity {
  lineId: string;
  expiresAt: number;
  channelId: string;
}

export class LiffAuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryable = false,
  ) {
    super(code);
    this.name = 'LiffAuthError';
  }
}

interface LineVerifyResponse {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
}

const VERIFY_ENDPOINT = 'https://api.line.me/oauth2/v2.1/verify';
const VERIFY_TIMEOUT_MS = 5_000;
const MAX_TOKEN_LENGTH = 8_192;
const LOCAL_CACHE_LIMIT = 500;

const localCache = new Map<string, VerifiedLiffIdentity>();
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

function liffChannelPrefix(value: string | undefined): string {
  const match = String(value || '').trim().match(/^(\d+)-/);
  return match?.[1] || '';
}

function expectedChannelId(role: LiffRole): string {
  const channelId = role === 'INVESTOR'
    ? String(process.env.LINE_LOGIN_CHANNEL_ID_INVEST || '').trim()
      || liffChannelPrefix(process.env.NEXT_PUBLIC_LIFF_ID_INVEST_REGISTER)
      || liffChannelPrefix(process.env.NEXT_PUBLIC_LIFF_ID_INVEST)
    : role === 'STORE'
      ? String(process.env.LINE_LOGIN_CHANNEL_ID_STORE || '').trim()
        || liffChannelPrefix(process.env.NEXT_PUBLIC_LIFF_ID_STORE)
      : role === 'DROP_POINT'
        ? String(process.env.LINE_LOGIN_CHANNEL_ID_DROPPOINT || '').trim()
          || liffChannelPrefix(process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_PICKUP)
          || liffChannelPrefix(process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_LIST)
          || liffChannelPrefix(process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT)
        : role === 'ADMIN'
          ? String(process.env.LINE_LOGIN_CHANNEL_ID_ADMIN || '').trim()
            || liffChannelPrefix(process.env.NEXT_PUBLIC_LIFF_ID_ADMIN_ESTIMATE)
          : String(process.env.LINE_LOGIN_CHANNEL_ID || '').trim()
            || liffChannelPrefix(process.env.NEXT_PUBLIC_LIFF_ID_REGISTER);

  if (!/^\d{6,20}$/.test(channelId)) {
    throw new LiffAuthError('LIFF_AUTH_CONFIG_MISSING', 503, true);
  }
  return channelId;
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) {
    throw new LiffAuthError('LIFF_AUTH_REQUIRED', 401);
  }
  const token = header.slice(7).trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw new LiffAuthError('LIFF_AUTH_INVALID', 401);
  }
  return token;
}

function cacheKey(role: LiffRole, channelId: string, token: string): string {
  const digest = crypto.createHash('sha256').update(token).digest('hex');
  return `liff:id-token:v1:${role}:${channelId}:${digest}`;
}

function readLocalCache(key: string): VerifiedLiffIdentity | null {
  const cached = localCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now() + 5_000) {
    localCache.delete(key);
    return null;
  }
  return cached;
}

function writeLocalCache(key: string, value: VerifiedLiffIdentity) {
  if (localCache.size >= LOCAL_CACHE_LIMIT) {
    const oldest = localCache.keys().next().value;
    if (oldest) localCache.delete(oldest);
  }
  localCache.set(key, value);
}

async function readRedisCache(key: string): Promise<VerifiedLiffIdentity | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const value = await redis.get<VerifiedLiffIdentity>(key);
    if (
      value
      && typeof value.lineId === 'string'
      && typeof value.expiresAt === 'number'
      && value.expiresAt > Date.now() + 5_000
    ) {
      return value;
    }
  } catch {
    // Authentication remains correct without cache; only latency is affected.
  }
  return null;
}

async function writeRedisCache(key: string, value: VerifiedLiffIdentity) {
  const redis = getRedis();
  if (!redis) return;
  const ttlSeconds = Math.max(1, Math.min(300, Math.floor((value.expiresAt - Date.now()) / 1_000)));
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch {
    // Authentication remains correct without cache; only latency is affected.
  }
}

function audienceMatches(aud: string | string[] | undefined, channelId: string): boolean {
  return Array.isArray(aud) ? aud.includes(channelId) : aud === channelId;
}

async function verifyWithLine(idToken: string, channelId: string): Promise<VerifiedLiffIdentity> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const body = new URLSearchParams({ id_token: idToken, client_id: channelId });
    const response = await fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) {
        throw new LiffAuthError('LIFF_AUTH_PROVIDER_UNAVAILABLE', 503, true);
      }
      throw new LiffAuthError('LIFF_AUTH_INVALID', 401);
    }

    const payload = await response.json() as LineVerifyResponse;
    const expiresAt = Number(payload.exp || 0) * 1_000;
    if (
      payload.iss !== 'https://access.line.me'
      || !audienceMatches(payload.aud, channelId)
      || !payload.sub
      || !/^U[A-Za-z0-9]{20,64}$/.test(payload.sub)
      || expiresAt <= Date.now() + 5_000
    ) {
      throw new LiffAuthError('LIFF_AUTH_INVALID', 401);
    }

    return { lineId: payload.sub, expiresAt, channelId };
  } catch (error) {
    if (error instanceof LiffAuthError) throw error;
    throw new LiffAuthError('LIFF_AUTH_PROVIDER_UNAVAILABLE', 503, true);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verifies a LIFF ID token server-side and returns the LINE subject. Callers
 * must derive ownership from `lineId`; never trust a lineId in request data.
 */
export async function requireLiffIdentity(request: Request, role: LiffRole): Promise<VerifiedLiffIdentity> {
  const channelId = expectedChannelId(role);
  const token = bearerToken(request);
  const key = cacheKey(role, channelId, token);

  const local = readLocalCache(key);
  if (local) return local;

  const cached = await readRedisCache(key);
  if (cached) {
    writeLocalCache(key, cached);
    return cached;
  }

  const verified = await verifyWithLine(token, channelId);
  writeLocalCache(key, verified);
  await writeRedisCache(key, verified);
  return verified;
}
