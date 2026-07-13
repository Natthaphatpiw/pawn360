// Client helper for the async estimate job queue (ESTIMATE_JOB_QUEUE.md).
//
// Enqueues via POST /api/estimate/jobs then polls GET /api/estimate/jobs/[id]
// until a terminal state. Errors are shaped like axios errors
// ({ response: { data: { error } } }) so existing catch blocks keep showing
// their Thai messages. Falls back to the synchronous /api/estimate when the
// queue is unavailable (503), so a missing Redis never blocks estimates.

import axios from 'axios';
import type { EstimateResponse } from '@/lib/services/estimate-pipeline';

const FIRST_POLL_DELAY_MS = 2000; // cache hits complete in ~1-2s
const POLL_INTERVAL_MS = 5000;
const JOB_CLIENT_TIMEOUT_MS = 5 * 60 * 1000;

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

function abortError(): Error {
  const error = new Error('canceled');
  error.name = 'AbortError';
  return error;
}

function jobError(message: string, code?: string | null): Error {
  const error: any = new Error(message);
  error.isEstimateJobError = true;
  error.response = { data: { error: message, ...(code ? { code } : {}) } };
  return error;
}

async function cancelJobQuietly(jobId: string): Promise<void> {
  try {
    await axios.post(`/api/estimate/jobs/${jobId}/cancel`);
  } catch {
    // best-effort
  }
}

export async function runEstimateJob(estimateData: unknown, signal?: AbortSignal): Promise<EstimateResponse> {
  let jobId: string;
  try {
    const enqueue = await axios.post('/api/estimate/jobs', estimateData, { signal });
    jobId = enqueue.data?.jobId;
    if (!jobId) throw jobError('เกิดข้อผิดพลาดในการเข้าคิวประเมินราคา');
  } catch (error: any) {
    if (error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') throw error;
    // Queue unavailable (e.g. Redis not configured) → synchronous fallback.
    if (error?.response?.status === 503) {
      const direct = await axios.post('/api/estimate', estimateData, { signal });
      return direct.data;
    }
    throw error;
  }

  const startedAt = Date.now();
  await sleep(FIRST_POLL_DELAY_MS, signal).catch(async (err) => {
    await cancelJobQuietly(jobId);
    throw err;
  });

  for (;;) {
    if (signal?.aborted) {
      void cancelJobQuietly(jobId);
      throw abortError();
    }

    let status: any;
    try {
      const response = await axios.get(`/api/estimate/jobs/${jobId}`, { signal });
      status = response.data;
    } catch (error: any) {
      if (error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') {
        void cancelJobQuietly(jobId);
        throw error;
      }
      // Transient poll failure (network blip) — keep polling until timeout.
      status = null;
    }

    if (status) {
      if (status.status === 'COMPLETED' && status.result) {
        return status.result as EstimateResponse;
      }
      if (status.status === 'FAILED') {
        throw jobError(status.error || 'เกิดข้อผิดพลาดในการประเมินราคา', status.code);
      }
      if (status.status === 'CANCELLED') {
        throw abortError();
      }
    }

    if (Date.now() - startedAt > JOB_CLIENT_TIMEOUT_MS) {
      void cancelJobQuietly(jobId);
      throw jobError('การประเมินใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง', 'job_client_timeout');
    }

    await sleep(POLL_INTERVAL_MS, signal).catch((err) => {
      void cancelJobQuietly(jobId);
      throw err;
    });
  }
}
