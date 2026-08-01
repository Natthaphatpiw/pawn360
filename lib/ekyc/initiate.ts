import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import { getActorDatabaseConfig, getUpPassRuntimeConfig, validateUpPassFormUrl } from '@/lib/ekyc/config';
import { EkycActorType, EkycDatabaseStatus, EkycPublicError } from '@/lib/ekyc/types';
import { hasKycSubmissionCompleted, isKycNeedReview } from '@/lib/kyc/review';
import { requireLiffIdentity, LiffAuthError } from '@/lib/security/liff-auth';
import { supabaseAdmin } from '@/lib/supabase/client';

const PROVIDER_RESPONSE_LIMIT = 100_000;
const REDIS_WINDOW_SECONDS = 15 * 60;
const REDIS_WINDOW_LIMIT = 3;
const DAILY_ATTEMPT_LIMIT = 5;
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;
const PROVIDER_LEASE_ACQUIRE_SCRIPT = `
local now = tonumber(ARGV[1])
local expiresAt = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= limit then
  return 0
end
redis.call('ZADD', KEYS[1], expiresAt, ARGV[4])
redis.call('EXPIRE', KEYS[1], math.ceil((expiresAt - now) / 1000) + 60)
return 1
`;
const PROVIDER_LEASE_RELEASE_SCRIPT = `
return redis.call('ZREM', KEYS[1], ARGV[1])
`;

interface ActorRecord {
  id: string;
  firstname: string | null;
  lastname: string | null;
  national_id: string | null;
  kyc_status: EkycDatabaseStatus;
  uppass_slug: string | null;
  ekyc_url: string | null;
  kyc_data: unknown;
  updated_at: string | null;
}

interface AttemptRecord {
  id: string;
  status: 'CREATING' | 'ACTIVE' | 'RECOVERY_REQUIRED';
  uppass_slug: string | null;
  provider_form_url: string | null;
  provider_request_started_at: string | null;
  provider_request_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ReservedAttempt {
  id: string;
  requestKey: string;
}

class UpPassCreateError extends EkycPublicError {
  constructor(
    code: string,
    status: number,
    publicMessage: string,
    retryable: boolean,
    retryAfterSeconds: number | undefined,
    public readonly ambiguous: boolean,
  ) {
    super(code, status, publicMessage, retryable, retryAfterSeconds);
    this.name = 'UpPassCreateError';
  }
}

let redisClient: Redis | null | undefined;

function positiveIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function providerTimeoutMs(): number {
  return positiveIntegerEnv('UPPASS_REQUEST_TIMEOUT_MS', 12_000, 3_000, 60_000);
}

function creatingStaleMs(): number {
  return Math.max(2 * 60_000, providerTimeoutMs() * 3);
}

function limiterNamespace(): string {
  const identity = [
    process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME || 'pawnline',
    process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  ].join(':');
  return crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16);
}

function productionRuntime(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
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

async function acquireUpPassProviderLease(): Promise<() => Promise<void>> {
  const redis = getRedis();
  if (!redis) {
    if (productionRuntime()) {
      throw new EkycPublicError(
        'EKYC_ADMISSION_UNAVAILABLE',
        503,
        'ระบบจัดคิวการยืนยันตัวตนไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง',
        true,
        30,
      );
    }
    return async () => undefined;
  }

  const namespace = limiterNamespace();
  const leaseKey = `ekyc:uppass:v1:${namespace}:leases`;
  const rateKey = `ekyc:uppass:v1:${namespace}:rate`;
  const token = crypto.randomUUID();
  const now = Date.now();
  const leaseMs = providerTimeoutMs() + 15_000;
  const concurrencyLimit = positiveIntegerEnv('UPPASS_GLOBAL_CONCURRENCY_LIMIT', 4, 1, 100);
  const windowSeconds = positiveIntegerEnv('UPPASS_GLOBAL_WINDOW_SECONDS', 60, 1, 3_600);
  const requestLimit = positiveIntegerEnv('UPPASS_GLOBAL_REQUEST_LIMIT', 30, 1, 10_000);
  let acquired = false;

  const release = async () => {
    if (!acquired) return;
    acquired = false;
    try {
      await redis.eval<[string], number>(PROVIDER_LEASE_RELEASE_SCRIPT, [leaseKey], [token]);
    } catch {
      // The lease has a bounded expiry; never expose Redis details to users.
      console.error('UpPass provider concurrency lease release failed', { code: 'REDIS_RELEASE_FAILED' });
    }
  };

  try {
    const leaseResult = await redis.eval<[string, string, string, string], number>(
      PROVIDER_LEASE_ACQUIRE_SCRIPT,
      [leaseKey],
      [String(now), String(now + leaseMs), String(concurrencyLimit), token],
    );
    if (Number(leaseResult) !== 1) {
      throw new EkycPublicError(
        'EKYC_PROVIDER_CAPACITY_WAIT',
        429,
        'ขณะนี้มีผู้ยืนยันตัวตนจำนวนมาก กรุณารอสักครู่แล้วลองใหม่',
        true,
        5,
      );
    }
    acquired = true;

    const count = await redis.eval<[string], number>(
      RATE_LIMIT_SCRIPT,
      [rateKey],
      [String(windowSeconds)],
    );
    if (Number(count) > requestLimit) {
      await release();
      throw new EkycPublicError(
        'EKYC_PROVIDER_RATE_BUDGET_WAIT',
        429,
        'ผู้ให้บริการยืนยันตัวตนถึงขีดจำกัดชั่วคราว กรุณารอแล้วลองใหม่',
        true,
        windowSeconds,
      );
    }
    return release;
  } catch (error) {
    await release();
    if (error instanceof EkycPublicError) throw error;
    if (productionRuntime()) {
      throw new EkycPublicError(
        'EKYC_ADMISSION_UNAVAILABLE',
        503,
        'ระบบจัดคิวการยืนยันตัวตนไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง',
        true,
        30,
      );
    }
    return async () => undefined;
  }
}

function noStoreJson(body: unknown, status = 200, retryAfterSeconds?: number) {
  const headers = new Headers({
    'Cache-Control': 'no-store, private, max-age=0',
    Pragma: 'no-cache',
  });
  if (retryAfterSeconds) headers.set('Retry-After', String(retryAfterSeconds));
  return NextResponse.json(body, { status, headers });
}

export function ekycErrorResponse(error: unknown) {
  if (error instanceof EkycPublicError) {
    return noStoreJson({
      success: false,
      error: error.publicMessage,
      code: error.code,
      retryable: error.retryable,
      ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    }, error.status, error.retryAfterSeconds);
  }
  if (error instanceof LiffAuthError) {
    const message = error.status === 503
      ? 'ไม่สามารถตรวจสอบบัญชี LINE ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง'
      : 'กรุณาเปิดหน้านี้ผ่าน LINE และเข้าสู่ระบบอีกครั้ง';
    return noStoreJson({
      success: false,
      error: message,
      code: error.code,
      retryable: error.retryable,
    }, error.status, error.retryable ? 30 : undefined);
  }
  return noStoreJson({
    success: false,
    error: 'เกิดข้อผิดพลาดในการเริ่มยืนยันตัวตน กรุณาลองใหม่อีกครั้ง',
    code: 'EKYC_INTERNAL_ERROR',
    retryable: true,
    retryAfterSeconds: 30,
  }, 500, 30);
}

function actorSelect(idColumn: string): string {
  return `${idColumn}, firstname, lastname, national_id, kyc_status, uppass_slug, ekyc_url, kyc_data, updated_at`;
}

function normalizeActor(data: Record<string, unknown>, idColumn: string): ActorRecord {
  const kycStatus = String(data.kyc_status || 'NOT_VERIFIED');
  if (!['NOT_VERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'].includes(kycStatus)) {
    throw new EkycPublicError('EKYC_ACCOUNT_STATUS_INVALID', 503, 'ข้อมูลสถานะยืนยันตัวตนไม่สมบูรณ์ กรุณาติดต่อฝ่ายสนับสนุน');
  }
  return {
    id: String(data[idColumn] || ''),
    firstname: typeof data.firstname === 'string' ? data.firstname : null,
    lastname: typeof data.lastname === 'string' ? data.lastname : null,
    national_id: typeof data.national_id === 'string' ? data.national_id : null,
    kyc_status: kycStatus as EkycDatabaseStatus,
    uppass_slug: typeof data.uppass_slug === 'string' ? data.uppass_slug : null,
    ekyc_url: typeof data.ekyc_url === 'string' ? data.ekyc_url : null,
    kyc_data: data.kyc_data,
    updated_at: typeof data.updated_at === 'string' ? data.updated_at : null,
  };
}

async function enforceAdmissionControl(actorType: EkycActorType, actorId: string, lineId: string) {
  const redis = getRedis();
  if (redis) {
    const subjectHash = crypto.createHash('sha256').update(lineId).digest('hex');
    const key = `ekyc:initiate:v1:${limiterNamespace()}:${actorType}:${subjectHash}`;
    try {
      const count = await redis.eval<[string], number>(
        RATE_LIMIT_SCRIPT,
        [key],
        [String(REDIS_WINDOW_SECONDS)],
      );
      if (count > REDIS_WINDOW_LIMIT) {
        throw new EkycPublicError(
          'EKYC_RATE_LIMITED',
          429,
          'เริ่มการยืนยันตัวตนถี่เกินไป กรุณารอสักครู่แล้วลองใหม่',
          true,
          REDIS_WINDOW_SECONDS,
        );
      }
    } catch (error) {
      if (error instanceof EkycPublicError) throw error;
      // Fall through to the durable DB-based limit if Redis is unavailable.
    }
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin()
    .from('ekyc_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('actor_type', actorType)
    .eq('actor_id', actorId)
    .gte('created_at', since);

  if (error) throw new EkycPublicError('EKYC_ATTEMPT_STORE_UNAVAILABLE', 503, 'ระบบยืนยันตัวตนไม่พร้อมใช้งานชั่วคราว', true, 30);
  if ((count || 0) >= DAILY_ATTEMPT_LIMIT) {
    throw new EkycPublicError(
      'EKYC_DAILY_LIMIT_REACHED',
      429,
      'ครบจำนวนครั้งที่เริ่มยืนยันตัวตนในวันนี้ กรุณาลองใหม่ภายหลังหรือติดต่อฝ่ายสนับสนุน',
      false,
      60 * 60,
    );
  }
}

async function reserveAttempt(actorType: EkycActorType, actorId: string): Promise<ReservedAttempt> {
  const supabase = supabaseAdmin();
  const requestKey = crypto
    .createHash('sha256')
    .update(`${actorType}:${actorId}:${crypto.randomUUID()}`)
    .digest('hex');
  const { data, error } = await supabase
    .from('ekyc_attempts')
    .insert({
      actor_type: actorType,
      actor_id: actorId,
      status: 'CREATING',
      provider_request_key: requestKey,
    })
    .select('id')
    .single();

  if (error?.code === '23505') {
    throw new EkycPublicError(
      'EKYC_SESSION_CREATING',
      429,
      'ระบบกำลังสร้างรายการยืนยันตัวตน กรุณารอสักครู่',
      true,
      3,
    );
  }
  if (error || !data?.id) {
    throw new EkycPublicError('EKYC_ATTEMPT_STORE_UNAVAILABLE', 503, 'ระบบยืนยันตัวตนไม่พร้อมใช้งานชั่วคราว', true, 30);
  }
  return { id: String(data.id), requestKey };
}

async function updateAttemptStrict(
  attemptId: string,
  values: Record<string, unknown>,
  expectedStatuses?: string[],
): Promise<void> {
  let update = supabaseAdmin()
    .from('ekyc_attempts')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', attemptId);
  if (expectedStatuses?.length) update = update.in('status', expectedStatuses);
  const { data, error } = await update.select('id').maybeSingle();
  if (error || !data) {
    throw new EkycPublicError(
      'EKYC_ATTEMPT_STORE_UNAVAILABLE',
      503,
      'ระบบยืนยันตัวตนไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่',
      true,
      30,
    );
  }
}

async function updateAttemptBestEffort(
  attemptId: string,
  values: Record<string, unknown>,
  expectedStatuses?: string[],
) {
  try {
    await updateAttemptStrict(attemptId, values, expectedStatuses);
  } catch {
    // Never include provider responses, form URLs, identity values, or Redis
    // details in logs. A stale CREATING row with request_started_at is itself
    // quarantined by recovery and will not trigger a duplicate provider call.
    console.error('eKYC attempt ledger update failed', { code: 'ATTEMPT_UPDATE_FAILED' });
  }
}

function createEndpoint(base: URL, formSlug: string): URL {
  const endpoint = new URL(base.toString());
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/th/api/forms/${encodeURIComponent(formSlug)}/create/`;
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint;
}

function parseRetryAfter(value: string | null): number {
  const seconds = Number.parseInt(value || '', 10);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3_600) : 30;
}

async function readProviderResponse(response: Response): Promise<string> {
  const advertisedSize = Number.parseInt(response.headers.get('content-length') || '0', 10);
  if (Number.isFinite(advertisedSize) && advertisedSize > PROVIDER_RESPONSE_LIMIT) {
    throw new UpPassCreateError(
      'EKYC_PROVIDER_RESPONSE_TOO_LARGE',
      502,
      'ผู้ให้บริการยืนยันตัวตนตอบกลับไม่สมบูรณ์',
      false,
      undefined,
      true,
    );
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > PROVIDER_RESPONSE_LIMIT) {
      await reader.cancel().catch(() => undefined);
      throw new UpPassCreateError(
        'EKYC_PROVIDER_RESPONSE_TOO_LARGE',
        502,
        'ผู้ให้บริการยืนยันตัวตนตอบกลับไม่สมบูรณ์',
        false,
        undefined,
        true,
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function createUpPassSession(actorType: EkycActorType, actor: ActorRecord, attemptId: string) {
  const config = getUpPassRuntimeConfig(actorType);
  const releaseLease = await acquireUpPassProviderLease();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), providerTimeoutMs());
  let requestMayHaveLeft = false;
  try {
    await updateAttemptStrict(attemptId, {
      provider_request_started_at: new Date().toISOString(),
      last_error_code: null,
    }, ['CREATING']);
    requestMayHaveLeft = true;
    const response = await fetch(createEndpoint(config.apiBaseUrl, config.formSlug), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        answers: {
          ...(actor.firstname && { th_first_name: actor.firstname }),
          ...(actor.lastname && { th_last_name: actor.lastname }),
          ...(actor.national_id && { id_card_number: actor.national_id }),
        },
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });

    if (!response.ok) {
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
      console.warn('UpPass session creation failed', { actorType, status: response.status });
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 429) {
        throw new UpPassCreateError(
          'EKYC_PROVIDER_RATE_LIMITED',
          503,
          'ผู้ให้บริการยืนยันตัวตนมีผู้ใช้งานจำนวนมาก กรุณารอสักครู่แล้วลองใหม่',
          true,
          retryAfter,
          false,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new UpPassCreateError(
          'EKYC_PROVIDER_AUTH_FAILED',
          503,
          'ระบบยืนยันตัวตนยังไม่พร้อมใช้งาน กรุณาติดต่อฝ่ายสนับสนุน',
          false,
          undefined,
          false,
        );
      }
      if (response.status >= 500 || response.status === 408) {
        throw new UpPassCreateError(
          'EKYC_PROVIDER_RESULT_UNCERTAIN',
          503,
          'คำขอยืนยันตัวตนอาจถูกสร้างแล้ว ระบบหยุดการสร้างซ้ำไว้เพื่อความปลอดภัย กรุณาติดต่อฝ่ายสนับสนุน',
          false,
          undefined,
          true,
        );
      }
      throw new UpPassCreateError(
        'EKYC_PROVIDER_REQUEST_REJECTED',
        502,
        'ผู้ให้บริการไม่สามารถสร้างรายการยืนยันตัวตนจากข้อมูลนี้ได้ กรุณาติดต่อฝ่ายสนับสนุน',
        false,
        undefined,
        false,
      );
    }

    const responseText = await readProviderResponse(response);
    let payload: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(responseText) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
    } catch {
      throw new UpPassCreateError(
        'EKYC_PROVIDER_RESPONSE_INVALID',
        502,
        'ผู้ให้บริการยืนยันตัวตนตอบกลับไม่สมบูรณ์',
        false,
        undefined,
        true,
      );
    }

    const detail = payload.detail && typeof payload.detail === 'object' && !Array.isArray(payload.detail)
      ? payload.detail as Record<string, unknown>
      : {};
    const sessionSlug = typeof detail.slug === 'string' ? detail.slug.trim() : '';
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(sessionSlug)) {
      throw new UpPassCreateError(
        'EKYC_PROVIDER_RESPONSE_INVALID',
        502,
        'ผู้ให้บริการยืนยันตัวตนตอบกลับไม่สมบูรณ์',
        false,
        undefined,
        true,
      );
    }

    let formUrl: string;
    try {
      formUrl = validateUpPassFormUrl(payload.form_url, config.allowedFormHosts);
    } catch {
      throw new UpPassCreateError(
        'EKYC_PROVIDER_RESPONSE_INVALID',
        502,
        'ผู้ให้บริการยืนยันตัวตนตอบกลับไม่สมบูรณ์',
        false,
        undefined,
        true,
      );
    }
    return {
      sessionSlug,
      formUrl,
    };
  } catch (error) {
    if (error instanceof UpPassCreateError) throw error;
    if (!requestMayHaveLeft && error instanceof EkycPublicError) throw error;
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new UpPassCreateError(
      timedOut ? 'EKYC_PROVIDER_TIMEOUT_UNCERTAIN' : 'EKYC_PROVIDER_RESULT_UNCERTAIN',
      503,
      'คำขอยืนยันตัวตนอาจถูกสร้างแล้ว ระบบหยุดการสร้างซ้ำไว้เพื่อความปลอดภัย กรุณาติดต่อฝ่ายสนับสนุน',
      false,
      undefined,
      true,
    );
  } finally {
    clearTimeout(timer);
    await releaseLease();
  }
}

function recoveryRequiredError(): EkycPublicError {
  return new EkycPublicError(
    'EKYC_SESSION_RECOVERY_REQUIRED',
    409,
    'คำขอยืนยันตัวตนอาจถูกสร้างแล้ว ระบบหยุดการสร้างซ้ำไว้เพื่อความปลอดภัย กรุณาติดต่อฝ่ายสนับสนุน',
    false,
  );
}

async function loadRecoverableAttempt(
  actorType: EkycActorType,
  actorId: string,
): Promise<AttemptRecord | null> {
  const { data, error } = await supabaseAdmin()
    .from('ekyc_attempts')
    .select('id, status, uppass_slug, provider_form_url, provider_request_started_at, provider_request_completed_at, created_at, updated_at')
    .eq('actor_type', actorType)
    .eq('actor_id', actorId)
    .in('status', ['CREATING', 'ACTIVE', 'RECOVERY_REQUIRED'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new EkycPublicError(
      'EKYC_ATTEMPT_STORE_UNAVAILABLE',
      503,
      'ระบบยืนยันตัวตนไม่พร้อมใช้งานชั่วคราว',
      true,
      30,
    );
  }
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  return {
    id: String(row.id),
    status: String(row.status) as AttemptRecord['status'],
    uppass_slug: typeof row.uppass_slug === 'string' ? row.uppass_slug : null,
    provider_form_url: typeof row.provider_form_url === 'string' ? row.provider_form_url : null,
    provider_request_started_at: typeof row.provider_request_started_at === 'string'
      ? row.provider_request_started_at
      : null,
    provider_request_completed_at: typeof row.provider_request_completed_at === 'string'
      ? row.provider_request_completed_at
      : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function persistActorSession(
  actorType: EkycActorType,
  actor: ActorRecord,
  lineId: string,
  session: { sessionSlug: string; formUrl: string },
): Promise<void> {
  const dbConfig = getActorDatabaseConfig(actorType);
  const now = new Date().toISOString();
  let actorUpdate = supabaseAdmin()
    .from(dbConfig.table)
    .update({
      uppass_slug: session.sessionSlug,
      ekyc_url: session.formUrl,
      kyc_status: 'PENDING',
      kyc_verified_at: null,
      kyc_rejection_reason: null,
      kyc_data: {
        provider: 'UPPASS',
        application: { status: 'created' },
        processed_at: now,
      },
      updated_at: now,
    })
    .eq(dbConfig.idColumn, actor.id)
    .eq('line_id', lineId)
    .eq('kyc_status', actor.kyc_status);
  actorUpdate = actor.uppass_slug
    ? actorUpdate.eq('uppass_slug', actor.uppass_slug)
    : actorUpdate.is('uppass_slug', null);
  actorUpdate = actor.updated_at
    ? actorUpdate.eq('updated_at', actor.updated_at)
    : actorUpdate.is('updated_at', null);
  const { data, error } = await actorUpdate
    .select(dbConfig.idColumn)
    .maybeSingle();
  if (error) {
    throw new EkycPublicError(
      'EKYC_ACCOUNT_UPDATE_FAILED',
      503,
      'สร้างรายการแล้วแต่ยังบันทึกสถานะบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง',
      true,
      3,
    );
  }
  if (!data) {
    throw new EkycPublicError(
      'EKYC_ACCOUNT_STATE_CHANGED',
      409,
      'สถานะการยืนยันตัวตนมีการเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง',
      true,
      3,
    );
  }
}

async function recoverExistingAttempt(
  actorType: EkycActorType,
  actor: ActorRecord,
  lineId: string,
): Promise<NextResponse | null> {
  const attempt = await loadRecoverableAttempt(actorType, actor.id);
  if (!attempt) return null;

  const hasKnownResult = Boolean(
    attempt.provider_request_completed_at
    && attempt.uppass_slug
    && attempt.provider_form_url,
  );
  if (hasKnownResult) {
    const config = getUpPassRuntimeConfig(actorType);
    let formUrl: string;
    try {
      formUrl = validateUpPassFormUrl(attempt.provider_form_url, config.allowedFormHosts);
    } catch {
      if (attempt.status !== 'RECOVERY_REQUIRED') {
        await updateAttemptStrict(attempt.id, {
          status: 'RECOVERY_REQUIRED',
          last_error_code: 'STORED_PROVIDER_URL_INVALID',
        }, [attempt.status]);
      }
      throw recoveryRequiredError();
    }
    if (attempt.status !== 'ACTIVE') {
      await updateAttemptStrict(attempt.id, {
        status: 'ACTIVE',
        last_error_code: null,
      }, [attempt.status]);
    }
    await persistActorSession(actorType, actor, lineId, {
      sessionSlug: String(attempt.uppass_slug),
      formUrl,
    });
    return noStoreJson({ success: true, url: formUrl, reused: true, recovered: true });
  }

  if (attempt.status === 'ACTIVE') {
    await updateAttemptStrict(attempt.id, {
      status: 'RECOVERY_REQUIRED',
      last_error_code: 'ACTIVE_RESULT_INCOMPLETE',
    }, ['ACTIVE']);
    throw recoveryRequiredError();
  }
  if (attempt.status === 'RECOVERY_REQUIRED') throw recoveryRequiredError();

  const anchor = attempt.provider_request_started_at || attempt.created_at;
  const anchorMs = Date.parse(anchor);
  const isStale = !Number.isFinite(anchorMs) || Date.now() - anchorMs >= creatingStaleMs();
  if (!isStale) {
    throw new EkycPublicError(
      'EKYC_SESSION_CREATING',
      429,
      'ระบบกำลังสร้างรายการยืนยันตัวตน กรุณารอสักครู่',
      true,
      Math.max(3, Math.ceil(providerTimeoutMs() / 1000)),
    );
  }

  if (attempt.provider_request_started_at) {
    await updateAttemptStrict(attempt.id, {
      status: 'RECOVERY_REQUIRED',
      last_error_code: 'PROVIDER_RESULT_UNCERTAIN',
    }, ['CREATING']);
    throw recoveryRequiredError();
  }

  // The request was reserved but provably never admitted to the provider.
  // It is safe to fail this row and allow a fresh attempt.
  await updateAttemptStrict(attempt.id, {
    status: 'FAILED',
    last_error_code: 'STALE_BEFORE_PROVIDER_CALL',
  }, ['CREATING']);
  return null;
}

export async function initiateEkyc(request: Request, actorType: EkycActorType) {
  const dbConfig = getActorDatabaseConfig(actorType);
  const identity = await requireLiffIdentity(request, dbConfig.lineTokenRole);
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from(dbConfig.table)
    .select(actorSelect(dbConfig.idColumn))
    .eq('line_id', identity.lineId)
    .maybeSingle();

  if (error) throw new EkycPublicError('EKYC_ACCOUNT_LOOKUP_FAILED', 503, 'ไม่สามารถตรวจสอบบัญชีได้ชั่วคราว', true, 30);
  if (!data) throw new EkycPublicError('EKYC_ACCOUNT_NOT_FOUND', 404, 'ไม่พบข้อมูลบัญชี กรุณาลงทะเบียนก่อน');
  const actor = normalizeActor(data as unknown as Record<string, unknown>, dbConfig.idColumn);

  if (actor.kyc_status === 'VERIFIED') {
    throw new EkycPublicError('EKYC_ALREADY_VERIFIED', 409, 'บัญชีนี้ยืนยันตัวตนเรียบร้อยแล้ว');
  }
  if (actor.kyc_status === 'PENDING' && (hasKycSubmissionCompleted(actor) || isKycNeedReview(actor))) {
    throw new EkycPublicError('EKYC_REVIEW_PENDING', 409, 'ระบบได้รับข้อมูลแล้วและกำลังตรวจสอบ กรุณารอผลการยืนยันตัวตน');
  }
  if (actor.kyc_status === 'PENDING' && actor.ekyc_url) {
    const config = getUpPassRuntimeConfig(actorType);
    const safeExistingUrl = validateUpPassFormUrl(actor.ekyc_url, config.allowedFormHosts);
    return noStoreJson({ success: true, url: safeExistingUrl, reused: true });
  }

  const recovered = await recoverExistingAttempt(actorType, actor, identity.lineId);
  if (recovered) return recovered;

  await enforceAdmissionControl(actorType, actor.id, identity.lineId);

  // The partial unique index is the concurrency lock. Do not supersede an
  // ACTIVE row here: this request may have read the actor just before a
  // concurrent request finished creating and persisted that active session.
  const attempt = await reserveAttempt(actorType, actor.id);
  let providerResultKnown = false;
  let activeAttemptPersisted = false;
  try {
    const session = await createUpPassSession(actorType, actor, attempt.id);
    providerResultKnown = true;
    const completedAt = new Date().toISOString();
    try {
      await updateAttemptStrict(attempt.id, {
        status: 'ACTIVE',
        uppass_slug: session.sessionSlug,
        form_slug: getUpPassRuntimeConfig(actorType).formSlug,
        provider_form_url: session.formUrl,
        provider_request_completed_at: completedAt,
        last_error_code: null,
      }, ['CREATING']);
      activeAttemptPersisted = true;
    } catch {
      // Preserve the known provider result if the ACTIVE transition failed.
      // A subsequent request can safely recover this exact session without
      // creating a second UpPass application.
      await updateAttemptBestEffort(attempt.id, {
        status: 'RECOVERY_REQUIRED',
        uppass_slug: session.sessionSlug,
        form_slug: getUpPassRuntimeConfig(actorType).formSlug,
        provider_form_url: session.formUrl,
        provider_request_completed_at: completedAt,
        last_error_code: 'ACTIVE_PERSIST_FAILED',
      }, ['CREATING']);
      throw recoveryRequiredError();
    }

    try {
      await persistActorSession(actorType, actor, identity.lineId, session);
    } catch (error) {
      await updateAttemptBestEffort(attempt.id, {
        last_error_code: error instanceof EkycPublicError ? error.code : 'ACTOR_UPDATE_FAILED',
      }, ['ACTIVE']);
      throw error;
    }

    await updateAttemptBestEffort(attempt.id, {
      status: 'ACTIVE',
      last_error_code: null,
    }, ['ACTIVE']);

    return noStoreJson({ success: true, url: session.formUrl, reused: false });
  } catch (error) {
    if (activeAttemptPersisted) throw error;
    if (providerResultKnown) throw error;
    if (error instanceof UpPassCreateError && error.ambiguous) {
      // This update is a correctness boundary: if it cannot be persisted, do
      // not acknowledge a recoverable state as though the attempt were safe
      // to retry. The still-CREATING row remains protected by started_at.
      await updateAttemptStrict(attempt.id, {
        status: 'RECOVERY_REQUIRED',
        last_error_code: error.code,
      }, ['CREATING']);
      throw recoveryRequiredError();
    }
    await updateAttemptBestEffort(attempt.id, {
      status: 'FAILED',
      last_error_code: error instanceof EkycPublicError ? error.code : 'UNKNOWN_ERROR',
    }, ['CREATING']);
    throw error;
  }
}
