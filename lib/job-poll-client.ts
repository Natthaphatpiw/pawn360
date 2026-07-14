// Generic client-side job runner: enqueue → poll until terminal, with the
// same spinner/cancel UX as a plain request. Shared by the estimate and
// condition job clients. Falls back to a synchronous endpoint when the queue
// is unavailable (503) so a missing Redis never blocks the user.

import axios from 'axios';

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
}

const DEFAULT_FIRST_POLL_DELAY_MS = 2000; // cache hits complete in ~1-2s
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

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

async function cancelJobQuietly(cancelUrl: string): Promise<void> {
  try {
    await axios.post(cancelUrl);
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
  } = config;

  let jobId: string;
  try {
    const enqueue = await axios.post(enqueueUrl, payload, { signal });
    jobId = enqueue.data?.jobId;
    if (!jobId) throw jobError('เกิดข้อผิดพลาดในการเข้าคิวประมวลผล');
  } catch (error: any) {
    if (error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') throw error;
    // Queue unavailable (e.g. Redis not configured) → synchronous fallback.
    if (error?.response?.status === 503) {
      const direct = await axios.post(syncUrl, payload, { signal });
      return direct.data as T;
    }
    throw error;
  }

  const jobStatusUrl = statusUrl(jobId);
  const jobCancelUrl = cancelUrl(jobId);
  const startedAt = Date.now();

  await sleep(firstPollDelayMs, signal).catch(async (err) => {
    await cancelJobQuietly(jobCancelUrl);
    throw err;
  });

  for (;;) {
    if (signal?.aborted) {
      void cancelJobQuietly(jobCancelUrl);
      throw abortError();
    }

    let status: any;
    try {
      const response = await axios.get(jobStatusUrl, { signal });
      status = response.data;
    } catch (error: any) {
      if (error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') {
        void cancelJobQuietly(jobCancelUrl);
        throw error;
      }
      // Transient poll failure (network blip) — keep polling until timeout.
      status = null;
    }

    if (status) {
      if (status.status === 'COMPLETED' && status.result) {
        return status.result as T;
      }
      if (status.status === 'FAILED') {
        throw jobError(status.error || 'เกิดข้อผิดพลาดในการประมวลผล', status.code);
      }
      if (status.status === 'CANCELLED') {
        throw abortError();
      }
    }

    if (Date.now() - startedAt > timeoutMs) {
      void cancelJobQuietly(jobCancelUrl);
      throw jobError('การประมวลผลใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง', 'job_client_timeout');
    }

    await sleep(pollIntervalMs, signal).catch((err) => {
      void cancelJobQuietly(jobCancelUrl);
      throw err;
    });
  }
}
