'use client';

// Generic client-side job runner: enqueue → poll until terminal, with the
// same spinner/cancel UX as a plain request. Shared by the estimate and
// condition job clients. Production never bypasses queue backpressure with a
// synchronous retry; local development keeps that convenience fallback.

import axios from 'axios';
import liff from '@line/liff';

export interface RunJobConfig {
  enqueueUrl: string;
  statusUrl: (jobId: string) => string;
  cancelUrl: (jobId: string) => string;
  syncUrl: string;
  payload: unknown;
  signal?: AbortSignal;
  firstPollDelayMs?: number;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onStatus?: (status: any) => void;
}

const DEFAULT_FIRST_POLL_DELAY_MS = 2000; // cache hits complete in ~1-2s
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

function abortError(): Error {
  const error = new Error('canceled');
  error.name = 'AbortError';
  return error;
}

// Shapes an error like an axios error so existing catch blocks keep reading
// error.response.data.error and showing their Thai messages.
function jobError(message: string, code?: string | null): Error {
  const error: any = new Error(message);
  error.isJobError = true;
  error.response = { data: { error: message, ...(code ? { code } : {}) } };
  return error;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

function liffAuthHeaders(): Record<string, string> {
  try {
    const idToken = liff.getIDToken();
    return idToken ? { Authorization: `Bearer ${idToken}` } : {};
  } catch {
    return {};
  }
}

async function cancelJobQuietly(
  cancelUrl: string,
  headers: Record<string, string>
): Promise<void> {
  try {
    await axios.post(cancelUrl, undefined, { headers });
  } catch {
    // best-effort
  }
}

export async function runJob<T>(config: RunJobConfig): Promise<T> {
  const {
    enqueueUrl,
    statusUrl,
    cancelUrl,
    syncUrl,
    payload,
    signal,
    firstPollDelayMs = DEFAULT_FIRST_POLL_DELAY_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onStatus,
  } = config;
  const headers = liffAuthHeaders();
  const idempotencyKey = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let jobId: string;
  try {
    const enqueue = await axios.post(enqueueUrl, payload, {
      signal,
      headers: { ...headers, 'Idempotency-Key': idempotencyKey },
    });
    jobId = enqueue.data?.jobId;
    if (!jobId) throw jobError('เกิดข้อผิดพลาดในการเข้าคิวประมวลผล');
  } catch (error: any) {
    if (error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') throw error;
    // Local-only convenience. Production preserves queue backpressure instead
    // of multiplying load against an already rate-limited provider.
    if (error?.response?.status === 503 && process.env.NODE_ENV !== 'production') {
      const direct = await axios.post(syncUrl, payload, { signal, headers });
      return direct.data as T;
    }
    throw error;
  }

  const jobStatusUrl = statusUrl(jobId);
  const jobCancelUrl = cancelUrl(jobId);
  const startedAt = Date.now();

  await sleep(firstPollDelayMs, signal).catch(async (err) => {
    await cancelJobQuietly(jobCancelUrl, headers);
    throw err;
  });

  for (;;) {
    if (signal?.aborted) {
      void cancelJobQuietly(jobCancelUrl, headers);
      throw abortError();
    }

    let status: any;
    try {
      const response = await axios.get(jobStatusUrl, { signal, headers });
      status = response.data;
      onStatus?.(status);
    } catch (error: any) {
      if (error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') {
        void cancelJobQuietly(jobCancelUrl, headers);
        throw error;
      }
      const httpStatus = Number(error?.response?.status || 0);
      const retryable = httpStatus === 0
        || httpStatus === 408
        || httpStatus === 425
        || httpStatus === 429
        || httpStatus >= 500;
      if (!retryable) {
        const message = error?.response?.data?.error
          || 'ไม่สามารถตรวจสอบสถานะงานได้ กรุณาเข้าสู่ระบบใหม่';
        throw jobError(message, error?.response?.data?.code || 'job_status_unavailable');
      }
      // A network blip, timeout, rate limit, or provider 5xx is transient.
      // Preserve the queued job and retry polling until the overall timeout.
      status = null;
    }

    if (status) {
      if (status.status === 'COMPLETED' && status.result) {
        const result = status.result;
        return (
          result && typeof result === 'object' && !Array.isArray(result)
            ? { ...result, jobId }
            : result
        ) as T;
      }
      if (status.status === 'FAILED') {
        throw jobError(status.error || 'เกิดข้อผิดพลาดในการประมวลผล', status.code);
      }
      if (status.status === 'CANCELLED') {
        throw abortError();
      }
    }

    if (Date.now() - startedAt > timeoutMs) {
      void cancelJobQuietly(jobCancelUrl, headers);
      throw jobError('การประมวลผลใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง', 'job_client_timeout');
    }

    const nextPollMs = Number(status?.pollAfterMs);
    const safePollMs = Number.isFinite(nextPollMs)
      ? Math.min(30_000, Math.max(1_000, nextPollMs))
      : pollIntervalMs;
    await sleep(safePollMs, signal).catch((err) => {
      void cancelJobQuietly(jobCancelUrl, headers);
      throw err;
    });
  }
}
