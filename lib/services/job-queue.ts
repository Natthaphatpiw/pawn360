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

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type JobRunResult<Res> =
  | { ok: true; payload: Res }
  | { ok: false; status: number; error: string; code?: string };

export interface JobRecord<Req, Res> {
  jobId: string;
  status: JobStatus;
  createdAtMs: number;
  startedAtMs?: number;
  heartbeatAtMs?: number;
  finishedAtMs?: number;
  attempts: number;
  lineId?: string;
  request: Req;
  result?: Res;
  error?: string;
  errorCode?: string;
  httpStatus?: number;
}

export type JobDispatchMode = 'waituntil' | 'qstash';

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

export class JobQueue<Req, Res> {
  private redisClient: Redis | null | undefined;
  private readonly ttlSeconds: number;
  private readonly staleMs: number;
  private readonly giveUpMs: number;
  private readonly heartbeatIntervalMs: number;

  constructor(private readonly config: JobQueueConfig<Req, Res>) {
    this.ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.staleMs = config.staleMs ?? DEFAULT_STALE_MS;
    this.giveUpMs = Math.max(config.giveUpMs ?? DEFAULT_GIVEUP_MS, this.staleMs);
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
    const hasUrl = Boolean(process.env.KV_REST_API_URL);
    const hasToken = Boolean(process.env.KV_REST_API_TOKEN);
    if (!hasUrl || !hasToken) {
      this.redisClient = null;
      return this.redisClient;
    }
    try {
      this.redisClient = Redis.fromEnv();
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

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async create(request: Req): Promise<JobRecord<Req, Res> | null> {
    const job: JobRecord<Req, Res> = {
      jobId: crypto.randomUUID(),
      status: 'QUEUED',
      createdAtMs: Date.now(),
      attempts: 0,
      lineId: this.config.getLineId?.(request),
      request,
    };
    const ok = await this.write(job);
    return ok ? job : null;
  }

  // Returns the job with stale-PROCESSING detection applied: a run that died
  // mid-flight becomes FAILED so pollers get a clean terminal state.
  async get(jobId: string): Promise<JobRecord<Req, Res> | null> {
    const job = await this.read(jobId);
    if (!job) return null;
    // Only give up on a job that has stopped beating for giveUpMs — a live but
    // slow run keeps its heartbeat fresh and is never failed here.
    if (job.status === 'PROCESSING' && Date.now() - this.lastBeatMs(job) > this.giveUpMs) {
      job.status = 'FAILED';
      job.error = this.config.timeoutMessage || 'งานใช้เวลานานผิดปกติและถูกยกเลิก กรุณาลองใหม่อีกครั้ง';
      job.errorCode = 'job_timeout';
      job.finishedAtMs = Date.now();
      await this.write(job);
    }
    return job;
  }

  async cancel(jobId: string): Promise<JobRecord<Req, Res> | null> {
    const job = await this.read(jobId);
    if (!job) return null;
    if (job.status === 'QUEUED' || job.status === 'PROCESSING') {
      job.status = 'CANCELLED';
      job.finishedAtMs = Date.now();
      await this.write(job);
    }
    return job;
  }

  // Claim for processing. QUEUED always claimable; PROCESSING claimable only
  // when stale (lets a QStash retry rescue a crashed run). Read-modify-write —
  // dispatch paths make concurrent claims rare, and a double claim merely
  // wastes one duplicate run.
  private async claim(jobId: string): Promise<JobRecord<Req, Res> | null> {
    const job = await this.read(jobId);
    if (!job) return null;
    // A live run beats every heartbeatIntervalMs; only re-claim a PROCESSING
    // job that has gone silent for staleMs (crashed), never one still beating.
    const stale =
      job.status === 'PROCESSING' && Date.now() - this.lastBeatMs(job) > this.staleMs;
    if (job.status !== 'QUEUED' && !stale) return null;
    const now = Date.now();
    job.status = 'PROCESSING';
    job.startedAtMs = now;
    job.heartbeatAtMs = now;
    job.attempts = (job.attempts || 0) + 1;
    const ok = await this.write(job);
    return ok ? job : null;
  }

  // Refreshes a running job's heartbeat. Never resurrects a terminal/cancelled
  // job (guarded on status === PROCESSING).
  private async beat(jobId: string): Promise<void> {
    const job = await this.read(jobId);
    if (!job || job.status !== 'PROCESSING') return;
    job.heartbeatAtMs = Date.now();
    await this.write(job);
  }

  async process(jobId: string): Promise<void> {
    const ns = this.config.namespace;
    const job = await this.claim(jobId);
    if (!job) {
      console.log(`🧾 Job [${ns}] ${jobId}: not claimable (already processed/cancelled)`);
      return;
    }

    console.log(`🧾 Job [${ns}] ${jobId}: processing (attempt ${job.attempts})`);
    // Heartbeat while run() is in flight so a live-but-slow job is never
    // re-claimed or failed, while a crashed one stops beating and becomes
    // re-claimable within staleMs.
    const heartbeat = setInterval(() => {
      void this.beat(jobId).catch(() => {});
    }, this.heartbeatIntervalMs);
    let result: JobRunResult<Res>;
    try {
      result = await this.config.run(job.request);
    } catch (error: any) {
      // run() is supposed to never reject, but guard anyway so a thrown error
      // becomes a terminal FAILED job rather than a stuck PROCESSING one.
      console.error(`🧾 Job [${ns}] ${jobId}: run threw:`, error);
      result = { ok: false, status: 500, error: 'เกิดข้อผิดพลาดในการประมวลผล' };
    } finally {
      clearInterval(heartbeat);
    }

    // Re-read: the user may have cancelled while run() was in flight. A
    // cancelled job keeps CANCELLED (the pipeline's own cache writes still
    // happened, so the work isn't wasted for the next request).
    const current = await this.read(jobId);
    if (!current || current.status === 'CANCELLED') {
      console.log(`🧾 Job [${ns}] ${jobId}: cancelled during processing — result discarded`);
      return;
    }

    current.finishedAtMs = Date.now();
    if (result.ok) {
      current.status = 'COMPLETED';
      current.result = result.payload;
      delete current.error;
      delete current.errorCode;
      delete current.httpStatus;
    } else {
      current.status = 'FAILED';
      current.error = result.error;
      current.errorCode = result.code;
      current.httpStatus = result.status;
    }
    await this.write(current);
    console.log(`🧾 Job [${ns}] ${jobId}: ${current.status}`);
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
    if (configured === 'qstash') {
      if (process.env.QSTASH_TOKEN && this.getBaseUrl() && this.getWorkerSecret()) {
        return 'qstash';
      }
      console.warn(
        `⚠️ Job queue [${this.config.namespace}]: JOB_DISPATCHER=qstash but QSTASH_TOKEN / base URL / worker secret missing — falling back to waituntil`
      );
    }
    return 'waituntil';
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
    });
    if (!response.ok) {
      throw new Error(`QStash publish failed: ${response.status} ${await response.text().catch(() => '')}`);
    }
  }
}
