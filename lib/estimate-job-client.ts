// Client helper for the async estimate job queue (ESTIMATE_JOB_QUEUE.md).
// Enqueues + polls via the shared runJob helper, with sync fallback.

import type { EstimateResponse } from '@/lib/services/estimate-pipeline';
import { runJob } from '@/lib/job-poll-client';

export async function runEstimateJob(estimateData: unknown, signal?: AbortSignal): Promise<EstimateResponse> {
  return runJob<EstimateResponse>({
    enqueueUrl: '/api/estimate/jobs',
    statusUrl: (id) => `/api/estimate/jobs/${id}`,
    cancelUrl: (id) => `/api/estimate/jobs/${id}/cancel`,
    syncUrl: '/api/estimate',
    payload: estimateData,
    signal,
  });
}
