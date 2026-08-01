import { handleCallback } from '@vercel/queue';
import { processEstimateJob } from '@/lib/services/estimate-jobs';
import {
  JOB_APP_MAX_DELIVERIES,
  parseVercelJobMessage,
  queueRetryDirective,
} from '@/lib/services/vercel-job-consumer';

export const maxDuration = 300;
export const runtime = 'nodejs';

export const POST = handleCallback(
  async (message, metadata) => {
    const parsed = parseVercelJobMessage(message);
    if (!parsed) {
      console.error('Invalid notebook estimate queue message', { messageId: metadata.messageId });
      return;
    }
    await processEstimateJob(parsed.jobId, {
      deliveryCount: metadata.deliveryCount,
      maxDeliveries: JOB_APP_MAX_DELIVERIES,
    });
  },
  {
    visibilityTimeoutSeconds: 300,
    retry: (error, metadata) => queueRetryDirective(error, metadata.deliveryCount),
  }
);
