export type EkycActorType = 'PAWNER' | 'INVESTOR';

export type EkycDatabaseStatus = 'NOT_VERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

export type EkycWebhookEventType =
  | 'submit_form'
  | 'update_status'
  | 'drop_off'
  | 'ekyc_front_card_reached_max_attempts'
  | 'ekyc_liveness_reached_max_attempt';

export type EkycQueueMessage =
  | { kind: 'PROCESS_WEBHOOK'; eventId: string; generation: number }
  | { kind: 'SEND_NOTIFICATION'; eventId: string; generation: number };

export interface StoredEkycWebhookEvent {
  id: string;
  event_key: string;
  actor_type: EkycActorType;
  event_type: EkycWebhookEventType;
  uppass_slug: string;
  application_status: string | null;
  ekyc_status: string | null;
  provider_event_at: string | null;
  received_at: string;
  target_status: EkycDatabaseStatus | null;
  processing_status: 'RECEIVED' | 'QUEUED' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'DEAD_LETTER';
  processing_generation: number;
  processing_attempts: number;
  notification_status: 'NOT_REQUIRED' | 'PENDING' | 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
  notification_generation: number;
  notification_attempts: number;
  last_error_code: string | null;
  updated_at: string;
}

export class EkycPublicError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly publicMessage: string,
    public readonly retryable = false,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = 'EkycPublicError';
  }
}

export class PermanentEkycEventError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'PermanentEkycEventError';
  }
}
