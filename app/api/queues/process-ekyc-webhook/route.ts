import { handleCallback } from '@vercel/queue';
import { processEkycQueueMessage } from '@/lib/ekyc/webhook-processor';
import { LinePushError } from '@/lib/line/push-text';

export const POST = handleCallback(
  async (message, metadata) => {
    await processEkycQueueMessage(message, metadata.deliveryCount);
  },
  {
    visibilityTimeoutSeconds: 60,
    retry: (error, metadata) => ({
      afterSeconds: error instanceof LinePushError && error.retryAfterSeconds
        ? error.retryAfterSeconds
        : Math.min(300, Math.max(5, 2 ** Math.min(metadata.deliveryCount, 6) * 5)),
    }),
  },
);
