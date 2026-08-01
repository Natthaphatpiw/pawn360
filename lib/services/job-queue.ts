// Generic async job queue (see ESTIMATE_JOB_QUEUE.md).
//
// Long-running pipelines (price estimate, condition scoring) exceed a single
// serverless request budget, so the UI enqueues a job, gets an id back
// immediately, and polls until a terminal state. This module is the shared
// engine both queues are built on.
//
// Job state lives in Upstash Redis (already required for the estimate cache)
// under a per-queue namespace + TTL — no schema, no cleanup cron. Two
// dispatcher modes:
//   - 'waituntil' (default): the enqueue route processes the job after
//     responding, via Next's after(). Zero external dependencies.
//   - 'qstash'  (JOB_DISPATCHER=qstash + JOB_WORKER_SECRET): publishes to
//     Upstash QStash, which calls the queue's process endpoint with retries —
//     survives function crashes/redeploys mid-run.

import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import {
  DuplicateMessageError,
  send as sendVercelQueue,
} from '@vercel/queue';
import {
  deletePrivateQueuePayload,
  putPrivateQueuePayload,
  readPrivateQueuePayload,
} from '@/lib/storage/blob';
import {
  isProviderError,
  providerErrorCode,
} from '@/lib/services/provider-error';
import {
  deriveAISafetyIdentifier,
  runWithAIUsageContext,
} from '@/lib/services/ai-usage';

export type JobStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'RETRYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type JobRunResult<Res> =
  | { ok: true; payload: Res }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
      retryAfterSeconds?: number;
    };

export interface JobRecord<Req, Res> {
  jobId: string;
  status: JobStatus;
  createdAtMs: number;
  startedAtMs?: number;
  heartbeatAtMs?: number;
  finishedAtMs?: number;
  attempts: number;
  lineId?: string;
  request?: Req;
  requestBlobPathname?: string;
  result?: Res;
  error?: string;
  errorCode?: string;
  httpStatus?: number;
  nextRetryAtMs?: number;
  lastError?: string;
  lastErrorCode?: string;
  deadLetteredAtMs?: number;
}

export type JobDispatchMode = 'vercel' | 'waituntil' | 'qstash';

export interface JobProcessOptions {
  deliveryCount?: number;
  maxDeliveries?: number;
}

export class RetryableJobError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
    readonly code = 'job_retryable'
  ) {
    super(message);
    this.name = 'RetryableJobError';
  }
}

export interface JobQueueConfig<Req, Res> {
  // Redis key prefix INCLUDING a version, e.g. 'estimate:job:v1'.
  namespace: string;
  // Absolute path QStash should POST to, e.g. '/api/estimate/jobs/process'.
  processPath: string;
  // The actual work. Must resolve (never reject) with a discriminated result;
  // business failures are represented as { ok: false }, not thrown.
  run: (request: Req) => Promise<JobRunResult<Res>>;
  ttlSeconds?: number;
  // A PROCESSING job whose last heartbeat is older than this is treated as
  // crashed and becomes re-claimable (a QStash retry can rescue it).
  staleMs?: number;
  // A PROCESSING job with no heartbeat this long is reported to pollers as
  // FAILED (backstop for when no retry ever comes, e.g. a waituntil crash).
  giveUpMs?: number;
  // How often a running job refreshes its heartbeat. Must be well under
  // staleMs so a live (but slow) run is never mistaken for crashed.
  heartbeatIntervalMs?: number;
  timeoutMessage?: string;
  getLineId?: (request: Req) => string | undefined;
  // Vercel Queue topic. A resolver lets one queue split heavy notebook work
  // from the generic estimate workload while keeping the same job engine.
  vercelTopic?: string | ((request: Req) => string);
  // Distributed provider capacity. A Redis lease prevents a burst of Queue
  // deliveries from exceeding LLM/search provider concurrency and TPM.
  concurrency?: (request: Req) => {
    group: string;
    defaultLimit: number;
    envVar?: string;
  };
  // Legacy env names checked before the shared JOB_* names (back-compat).
  legacyDispatcherEnv?: string;
  legacyWorkerSecretEnv?: string;
}

const DEFAULT_TTL_SECONDS = 2 * 60 * 60;
// Liveness thresholds are measured against a heartbeat, NOT absolute job age,
// so a legitimately long run (kept fresh by its heartbeat) is never re-claimed
// or failed — only a run that has stopped beating (crashed) is. staleMs must
// exceed the QStash retry backoff's floor yet stay under maxDuration so a
// retry can re-claim a crashed run before the client's own timeout.
const DEFAULT_STALE_MS = 60 * 1000;
const DEFAULT_GIVEUP_MS = 3 * 60 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15 * 1000;
const DEFAULT_LOCK_TTL_MS = 90 * 1000;
const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 10 * 60;
const DEFAULT_QUEUE_RETENTION_SECONDS = 24 * 60 * 60;
const DEFAULT_DLQ_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_INLINE_REQUEST_BYTES = 512 * 1024;
const DEFAULT_CAPACITY_LEASE_MS = 6 * 60 * 1000;

const RELEASE_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

const EXTEND_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0
`;

const ACQUIRE_CAPACITY_SCRIPT = `
redis.call('zremrangebyscore', KEYS[1], '-inf', ARGV[1])
if redis.call('zcard', KEYS[1]) >= tonumber(ARGV[2]) then
  return 0
end
redis.call('zadd', KEYS[1], ARGV[3], ARGV[4])
redis.call('pexpire', KEYS[1], ARGV[5])
return 1
`;

const EXTEND_CAPACITY_SCRIPT = `
if redis.call('zscore', KEYS[1], ARGV[1]) then
  redis.call('zadd', KEYS[1], ARGV[2], ARGV[1])
  redis.call('pexpire', KEYS[1], ARGV[3])
  return 1
end
return 0
`;

const WRITE_UNLESS_CANCELLED_SCRIPT = `
if redis.call('exists', KEYS[2]) == 1 then
  return 0
end
redis.call('set', KEYS[1], ARGV[1], 'ex', ARGV[2])
return 1
`;

interface CapacityLease {
  key: string;
  token: string;
}

export class JobQueue<Req, Res> {
  private redisClient: Redis | null | undefined;
  private readonly ttlSeconds: number;
  private readonly staleMs: number;
  private readonly giveUpMs: number;
  private readonly heartbeatIntervalMs: number;

  constructor(private readonly config: JobQueueConfig<Req, Res>) {
    this.ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const staleMs = config.staleMs ?? DEFAULT_STALE_MS;
    this.staleMs = staleMs;
    this.giveUpMs = Math.max(config.giveUpMs ?? DEFAULT_GIVEUP_MS, staleMs);
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  }

  // Last sign of life for a PROCESSING job: its heartbeat, or its start time
  // before the first beat lands.
  private lastBeatMs(job: JobRecord<Req, Res>): number {
    return job.heartbeatAtMs ?? job.startedAtMs ?? job.createdAtMs;
  }

  // -------------------------------------------------------------------------
  // Redis
  // -------------------------------------------------------------------------

  private getRedis(): Redis | null {
    if (this.redisClient !== undefined) return this.redisClient;
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      this.redisClient = null;
      return this.redisClient;
    }
    try {
      this.redisClient = new Redis({ url, token });
    } catch (error) {
      console.warn(`⚠️ Job queue [${this.config.namespace}]: failed to init Redis:`, error);
      this.redisClient = null;
    }
    return this.redisClient;
  }

  isStoreAvailable(): boolean {
    return this.getRedis() !== null;
  }

  private key(jobId: string): string {
    return `${this.config.namespace}:${jobId}`;
  }

  private heartbeatKey(jobId: string): string {
    return `${this.config.namespace}:heartbeat:${jobId}`;
  }

  private lockKey(jobId: string): string {
    return `${this.config.namespace}:lock:${jobId}`;
  }

  private cancelKey(jobId: string): string {
    return `${this.config.namespace}:cancel:${jobId}`;
  }

  private dedupeKey(fingerprint: string): string {
    return `${this.config.namespace}:dedupe:${fingerprint}`;
  }

  private deadLetterKey(): string {
    return `${this.config.namespace}:dlq`;
  }

  private deadLetterEntryKey(jobId: string): string {
    return `${this.config.namespace}:dlq:entry:${jobId}`;
  }

  private capacityKey(group: string): string {
    const safeGroup = group.toLowerCase().replace(/[^a-z0-9:_-]/g, '-').slice(0, 80);
    return `job:provider-capacity:v1:${safeGroup}`;
  }

  private async read(jobId: string): Promise<JobRecord<Req, Res> | null> {
    const redis = this.getRedis();
    if (!redis) return null;
    try {
      const raw = await redis.get<JobRecord<Req, Res>>(this.key(jobId));
      return raw && typeof raw === 'object' && raw.jobId ? raw : null;
    } catch (error) {
      console.warn(`⚠️ Job queue [${this.config.namespace}]: read failed:`, error);
      return null;
    }
  }

  private async readStrict(jobId: string): Promise<JobRecord<Req, Res> | null> {
    const redis = this.getRedis();
    if (!redis) throw new Error('Job store unavailable');
    const raw = await redis.get<JobRecord<Req, Res>>(this.key(jobId));
    return raw && typeof raw === 'object' && raw.jobId ? raw : null;
  }

  private async write(job: JobRecord<Req, Res>): Promise<boolean> {
    const redis = this.getRedis();
    if (!redis) return false;
    try {
      await redis.set(this.key(job.jobId), job, { ex: this.ttlSeconds });
      return true;
    } catch (error) {
      console.warn(`⚠️ Job queue [${this.config.namespace}]: write failed:`, error);
      return false;
    }
  }

  private async writeStrict(job: JobRecord<Req, Res>): Promise<void> {
    const redis = this.getRedis();
    if (!redis) throw new Error('Job store unavailable');
    await redis.set(this.key(job.jobId), job, { ex: this.ttlSeconds });
  }

  private async writeStrictUnlessCancelled(job: JobRecord<Req, Res>): Promise<boolean> {
    const redis = this.getRedis();
    if (!redis) throw new Error('Job store unavailable');
    const written = await redis.eval<[string, string], number>(
      WRITE_UNLESS_CANCELLED_SCRIPT,
      [this.key(job.jobId), this.cancelKey(job.jobId)],
      [JSON.stringify(job), String(this.ttlSeconds)]
    );
    return written === 1;
  }

  private async isCancellationRequested(jobId: string): Promise<boolean> {
    const redis = this.getRedis();
    if (!redis) throw new Error('Job store unavailable');
    return (await redis.exists(this.cancelKey(jobId))) > 0;
  }

  private async readHeartbeat(jobId: string): Promise<number | null> {
    const redis = this.getRedis();
    if (!redis) return null;
    const value = await redis.get<number | string>(this.heartbeatKey(jobId)).catch(() => null);
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private async clearHeartbeat(jobId: string): Promise<void> {
    const redis = this.getRedis();
    if (!redis) return;
    await redis.del(this.heartbeatKey(jobId)).catch(() => {});
  }

  private buildIdempotencyFingerprint(request: Req, clientKey?: string): string {
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');
    return crypto
      .createHash('sha256')
      .update(`${clientKey?.trim() || 'server'}:${payloadHash}`)
      .digest('hex');
  }

  private queuePayloadPathname(jobId: string): string {
    const namespace = this.config.namespace.replace(/[^a-zA-Z0-9_-]/g, '-');
    return `queue-payloads/${namespace}/${jobId}.json`;
  }

  private async resolveRequest(job: JobRecord<Req, Res>): Promise<Req> {
    if (job.request !== undefined) return job.request;
    if (!job.requestBlobPathname) {
      throw new Error('Job request payload is missing');
    }
    const raw = await readPrivateQueuePayload(job.requestBlobPathname);
    const parsed = JSON.parse(raw) as Req;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Job request payload is invalid');
    }
    return parsed;
  }

  private async deletePayloadBlob(job: JobRecord<Req, Res>): Promise<boolean> {
    if (!job.requestBlobPathname) return true;
    try {
      await deletePrivateQueuePayload(job.requestBlobPathname);
      return true;
    } catch (error) {
      console.warn(
        `⚠️ Job queue [${this.config.namespace}]: failed to delete terminal payload ${job.jobId}:`,
        error
      );
      return false;
    }
  }

  private async cleanupTerminalPayload(job: JobRecord<Req, Res>): Promise<void> {
    if (!job.requestBlobPathname || !(await this.deletePayloadBlob(job))) return;
    // Clearing the reference makes cleanup idempotent. If this best-effort
    // write fails, the next terminal status read retries deletion safely.
    delete job.requestBlobPathname;
    await this.write(job);
  }

  private async isProcessLocked(jobId: string): Promise<boolean> {
    const redis = this.getRedis();
    if (!redis) return true;
    try {
      return (await redis.exists(this.lockKey(jobId))) > 0;
    } catch {
      // Never time out/delete a live payload merely because the liveness
      // check itself failed.
      return true;
    }
  }

  private resolveConcurrency(request: Req): { group: string; limit: number } | null {
    const configured = this.config.concurrency?.(request);
    if (!configured) return null;
    const envValue = configured.envVar ? Number(process.env[configured.envVar]) : NaN;
    const requestedLimit = Number.isFinite(envValue) ? envValue : configured.defaultLimit;
    const limit = Math.max(1, Math.min(100, Math.floor(requestedLimit)));
    return { group: configured.group, limit };
  }

  private async acquireCapacity(request: Req): Promise<CapacityLease | null> {
    const capacity = this.resolveConcurrency(request);
    if (!capacity) return { key: '', token: '' };
    const redis = this.getRedis();
    if (!redis) throw new Error('Job store unavailable');
    const now = Date.now();
    const token = crypto.randomUUID();
    const key = this.capacityKey(capacity.group);
    const acquired = await redis.eval<[string, string, string, string, string], number>(
      ACQUIRE_CAPACITY_SCRIPT,
      [key],
      [
        String(now),
        String(capacity.limit),
        String(now + DEFAULT_CAPACITY_LEASE_MS),
        token,
        String(DEFAULT_CAPACITY_LEASE_MS + 60_000),
      ]
    );
    return acquired === 1 ? { key, token } : null;
  }

  private async extendCapacity(lease: CapacityLease): Promise<void> {
    if (!lease.key) return;
    const redis = this.getRedis();
    if (!redis) throw new Error('Job store unavailable');
    await redis.eval<[string, string, string], number>(
      EXTEND_CAPACITY_SCRIPT,
      [lease.key],
      [
        lease.token,
        String(Date.now() + DEFAULT_CAPACITY_LEASE_MS),
        String(DEFAULT_CAPACITY_LEASE_MS + 60_000),
      ]
    );
  }

  private async releaseCapacity(lease: CapacityLease | null): Promise<void> {
    if (!lease?.key) return;
    const redis = this.getRedis();
    if (!redis) return;
    await redis.zrem(lease.key, lease.token).catch(() => {});
  }

  private retryDelaySeconds(deliveryCount: number): number {
    const exponent = Math.max(0, Math.min(6, deliveryCount - 1));
    const base = Math.min(300, 5 * (2 ** exponent));
    // Full jitter prevents a wall of provider retries on the same reset second.
    return Math.max(5, Math.round(base * (0.5 + Math.random())));
  }

  private retryDelayForResult(
    deliveryCount: number,
    result: Extract<JobRunResult<Res>, { ok: false }>,
    technicalError: unknown
  ): number {
    if (isProviderError(technicalError) && technicalError.retryAfterMs !== undefined) {
      return Math.max(5, Math.min(300, Math.ceil(technicalError.retryAfterMs / 1000)));
    }
    if (result.retryAfterSeconds !== undefined && Number.isFinite(result.retryAfterSeconds)) {
      return Math.max(5, Math.min(300, Math.ceil(result.retryAfterSeconds)));
    }
    return this.retryDelaySeconds(deliveryCount);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async create(request: Req, clientIdempotencyKey?: string): Promise<JobRecord<Req, Res> | null> {
    const redis = this.getRedis();
    if (!redis) return null;

    let serializedRequest: string;
    try {
      serializedRequest = JSON.stringify(request);
    } catch {
      return null;
    }
    const fingerprint = this.buildIdempotencyFingerprint(request, clientIdempotencyKey);
    const dedupeKey = this.dedupeKey(fingerprint);
    // A caller-supplied key is a logical request contract and must remain
    // stable for the entire job lifetime (the browser may poll for 15 minutes
    // and Queue retention is longer). Payload-only dedupe keeps the shorter
    // window so a deliberate later re-estimate is still possible.
    const idempotencyTtlSeconds = clientIdempotencyKey
      ? this.ttlSeconds
      : DEFAULT_IDEMPOTENCY_TTL_SECONDS;
    const jobId = crypto.randomUUID();
    let acquired = false;

    try {
      const setResult = await redis.set(dedupeKey, jobId, {
        nx: true,
        ex: idempotencyTtlSeconds,
      });
      acquired = setResult === 'OK';

      if (!acquired) {
        const existingJobId = await redis.get<string>(dedupeKey);
        if (existingJobId) {
          const existing = await this.read(existingJobId);
          if (existing && existing.status !== 'FAILED' && existing.status !== 'CANCELLED') {
            return existing;
          }
        }

        // The idempotency pointer is stale or points at a terminal attempt.
        // Remove it only when it still contains the value we observed, then
        // let the caller retry normally rather than creating a duplicate race.
        if (existingJobId) {
          await redis.eval<[string], number>(
            RELEASE_LOCK_SCRIPT,
            [dedupeKey],
            [existingJobId]
          );
        }
        const retrySet = await redis.set(dedupeKey, jobId, {
          nx: true,
          ex: idempotencyTtlSeconds,
        });
        acquired = retrySet === 'OK';
        if (!acquired) {
          const winnerId = await redis.get<string>(dedupeKey);
          return winnerId ? this.read(winnerId) : null;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Job queue [${this.config.namespace}]: idempotency check failed:`, error);
      return null;
    }

    const job: JobRecord<Req, Res> = {
      jobId,
      status: 'QUEUED',
      createdAtMs: Date.now(),
      attempts: 0,
      lineId: this.config.getLineId?.(request),
    };

    if (Buffer.byteLength(serializedRequest, 'utf8') > MAX_INLINE_REQUEST_BYTES) {
      const pathname = this.queuePayloadPathname(jobId);
      try {
        const blob = await putPrivateQueuePayload(pathname, serializedRequest);
        job.requestBlobPathname = blob.pathname;
      } catch (error) {
        console.error(`❌ Job queue [${this.config.namespace}]: payload offload failed:`, error);
        if (acquired) await redis.del(dedupeKey).catch(() => {});
        return null;
      }
    } else {
      job.request = request;
    }

    const ok = await this.write(job);
    if (!ok && acquired) {
      await redis.del(dedupeKey).catch(() => {});
      await this.deletePayloadBlob(job);
    }
    return ok ? job : null;
  }

  // Returns the job with stale-PROCESSING detection applied: a run that died
  // mid-flight becomes FAILED so pollers get a clean terminal state.
  async get(jobId: string): Promise<JobRecord<Req, Res> | null> {
    const job = await this.read(jobId);
    if (!job) return null;
    if (
      ['QUEUED', 'PROCESSING', 'RETRYING'].includes(job.status)
      && await this.isCancellationRequested(jobId).catch(() => false)
    ) {
      job.status = 'CANCELLED';
      job.finishedAtMs = Date.now();
      delete job.nextRetryAtMs;
      await this.write(job);
    }
    if (job.status === 'PROCESSING') {
      const heartbeatAtMs = await this.readHeartbeat(jobId);
      if (heartbeatAtMs) job.heartbeatAtMs = heartbeatAtMs;
    }
    // Only give up on a job that has stopped beating for giveUpMs — a live but
    // slow run keeps its heartbeat fresh and is never failed here.
    if (
      job.status === 'PROCESSING'
      && Date.now() - this.lastBeatMs(job) > this.giveUpMs
      && !(await this.isProcessLocked(jobId))
    ) {
      job.status = 'FAILED';
      job.error = this.config.timeoutMessage || 'งานใช้เวลานานผิดปกติและถูกยกเลิก กรุณาลองใหม่อีกครั้ง';
      job.errorCode = 'job_timeout';
      job.finishedAtMs = Date.now();
      const persisted = await this.write(job);
      if (persisted) {
        await this.clearHeartbeat(jobId);
        await this.cleanupTerminalPayload(job);
      }
    }
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) {
      await this.cleanupTerminalPayload(job);
    }
    return job;
  }

  async cancel(jobId: string): Promise<JobRecord<Req, Res> | null> {
    const job = await this.read(jobId);
    if (!job) return null;
    if (job.status === 'QUEUED' || job.status === 'PROCESSING' || job.status === 'RETRYING') {
      const redis = this.getRedis();
      if (!redis) return null;
      // The marker is written first. Worker state transitions use an atomic
      // check+set script, so a completion racing this request cannot overwrite
      // the user's cancellation.
      await redis.set(this.cancelKey(jobId), '1', { ex: this.ttlSeconds });
      job.status = 'CANCELLED';
      job.finishedAtMs = Date.now();
      delete job.nextRetryAtMs;
      const persisted = await this.write(job);
      if (persisted) {
        await this.clearHeartbeat(jobId);
        await this.cleanupTerminalPayload(job);
      }
    }
    return job;
  }

  private async acquireProcessLock(jobId: string): Promise<string | null> {
    const redis = this.getRedis();
    if (!redis) throw new Error('Job store unavailable');
    const token = crypto.randomUUID();
    const acquired = await redis.set(this.lockKey(jobId), token, {
      nx: true,
      px: DEFAULT_LOCK_TTL_MS,
    });
    return acquired === 'OK' ? token : null;
  }

  private async releaseProcessLock(jobId: string, token: string): Promise<void> {
    const redis = this.getRedis();
    if (!redis) return;
    await redis.eval<[string], number>(RELEASE_LOCK_SCRIPT, [this.lockKey(jobId)], [token]).catch(() => {});
  }

  private async ownsProcessLock(jobId: string, token: string): Promise<boolean> {
    const redis = this.getRedis();
    if (!redis) throw new Error('Job store unavailable');
    return (await redis.get<string>(this.lockKey(jobId))) === token;
  }

  // Claim only after obtaining the Redis NX lock. The lock is the authority
  // for at-least-once delivery: if a function crashes it expires, allowing a
  // later Vercel Queue delivery to resume the job without a double LLM run.
  private async claim(jobId: string): Promise<JobRecord<Req, Res> | null> {
    if (await this.isCancellationRequested(jobId)) return null;
    const job = await this.readStrict(jobId);
    if (!job) return null;
    if (!['QUEUED', 'RETRYING', 'PROCESSING'].includes(job.status)) return null;
    const now = Date.now();
    job.status = 'PROCESSING';
    job.startedAtMs = now;
    job.heartbeatAtMs = now;
    job.attempts = (job.attempts || 0) + 1;
    delete job.nextRetryAtMs;
    if (!(await this.writeStrictUnlessCancelled(job))) return null;
    const redis = this.getRedis();
    await redis?.set(this.heartbeatKey(jobId), now, { ex: this.ttlSeconds });
    return job;
  }

  // Heartbeats live in a small side key so a condition job containing base64
  // images is not read and rewritten every 15 seconds. The Lua check extends
  // only the lock owned by this exact worker.
  private async beat(jobId: string, lockToken: string): Promise<void> {
    const redis = this.getRedis();
    if (!redis) throw new Error('Job store unavailable');
    const now = Date.now();
    await Promise.all([
      redis.set(this.heartbeatKey(jobId), now, { ex: this.ttlSeconds }),
      redis.eval<[string, string], number>(
        EXTEND_LOCK_SCRIPT,
        [this.lockKey(jobId)],
        [lockToken, String(DEFAULT_LOCK_TTL_MS)]
      ),
    ]);
  }

  private async deadLetter(job: JobRecord<Req, Res>): Promise<void> {
    const redis = this.getRedis();
    if (!redis) throw new Error('Job store unavailable');
    const key = this.deadLetterKey();
    // The entry records expire individually, but sorted-set members do not.
    // Prune them on every write so a continuously active DLQ cannot grow
    // forever merely because its top-level TTL keeps being refreshed.
    await redis.zremrangebyscore(
      key,
      '-inf',
      Date.now() - DEFAULT_DLQ_TTL_SECONDS * 1000,
    );
    await Promise.all([
      redis.zadd(key, { score: job.deadLetteredAtMs || Date.now(), member: job.jobId }),
      redis.expire(key, DEFAULT_DLQ_TTL_SECONDS),
      redis.set(
        this.deadLetterEntryKey(job.jobId),
        {
          jobId: job.jobId,
          namespace: this.config.namespace,
          createdAtMs: job.createdAtMs,
          finishedAtMs: job.finishedAtMs,
          attempts: job.attempts,
          errorCode: job.errorCode,
          lastErrorCode: job.lastErrorCode,
          httpStatus: job.httpStatus,
        },
        { ex: DEFAULT_DLQ_TTL_SECONDS }
      ),
    ]);
  }

  async failDispatch(jobId: string, message = 'ระบบคิวไม่พร้อมใช้งานชั่วคราว'): Promise<void> {
    const job = await this.readStrict(jobId);
    if (!job || !['QUEUED', 'RETRYING'].includes(job.status)) return;
    job.status = 'FAILED';
    job.error = message;
    job.errorCode = 'queue_dispatch_failed';
    job.httpStatus = 503;
    job.finishedAtMs = Date.now();
    job.deadLetteredAtMs = Date.now();
    if (!(await this.writeStrictUnlessCancelled(job))) return;
    await this.deadLetter(job);
    await this.cleanupTerminalPayload(job);
  }

  private async hasFreshWorker(jobId: string, job: JobRecord<Req, Res>): Promise<boolean> {
    if (job.status !== 'PROCESSING') return false;
    const heartbeatAtMs = await this.readHeartbeat(jobId);
    const lastBeatMs = heartbeatAtMs || this.lastBeatMs(job);
    const freshnessMs = Math.min(
      this.staleMs,
      Math.max(30_000, this.heartbeatIntervalMs * 3),
    );
    return Date.now() - lastBeatMs <= freshnessMs;
  }

  private async persistDeliveryExhausted(jobId: string, code: string): Promise<void> {
    const current = await this.readStrict(jobId);
    if (!current || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(current.status)) return;

    // A fresh replacement owns the job after an at-least-once duplicate or a
    // lease handoff. Acknowledge this duplicate and let that live delivery be
    // authoritative instead of racing it with a terminal write.
    if (await this.hasFreshWorker(jobId, current)) return;

    current.status = 'FAILED';
    current.error = 'ระบบประมวลผลไม่สำเร็จหลังจากลองใหม่แล้ว กรุณาลองอีกครั้งภายหลัง';
    current.errorCode = 'job_delivery_exhausted';
    current.httpStatus = 503;
    current.lastError = 'Queue delivery attempts were exhausted';
    current.lastErrorCode = code;
    current.finishedAtMs = Date.now();
    current.deadLetteredAtMs = Date.now();
    delete current.nextRetryAtMs;
    if (!(await this.writeStrictUnlessCancelled(current))) return;
    await this.clearHeartbeat(jobId);
    await this.deadLetter(current);
    await this.cleanupTerminalPayload(current);
  }

  async process(jobId: string, options: JobProcessOptions = {}): Promise<void> {
    const ns = this.config.namespace;
    const deliveryCount = Math.max(1, options.deliveryCount || 1);
    const maxDeliveries = Math.max(1, options.maxDeliveries || 1);
    const lockToken = await this.acquireProcessLock(jobId);

    if (!lockToken) {
      const current = await this.readStrict(jobId);
      if (!current || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(current.status)) return;
      if (deliveryCount >= maxDeliveries) {
        await this.persistDeliveryExhausted(jobId, 'job_locked');
        return;
      }
      throw new RetryableJobError('Job is already being processed', 10, 'job_locked');
    }

    let job: JobRecord<Req, Res> | null = null;
    let capacityLease: CapacityLease | null = null;
    try {
      job = await this.claim(jobId);
      if (!job) {
        console.log(`🧾 Job [${ns}] ${jobId}: not claimable (already processed/cancelled)`);
        return;
      }

      console.log(`🧾 Job [${ns}] ${jobId}: processing (attempt ${job.attempts}, delivery ${deliveryCount})`);
      let result: JobRunResult<Res>;
      let technicalError: unknown;
      let request: Req | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      try {
        request = await this.resolveRequest(job);
        capacityLease = await this.acquireCapacity(request);

        if (!capacityLease) {
          const current = await this.readStrict(jobId);
          if (!current || current.status === 'CANCELLED') return;

          if (deliveryCount >= maxDeliveries) {
            current.status = 'FAILED';
            current.error = 'ระบบมีผู้ใช้งานจำนวนมากและไม่สามารถเริ่มงานได้ทันเวลา กรุณาลองใหม่อีกครั้ง';
            current.errorCode = 'provider_capacity_exhausted';
            current.httpStatus = 503;
            current.finishedAtMs = Date.now();
            current.deadLetteredAtMs = Date.now();
            delete current.nextRetryAtMs;
            if (!(await this.writeStrictUnlessCancelled(current))) return;
            await this.clearHeartbeat(jobId);
            await this.deadLetter(current);
            await this.cleanupTerminalPayload(current);
            return;
          }

          const retryAfterSeconds = this.retryDelaySeconds(deliveryCount);
          current.status = 'RETRYING';
          current.error = 'ระบบกำลังรองานประมวลผลว่าง งานของคุณยังอยู่ในคิวและจะเริ่มให้อัตโนมัติ';
          current.errorCode = 'provider_capacity_wait';
          current.httpStatus = 503;
          current.nextRetryAtMs = Date.now() + retryAfterSeconds * 1000;
          delete current.finishedAtMs;
          if (!(await this.writeStrictUnlessCancelled(current))) return;
          await this.clearHeartbeat(jobId);
          throw new RetryableJobError(current.error, retryAfterSeconds, current.errorCode);
        }

        heartbeat = setInterval(() => {
          void Promise.all([
            this.beat(jobId, lockToken),
            this.extendCapacity(capacityLease!),
          ]).catch((error) =>
            console.warn(`⚠️ Job [${ns}] ${jobId}: heartbeat failed:`, error)
          );
        }, this.heartbeatIntervalMs);

        result = await runWithAIUsageContext(
          {
            jobId,
            safetyIdentifier: job.lineId
              ? deriveAISafetyIdentifier(job.lineId)
              : undefined,
          },
          () => this.config.run(request!)
        );
      } catch (error) {
        if (error instanceof RetryableJobError) throw error;
        technicalError = error;
        console.error(`🧾 Job [${ns}] ${jobId}: run threw:`, error);
        const providerFailure = isProviderError(error) ? error : null;
        result = {
          ok: false,
          status: providerFailure?.status
            ?? (providerFailure?.retryable ? 503 : providerFailure ? 400 : 500),
          error: 'เกิดข้อผิดพลาดในการประมวลผล',
          code: providerFailure ? providerErrorCode(providerFailure) : 'job_worker_error',
          // Bound the user-facing hint the same way the retry scheduler is
          // bounded. A capacity lease can be minutes long; never tell a waiting
          // pawner to come back in a quarter of an hour.
          retryAfterSeconds: providerFailure?.retryAfterMs === undefined
            ? undefined
            : Math.max(1, Math.min(300, Math.ceil(providerFailure.retryAfterMs / 1000))),
        };
      } finally {
        if (heartbeat) clearInterval(heartbeat);
      }

      // A lease can be lost after a long network stall. Never let that stale
      // worker overwrite the result of the replacement delivery.
      if (!(await this.ownsProcessLock(jobId, lockToken))) {
        throw new RetryableJobError('Job processing lease was lost', 10, 'job_lease_lost');
      }

      // Re-read: the user may have cancelled while run() was in flight.
      const current = await this.readStrict(jobId);
      if (!current || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(current.status)) {
        console.log(`🧾 Job [${ns}] ${jobId}: terminal during processing — result discarded`);
        return;
      }

      const retryableFailure = !result.ok && (
        (isProviderError(technicalError) && technicalError.retryable)
        || result.status === 408
        || result.status === 429
        || result.status >= 500
      );
      if (!result.ok && retryableFailure && deliveryCount < maxDeliveries) {
        const retryAfterSeconds = this.retryDelayForResult(deliveryCount, result, technicalError);
        current.status = 'RETRYING';
        current.error = 'ผู้ให้บริการกำลังมีผู้ใช้งานจำนวนมาก ระบบจะลองใหม่ให้อัตโนมัติ';
        current.errorCode = 'provider_temporarily_unavailable';
        current.httpStatus = 503;
        current.lastError = technicalError instanceof Error ? technicalError.message : result.error;
        current.lastErrorCode = result.code;
        current.nextRetryAtMs = Date.now() + retryAfterSeconds * 1000;
        delete current.finishedAtMs;
        if (!(await this.writeStrictUnlessCancelled(current))) return;
        await this.clearHeartbeat(jobId);
        throw new RetryableJobError(current.error, retryAfterSeconds, current.errorCode);
      }

      current.finishedAtMs = Date.now();
      delete current.nextRetryAtMs;
      if (result.ok) {
        current.status = 'COMPLETED';
        current.result = result.payload;
        delete current.error;
        delete current.errorCode;
        delete current.httpStatus;
      } else {
        current.status = 'FAILED';
        current.error = retryableFailure
          ? 'ระบบประมวลผลไม่สำเร็จหลังจากลองใหม่แล้ว กรุณาลองอีกครั้งภายหลัง'
          : result.error;
        current.errorCode = retryableFailure
          ? 'job_retry_exhausted'
          : result.code;
        current.httpStatus = result.status;
        current.lastError = technicalError instanceof Error ? technicalError.message : result.error;
        current.lastErrorCode = result.code;
        if (retryableFailure) current.deadLetteredAtMs = Date.now();
      }
      if (!(await this.writeStrictUnlessCancelled(current))) return;
      await this.clearHeartbeat(jobId);
      if (current.deadLetteredAtMs) await this.deadLetter(current);
      await this.cleanupTerminalPayload(current);
      console.log(`🧾 Job [${ns}] ${jobId}: ${current.status}`);
    } catch (error) {
      if (deliveryCount >= maxDeliveries && error instanceof RetryableJobError) {
        // Returning only after this durable terminal write makes Vercel Queue
        // acknowledge the final delivery. If Redis persistence fails, the
        // error escapes and Queue keeps the message for recovery.
        await this.persistDeliveryExhausted(jobId, error.code);
        return;
      }
      throw error;
    } finally {
      await this.releaseCapacity(capacityLease);
      await this.releaseProcessLock(jobId, lockToken);
    }
  }

  // -------------------------------------------------------------------------
  // Dispatch
  // -------------------------------------------------------------------------

  getDispatchMode(): JobDispatchMode {
    const configured = (
      process.env.JOB_DISPATCHER ||
      (this.config.legacyDispatcherEnv ? process.env[this.config.legacyDispatcherEnv] : '') ||
      ''
    ).trim().toLowerCase();

    if (configured === 'vercel' || configured === 'vercel_queue') {
      return 'vercel';
    }
    if (configured === 'qstash') {
      if (process.env.QSTASH_TOKEN && this.getBaseUrl() && this.getWorkerSecret()) {
        return 'qstash';
      }
      console.warn(
        `⚠️ Job queue [${this.config.namespace}]: JOB_DISPATCHER=qstash but QSTASH_TOKEN / base URL / worker secret missing — falling back to waituntil`
      );
    }
    if (configured === 'waituntil') {
      if (process.env.VERCEL_ENV === 'production') {
        console.warn(
          `⚠️ Job queue [${this.config.namespace}]: waituntil is disabled in production — using Vercel Queues`
        );
        return 'vercel';
      }
      return 'waituntil';
    }

    // Vercel Queues is the production/default dispatcher on Vercel. Local
    // `next dev` keeps the zero-config after() path; `vercel dev` can opt into
    // the real queue explicitly with JOB_DISPATCHER=vercel.
    if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) {
      return 'vercel';
    }
    return 'waituntil';
  }

  async dispatchViaVercel(jobId: string, request: Req): Promise<string | null> {
    const topic = typeof this.config.vercelTopic === 'function'
      ? this.config.vercelTopic(request)
      : this.config.vercelTopic;
    if (!topic) throw new Error(`Vercel Queue topic missing for ${this.config.namespace}`);

    // Keep queue messages tiny and non-sensitive. The full request stays in
    // Redis or private Blob; the Queue receives only an opaque UUID and schema
    // version (never image URLs/bytes or customer data).
    try {
      const result = await sendVercelQueue(
        topic,
        { jobId, schemaVersion: 1 },
        {
          idempotencyKey: `${this.config.namespace}:${jobId}`,
          retentionSeconds: DEFAULT_QUEUE_RETENTION_SECONDS,
        }
      );
      return result.messageId;
    } catch (error) {
      // A client may retry enqueue after the 202 response was lost. The same
      // job/message idempotency key means Vercel already durably accepted it;
      // treating that as dispatch failure would incorrectly kill a live job.
      if (error instanceof DuplicateMessageError) return null;
      throw error;
    }
  }

  // Resolves the public callback base URL for QStash. Loopback candidates are
  // skipped (QStash rejects them with "resolves to a loopback address"), and
  // on Vercel we fall back to the platform-provided production/deployment URL
  // automatically, so a misconfigured NEXT_PUBLIC_BASE_URL can't break dispatch.
  private getBaseUrl(): string | null {
    const candidates = [
      process.env.JOB_CALLBACK_BASE_URL,
      process.env.ESTIMATE_JOB_CALLBACK_BASE_URL,
      process.env.NEXT_PUBLIC_BASE_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    ];
    for (const raw of candidates) {
      if (!raw) continue;
      const base = raw.trim().replace(/\/$/, '');
      if (!/^https?:\/\//.test(base)) continue;
      if (/\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)([:/]|$)/i.test(base)) {
        console.warn(`⚠️ Job queue [${this.config.namespace}]: skipping loopback callback URL ${base}`);
        continue;
      }
      return base;
    }
    return null;
  }

  getWorkerSecret(): string | undefined {
    return (
      process.env.JOB_WORKER_SECRET ||
      (this.config.legacyWorkerSecretEnv ? process.env[this.config.legacyWorkerSecretEnv] : undefined) ||
      undefined
    );
  }

  // Publishes the job to Upstash QStash, which POSTs { jobId } to processPath
  // with automatic retries. Worker auth is a shared secret forwarded via
  // Upstash-Forward-*.
  async dispatchViaQstash(jobId: string): Promise<void> {
    const token = process.env.QSTASH_TOKEN;
    const base = this.getBaseUrl();
    const secret = this.getWorkerSecret();
    if (!token || !base) throw new Error('QStash not configured');
    if (!secret) throw new Error('Job worker secret not configured');

    const destination = `${base}${this.config.processPath}`;
    const response = await fetch(`https://qstash.upstash.io/v2/publish/${destination}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upstash-Retries': '2',
        'Upstash-Forward-X-Job-Worker-Secret': secret,
      },
      body: JSON.stringify({ jobId }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`QStash publish failed (${response.status})`);
    }
  }
}
