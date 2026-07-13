// Estimate job queue (see ESTIMATE_JOB_QUEUE.md).
//
// Why: a live estimate takes ~1-2 minutes (web search + LLMs). Instead of
// holding one HTTP request open that long, the UI enqueues a job, gets a
// jobId back immediately, and polls GET /api/estimate/jobs/[jobId].
//
// Job state lives in Upstash Redis (already required for the estimate cache)
// under a TTL — no schema, no cleanup cron. Two dispatcher modes:
//   - 'waituntil' (default): the enqueue route processes the job after
//     responding, via Next's after(). Zero external dependencies.
//   - 'qstash'  (ESTIMATE_JOB_DISPATCHER=qstash + QSTASH_TOKEN): publishes to
//     Upstash QStash, which calls POST /api/estimate/jobs/process with
//     retries — survives function crashes/redeploys mid-run.

import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import {
  EstimateRequest,
  EstimateResponse,
  runEstimatePipeline,
} from '@/lib/services/estimate-pipeline';

export type EstimateJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface EstimateJobRecord {
  jobId: string;
  status: EstimateJobStatus;
  createdAtMs: number;
  startedAtMs?: number;
  finishedAtMs?: number;
  attempts: number;
  lineId?: string;
  request: EstimateRequest;
  result?: EstimateResponse;
  error?: string;
  errorCode?: string;
  httpStatus?: number;
}

const JOB_KEY_PREFIX = 'estimate:job:v1:';
const JOB_TTL_SECONDS = 2 * 60 * 60; // jobs are transient — 2h is plenty
// A PROCESSING job with no heartbeat for this long is considered dead
// (function crashed / suspended); status polling reports it FAILED and a
// QStash retry may re-claim it.
export const ESTIMATE_JOB_STALE_MS = 6 * 60 * 1000;

let redisClient: Redis | null | undefined;

function getJobRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const hasUrl = Boolean(process.env.KV_REST_API_URL);
  const hasToken = Boolean(process.env.KV_REST_API_TOKEN);
  if (!hasUrl || !hasToken) {
    redisClient = null;
    return redisClient;
  }
  try {
    redisClient = Redis.fromEnv();
  } catch (error) {
    console.warn('⚠️ Estimate jobs: failed to init Redis client:', error);
    redisClient = null;
  }
  return redisClient;
}

export function isEstimateJobStoreAvailable(): boolean {
  return getJobRedis() !== null;
}

const jobKey = (jobId: string) => `${JOB_KEY_PREFIX}${jobId}`;

async function readJob(jobId: string): Promise<EstimateJobRecord | null> {
  const redis = getJobRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<EstimateJobRecord>(jobKey(jobId));
    return raw && typeof raw === 'object' && raw.jobId ? raw : null;
  } catch (error) {
    console.warn('⚠️ Estimate jobs: read failed:', error);
    return null;
  }
}

async function writeJob(job: EstimateJobRecord): Promise<boolean> {
  const redis = getJobRedis();
  if (!redis) return false;
  try {
    await redis.set(jobKey(job.jobId), job, { ex: JOB_TTL_SECONDS });
    return true;
  } catch (error) {
    console.warn('⚠️ Estimate jobs: write failed:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function createEstimateJob(request: EstimateRequest): Promise<EstimateJobRecord | null> {
  const job: EstimateJobRecord = {
    jobId: crypto.randomUUID(),
    status: 'QUEUED',
    createdAtMs: Date.now(),
    attempts: 0,
    lineId: request.lineId,
    request,
  };
  const ok = await writeJob(job);
  return ok ? job : null;
}

// Returns the job with stale-PROCESSING detection applied: a run that died
// mid-flight becomes FAILED so pollers get a clean terminal state.
export async function getEstimateJob(jobId: string): Promise<EstimateJobRecord | null> {
  const job = await readJob(jobId);
  if (!job) return null;
  if (
    job.status === 'PROCESSING' &&
    job.startedAtMs &&
    Date.now() - job.startedAtMs > ESTIMATE_JOB_STALE_MS
  ) {
    job.status = 'FAILED';
    job.error = 'การประเมินใช้เวลานานผิดปกติและถูกยกเลิก กรุณาลองใหม่อีกครั้ง';
    job.errorCode = 'job_timeout';
    job.finishedAtMs = Date.now();
    await writeJob(job);
  }
  return job;
}

// Claim for processing. QUEUED always claimable; PROCESSING claimable only
// when stale (lets a QStash retry rescue a crashed run). Read-modify-write —
// the dispatch paths make concurrent claims rare, and a double claim merely
// wastes one duplicate pipeline run.
async function claimEstimateJob(jobId: string): Promise<EstimateJobRecord | null> {
  const job = await readJob(jobId);
  if (!job) return null;
  const stale =
    job.status === 'PROCESSING' &&
    job.startedAtMs !== undefined &&
    Date.now() - job.startedAtMs > ESTIMATE_JOB_STALE_MS;
  if (job.status !== 'QUEUED' && !stale) return null;
  job.status = 'PROCESSING';
  job.startedAtMs = Date.now();
  job.attempts = (job.attempts || 0) + 1;
  const ok = await writeJob(job);
  return ok ? job : null;
}

export async function cancelEstimateJob(jobId: string): Promise<EstimateJobRecord | null> {
  const job = await readJob(jobId);
  if (!job) return null;
  if (job.status === 'QUEUED' || job.status === 'PROCESSING') {
    job.status = 'CANCELLED';
    job.finishedAtMs = Date.now();
    await writeJob(job);
  }
  return job;
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

export async function processEstimateJob(jobId: string): Promise<void> {
  const job = await claimEstimateJob(jobId);
  if (!job) {
    console.log(`🧾 Estimate job ${jobId}: not claimable (already processed/cancelled)`);
    return;
  }

  console.log(`🧾 Estimate job ${jobId}: processing (attempt ${job.attempts})`);
  const result = await runEstimatePipeline(job.request);

  // Re-read: the user may have cancelled while the pipeline ran. A cancelled
  // job keeps its CANCELLED status (the pipeline's cache write still happened,
  // so the work isn't wasted for the next request).
  const current = await readJob(jobId);
  if (!current || current.status === 'CANCELLED') {
    console.log(`🧾 Estimate job ${jobId}: cancelled during processing — result discarded`);
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
  await writeJob(current);
  console.log(`🧾 Estimate job ${jobId}: ${current.status}`);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export type EstimateJobDispatchMode = 'waituntil' | 'qstash';

export function getEstimateJobDispatchMode(): EstimateJobDispatchMode {
  const configured = (process.env.ESTIMATE_JOB_DISPATCHER || '').trim().toLowerCase();
  if (configured === 'qstash') {
    if (process.env.QSTASH_TOKEN && getEstimateJobBaseUrl()) return 'qstash';
    console.warn('⚠️ ESTIMATE_JOB_DISPATCHER=qstash but QSTASH_TOKEN / base URL missing — falling back to waituntil');
  }
  return 'waituntil';
}

function getEstimateJobBaseUrl(): string | null {
  const base = process.env.ESTIMATE_JOB_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
  return /^https?:\/\//.test(base) ? base.replace(/\/$/, '') : null;
}

// Publishes the job to Upstash QStash, which will POST { jobId } to our
// /api/estimate/jobs/process endpoint with automatic retries. Auth on the
// worker side is a shared secret forwarded via Upstash-Forward-*.
export async function dispatchEstimateJobViaQstash(jobId: string): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  const base = getEstimateJobBaseUrl();
  if (!token || !base) throw new Error('QStash not configured');
  const secret = process.env.ESTIMATE_JOB_WORKER_SECRET;
  if (!secret) throw new Error('ESTIMATE_JOB_WORKER_SECRET not configured');

  const destination = `${base}/api/estimate/jobs/process`;
  const response = await fetch(`https://qstash.upstash.io/v2/publish/${destination}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Upstash-Retries': '2',
      'Upstash-Forward-X-Estimate-Worker-Secret': secret,
    },
    body: JSON.stringify({ jobId }),
  });
  if (!response.ok) {
    throw new Error(`QStash publish failed: ${response.status} ${await response.text().catch(() => '')}`);
  }
}
