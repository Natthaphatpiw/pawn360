import { DuplicateMessageError, send } from '@vercel/queue';
import { EkycQueueMessage } from '@/lib/ekyc/types';

export const EKYC_QUEUE_TOPIC = 'ekyc-webhook-events';
// Keep normal delivery bounded to one day. Vercel Queues supports up to seven
// days of retention, while idempotency de-duplication is capped at 24 hours.
// The durable database inbox/outbox remains the long-lived recovery source.
const QUEUE_RETENTION_SECONDS = 24 * 60 * 60;

export interface EkycQueuePublishResult {
  messageId: string | null;
  duplicate: boolean;
}

export async function enqueueEkycWebhookEvent(
  eventId: string,
  eventKey: string,
  generation: number,
): Promise<EkycQueuePublishResult> {
  const message: EkycQueueMessage = { kind: 'PROCESS_WEBHOOK', eventId, generation };
  try {
    const result = await send(EKYC_QUEUE_TOPIC, message, {
      idempotencyKey: `ekyc-webhook-${eventKey}-g${generation}`,
      retentionSeconds: QUEUE_RETENTION_SECONDS,
    });
    return { messageId: result.messageId, duplicate: false };
  } catch (error) {
    // A duplicate for this exact generation proves that Vercel already
    // accepted the corresponding outbox dispatch.
    if (error instanceof DuplicateMessageError) return { messageId: null, duplicate: true };
    throw error;
  }
}

export async function enqueueEkycNotification(
  eventId: string,
  eventKey: string,
  generation: number,
): Promise<EkycQueuePublishResult> {
  const message: EkycQueueMessage = { kind: 'SEND_NOTIFICATION', eventId, generation };
  try {
    const result = await send(EKYC_QUEUE_TOPIC, message, {
      idempotencyKey: `ekyc-notification-${eventKey}-g${generation}`,
      retentionSeconds: QUEUE_RETENTION_SECONDS,
    });
    return { messageId: result.messageId, duplicate: false };
  } catch (error) {
    if (error instanceof DuplicateMessageError) return { messageId: null, duplicate: true };
    throw error;
  }
}
