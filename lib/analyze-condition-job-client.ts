// Client helper for the async condition-scoring job queue.
// Enqueues + polls via the shared runJob helper, with sync fallback.

import type { ConditionResult } from '@/lib/services/analyze-condition-pipeline';
import { runJob } from '@/lib/job-poll-client';

export async function runAnalyzeConditionJob(
  conditionData: unknown,
  signal?: AbortSignal
): Promise<ConditionResult> {
  return runJob<ConditionResult>({
    enqueueUrl: '/api/analyze-condition/jobs',
    statusUrl: (id) => `/api/analyze-condition/jobs/${id}`,
    cancelUrl: (id) => `/api/analyze-condition/jobs/${id}/cancel`,
    syncUrl: '/api/analyze-condition',
    payload: conditionData,
    signal,
  });
}
