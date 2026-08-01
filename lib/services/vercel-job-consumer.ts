import { RetryableJobError } from '@/lib/services/job-queue';

export const JOB_APP_MAX_DELIVERIES = 8;

export interface VercelJobMessage {
  jobId: string;
  schemaVersion: 1;
}

export function parseVercelJobMessage(value: unknown): VercelJobMessage | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<VercelJobMessage>;
  if (
    candidate.schemaVersion !== 1
    || typeof candidate.jobId !== 'string'
    || !/^[0-9a-f-]{16,64}$/i.test(candidate.jobId)
  ) {
    return null;
  }
  return candidate as VercelJobMessage;
}

export function queueRetryDirective(error: unknown, deliveryCount: number) {
  if (error instanceof RetryableJobError) {
    return { afterSeconds: Math.max(5, Math.min(300, error.retryAfterSeconds)) } as const;
  }
  const exponent = Math.max(0, Math.min(6, deliveryCount - 1));
  const base = Math.min(300, 5 * (2 ** exponent));
  return { afterSeconds: Math.max(5, Math.round(base * (0.5 + Math.random()))) } as const;
}
