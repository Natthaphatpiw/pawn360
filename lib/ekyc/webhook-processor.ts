import { enqueueEkycNotification } from '@/lib/ekyc/queue';
import {
  EkycDatabaseStatus,
  EkycQueueMessage,
  PermanentEkycEventError,
  StoredEkycWebhookEvent,
} from '@/lib/ekyc/types';
import { getActorDatabaseConfig } from '@/lib/ekyc/config';
import { LinePushError, pushLineTextMessage } from '@/lib/line/push-text';
import { supabaseAdmin } from '@/lib/supabase/client';

const MAX_PROCESSING_DELIVERIES = 8;
const MAX_NOTIFICATION_DELIVERIES = 6;
const LINE_TIMEOUT_MS = 10_000;
// Longer than the 60-second Queue function duration. A reclaimed lease cannot
// overlap a still-running Vercel invocation under the configured runtime cap.
const PROCESSING_LEASE_STALE_MS = 2 * 60 * 1000;

class RetryableEkycLeaseError extends Error {
  constructor() {
    super('EKYC_EVENT_LEASE_BUSY');
    this.name = 'RetryableEkycLeaseError';
  }
}

interface ActorState {
  id: string;
  lineId: string | null;
  status: EkycDatabaseStatus;
  uppassSlug: string | null;
  kycData: unknown;
  lastProviderEventAt: string | null;
  lastProviderEventKey: string | null;
  updatedAt: string | null;
}

interface TransitionDecision {
  targetStatus: EkycDatabaseStatus;
  rejectionReason: string | null;
  attemptStatus: 'ACTIVE' | 'COMPLETED' | 'REJECTED' | 'ABANDONED';
  shouldNotify: boolean;
}

type TransitionResult = 'APPLIED' | 'ALREADY_APPLIED' | 'NOOP' | 'STALE';

function asEvent(data: unknown): StoredEkycWebhookEvent {
  if (!data || typeof data !== 'object') throw new PermanentEkycEventError('EVENT_RECORD_INVALID');
  return data as StoredEkycWebhookEvent;
}

function safeDbStatus(value: unknown): EkycDatabaseStatus {
  if (value === 'NOT_VERIFIED' || value === 'PENDING' || value === 'VERIFIED' || value === 'REJECTED') return value;
  throw new PermanentEkycEventError('ACTOR_STATUS_INVALID');
}

function isNeedReview(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const root = data as Record<string, unknown>;
  const application = root.application && typeof root.application === 'object'
    ? root.application as Record<string, unknown>
    : {};
  const other = application.other_status && typeof application.other_status === 'object'
    ? application.other_status as Record<string, unknown>
    : {};
  return other.ekyc === 'need_review';
}

function hasCompletedSubmission(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const root = data as Record<string, unknown>;
  const application = root.application && typeof root.application === 'object'
    ? root.application as Record<string, unknown>
    : {};
  return application.status === 'complete'
    || application.status === 'submitted'
    || typeof application.submitted_at === 'string';
}

function transitionFor(event: StoredEkycWebhookEvent): TransitionDecision {
  if (event.event_type === 'drop_off') {
    return { targetStatus: 'NOT_VERIFIED', rejectionReason: null, attemptStatus: 'ABANDONED', shouldNotify: false };
  }
  if (
    event.event_type === 'ekyc_front_card_reached_max_attempts'
    || event.event_type === 'ekyc_liveness_reached_max_attempt'
  ) {
    return {
      targetStatus: 'REJECTED',
      rejectionReason: 'ครบจำนวนครั้งที่สามารถยืนยันตัวตนได้',
      attemptStatus: 'REJECTED',
      shouldNotify: true,
    };
  }

  const applicationStatus = String(event.application_status || '').toLowerCase();
  const ekycStatus = String(event.ekyc_status || '').toLowerCase();
  if (applicationStatus === 'complete' && ekycStatus === 'pass') {
    return { targetStatus: 'VERIFIED', rejectionReason: null, attemptStatus: 'COMPLETED', shouldNotify: true };
  }
  if (applicationStatus === 'complete' && ekycStatus === 'fail') {
    return {
      targetStatus: 'REJECTED',
      rejectionReason: 'ไม่ผ่านการตรวจสอบยืนยันตัวตน',
      attemptStatus: 'REJECTED',
      shouldNotify: true,
    };
  }
  if (applicationStatus === 'complete' && ekycStatus === 'need_review') {
    return {
      targetStatus: 'PENDING',
      rejectionReason: 'อยู่ระหว่างการตรวจสอบโดยเจ้าหน้าที่',
      attemptStatus: 'ACTIVE',
      shouldNotify: true,
    };
  }
  if (
    (applicationStatus === 'complete' && ['', 'pending', 'processing', 'in_progress'].includes(ekycStatus))
    || applicationStatus === 'submitted'
  ) {
    return { targetStatus: 'PENDING', rejectionReason: null, attemptStatus: 'ACTIVE', shouldNotify: false };
  }
  if (applicationStatus === 'rejected') {
    return {
      targetStatus: 'REJECTED',
      rejectionReason: 'ไม่ผ่านการตรวจสอบยืนยันตัวตน',
      attemptStatus: 'REJECTED',
      shouldNotify: true,
    };
  }
  if (applicationStatus === 'review_needed') {
    return {
      targetStatus: 'PENDING',
      rejectionReason: 'อยู่ระหว่างการตรวจสอบโดยเจ้าหน้าที่',
      attemptStatus: 'ACTIVE',
      shouldNotify: true,
    };
  }
  if (
    applicationStatus === 'accepted'
    && process.env.UPPASS_ALLOW_LEGACY_ACCEPTED === 'true'
  ) {
    return { targetStatus: 'VERIFIED', rejectionReason: null, attemptStatus: 'COMPLETED', shouldNotify: true };
  }
  if (['created', 'pending', 'in_progress', 'incomplete'].includes(applicationStatus)) {
    return { targetStatus: 'PENDING', rejectionReason: null, attemptStatus: 'ACTIVE', shouldNotify: false };
  }
  throw new PermanentEkycEventError('UPPASS_STATUS_UNRECOGNIZED');
}

function transitionAllowed(current: EkycDatabaseStatus, target: EkycDatabaseStatus): boolean {
  if (current === target) return true;
  if (target === 'VERIFIED') return true;
  if (current === 'VERIFIED') return false;
  if (current === 'REJECTED') return false;
  if (target === 'REJECTED') return current === 'NOT_VERIFIED' || current === 'PENDING';
  if (target === 'PENDING') return current === 'NOT_VERIFIED' || current === 'PENDING';
  return target === 'NOT_VERIFIED' && (current === 'NOT_VERIFIED' || current === 'PENDING');
}

async function loadEvent(eventId: string): Promise<StoredEkycWebhookEvent> {
  const { data, error } = await supabaseAdmin()
    .from('ekyc_webhook_events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw new Error('EVENT_STORE_UNAVAILABLE');
  if (!data) throw new PermanentEkycEventError('EVENT_NOT_FOUND');
  return asEvent(data);
}

async function updateEventForGeneration(
  eventId: string,
  kind: EkycQueueMessage['kind'],
  generation: number,
  values: Record<string, unknown>,
): Promise<boolean> {
  const generationColumn = kind === 'PROCESS_WEBHOOK'
    ? 'processing_generation'
    : 'notification_generation';
  const { data, error } = await supabaseAdmin()
    .from('ekyc_webhook_events')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq(generationColumn, generation)
    .select('id')
    .maybeSingle();
  if (error) throw new Error('EVENT_STORE_UPDATE_FAILED');
  return Boolean(data);
}

async function loadActor(event: StoredEkycWebhookEvent): Promise<ActorState> {
  const config = getActorDatabaseConfig(event.actor_type);
  const direct = await supabaseAdmin()
    .from(config.table)
    .select(`${config.idColumn}, line_id, kyc_status, uppass_slug, kyc_data, kyc_last_provider_event_at, kyc_last_provider_event_key, updated_at`)
    .eq('uppass_slug', event.uppass_slug)
    .maybeSingle();
  if (direct.error) throw new Error('ACTOR_LOOKUP_FAILED');

  let data = direct.data;
  if (!data) {
    // The provider result is persisted before the actor row. Recover the
    // narrow crash window through the server-only attempt ledger so an early
    // webhook is not lost merely because actor synchronization is pending.
    const attempt = await supabaseAdmin()
      .from('ekyc_attempts')
      .select('actor_id, status')
      .eq('actor_type', event.actor_type)
      .eq('uppass_slug', event.uppass_slug)
      .in('status', ['ACTIVE', 'RECOVERY_REQUIRED'])
      .maybeSingle();
    if (attempt.error) throw new Error('ACTOR_LOOKUP_FAILED');
    if (!attempt.data) throw new PermanentEkycEventError('UPPASS_SLUG_UNKNOWN');
    const fallback = await supabaseAdmin()
      .from(config.table)
      .select(`${config.idColumn}, line_id, kyc_status, uppass_slug, kyc_data, kyc_last_provider_event_at, kyc_last_provider_event_key, updated_at`)
      .eq(config.idColumn, attempt.data.actor_id)
      .maybeSingle();
    if (fallback.error) throw new Error('ACTOR_LOOKUP_FAILED');
    if (!fallback.data) throw new PermanentEkycEventError('UPPASS_SLUG_UNKNOWN');
    // The select list is built from a validated per-actor config, so PostgREST
    // cannot infer the row shape statically; read it as a plain record.
    const fallbackRow = fallback.data as unknown as Record<string, unknown>;
    if (
      typeof fallbackRow.uppass_slug === 'string'
      && fallbackRow.uppass_slug !== event.uppass_slug
      && fallbackRow.kyc_status === 'PENDING'
    ) {
      throw new PermanentEkycEventError('UPPASS_SLUG_SUPERSEDED');
    }
    data = fallback.data;
  }
  const row = data as unknown as Record<string, unknown>;
  return {
    id: String(row[config.idColumn]),
    lineId: typeof row.line_id === 'string' ? row.line_id : null,
    status: safeDbStatus(row.kyc_status),
    uppassSlug: typeof row.uppass_slug === 'string' ? row.uppass_slug : null,
    kycData: row.kyc_data,
    lastProviderEventAt: typeof row.kyc_last_provider_event_at === 'string'
      ? row.kyc_last_provider_event_at
      : null,
    lastProviderEventKey: typeof row.kyc_last_provider_event_key === 'string'
      ? row.kyc_last_provider_event_key
      : null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

function eventOrder(actor: ActorState, event: StoredEkycWebhookEvent): 'CURRENT' | 'ALREADY_APPLIED' | 'STALE' {
  if (actor.lastProviderEventKey === event.event_key) return 'ALREADY_APPLIED';
  if (!actor.lastProviderEventAt) return 'CURRENT';
  if (!event.provider_event_at) return 'STALE';

  const previous = Date.parse(actor.lastProviderEventAt);
  const incoming = Date.parse(event.provider_event_at);
  if (!Number.isFinite(previous) || !Number.isFinite(incoming)) {
    throw new PermanentEkycEventError('PROVIDER_EVENT_TIMESTAMP_INVALID');
  }
  if (incoming < previous) return 'STALE';
  // Provider timestamps may have coarse precision. The stable event hash is a
  // deterministic tie-breaker so concurrent equal-time deliveries converge.
  if (incoming === previous && actor.lastProviderEventKey && event.event_key < actor.lastProviderEventKey) {
    return 'STALE';
  }
  return 'CURRENT';
}

function minimalKycData(event: StoredEkycWebhookEvent) {
  const submissionCompleted = event.event_type === 'submit_form'
    || event.application_status === 'complete'
    || event.application_status === 'submitted';
  return {
    provider: 'UPPASS',
    event: {
      type: event.event_type,
      ...(event.provider_event_at ? { provider_at: event.provider_event_at } : {}),
    },
    application: {
      status: event.application_status,
      other_status: { ekyc: event.ekyc_status },
      ...(submissionCompleted ? { submitted_at: event.provider_event_at || new Date().toISOString() } : {}),
    },
    processed_at: new Date().toISOString(),
  };
}

async function applyTransition(
  event: StoredEkycWebhookEvent,
  actor: ActorState,
  decision: TransitionDecision,
  generation: number,
): Promise<TransitionResult> {
  const config = getActorDatabaseConfig(event.actor_type);
  const ordering = eventOrder(actor, event);
  if (ordering === 'STALE' || ordering === 'ALREADY_APPLIED') return ordering;
  const allowed = transitionAllowed(actor.status, decision.targetStatus);

  const reviewChanged = allowed
    && decision.targetStatus === 'PENDING'
    && event.ekyc_status === 'need_review'
    && !isNeedReview(actor.kycData);
  const submissionChanged = allowed && (
    event.event_type === 'submit_form'
    || event.application_status === 'complete'
    || event.application_status === 'submitted'
  ) && !hasCompletedSubmission(actor.kycData);
  const statusChanged = allowed && actor.status !== decision.targetStatus;
  const stateChanged = statusChanged || reviewChanged || submissionChanged;
  const orderingChanged = actor.lastProviderEventAt !== event.provider_event_at
    || actor.lastProviderEventKey !== event.event_key;
  const wasPrecommitted = allowed
    && event.target_status === decision.targetStatus
    && event.notification_status === 'PENDING';

  if (!stateChanged && !orderingChanged && !wasPrecommitted) return 'NOOP';

  // Commit notification intent before actor state. If the worker crashes after
  // the actor transition, the durable outbox can still be reconciled.
  if (stateChanged && !wasPrecommitted) {
    const precommitted = await updateEventForGeneration(event.id, 'PROCESS_WEBHOOK', generation, {
      target_status: decision.targetStatus,
      notification_status: decision.shouldNotify ? 'PENDING' : 'NOT_REQUIRED',
    });
    if (!precommitted) throw new RetryableEkycLeaseError();
  }

  if (!stateChanged && !orderingChanged) return 'APPLIED';

  const now = new Date().toISOString();
  const shouldClearUrl = decision.targetStatus !== 'PENDING'
    || event.event_type === 'submit_form'
    || event.application_status === 'complete'
    || event.application_status === 'submitted'
    || event.ekyc_status === 'need_review';
  const update = {
    ...(stateChanged ? {
      kyc_status: decision.targetStatus,
      kyc_verified_at: decision.targetStatus === 'VERIFIED' ? now : null,
      kyc_rejection_reason: decision.rejectionReason,
      kyc_data: minimalKycData(event),
      ...(shouldClearUrl ? { ekyc_url: null } : {}),
    } : {}),
    uppass_slug: event.uppass_slug,
    kyc_last_provider_event_at: event.provider_event_at || actor.lastProviderEventAt,
    kyc_last_provider_event_key: event.event_key,
    updated_at: now,
  };
  let actorUpdate = supabaseAdmin()
    .from(config.table)
    .update(update)
    .eq(config.idColumn, actor.id)
    .eq('kyc_status', actor.status);
  actorUpdate = actor.uppassSlug
    ? actorUpdate.eq('uppass_slug', actor.uppassSlug)
    : actorUpdate.is('uppass_slug', null);
  actorUpdate = actor.updatedAt
    ? actorUpdate.eq('updated_at', actor.updatedAt)
    : actorUpdate.is('updated_at', null);
  const { data, error } = await actorUpdate
    .select(config.idColumn)
    .maybeSingle();
  if (error) throw new Error('ACTOR_TRANSITION_FAILED');
  if (!data) throw new Error('ACTOR_TRANSITION_CONFLICT');
  return stateChanged || wasPrecommitted ? 'APPLIED' : 'NOOP';
}

async function updateAttemptStatus(event: StoredEkycWebhookEvent, status: TransitionDecision['attemptStatus']) {
  const { error } = await supabaseAdmin()
    .from('ekyc_attempts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('actor_type', event.actor_type)
    .eq('uppass_slug', event.uppass_slug);
  if (error) throw new Error('ATTEMPT_UPDATE_FAILED');
}

async function ensureNotificationQueued(event: StoredEkycWebhookEvent) {
  const latest = await loadEvent(event.id);
  if (latest.notification_status !== 'PENDING') return;
  const queuedAt = new Date().toISOString();
  const previousGeneration = Number(latest.notification_generation || 0);
  const generation = previousGeneration + 1;
  const claimed = await supabaseAdmin()
    .from('ekyc_webhook_events')
    .update({
      notification_status: 'QUEUED',
      notification_generation: generation,
      notification_message_id: null,
      notification_published_at: null,
      notification_queued_at: queuedAt,
      updated_at: queuedAt,
    })
    .eq('id', latest.id)
    .eq('notification_status', 'PENDING')
    .eq('notification_generation', previousGeneration)
    .eq('updated_at', latest.updated_at)
    .select('id')
    .maybeSingle();
  if (claimed.error) throw new Error('EVENT_STORE_UPDATE_FAILED');
  if (!claimed.data) return;

  try {
    const published = await enqueueEkycNotification(latest.id, latest.event_key, generation);
    const recorded = await supabaseAdmin()
      .from('ekyc_webhook_events')
      .update({
        notification_message_id: published.messageId,
        notification_published_at: new Date().toISOString(),
      })
      .eq('id', latest.id)
      .eq('notification_generation', generation);
    if (recorded.error) {
      console.error('eKYC notification publish receipt persistence failed', {
        eventId: latest.id,
        generation,
        code: recorded.error.code || 'DB_ERROR',
      });
    }
  } catch {
    // Leave a recoverable PENDING outbox row only if the consumer has not
    // already advanced this exact claim to SENDING/SENT.
    await supabaseAdmin()
      .from('ekyc_webhook_events')
      .update({
        notification_status: 'PENDING',
        last_error_code: 'NOTIFICATION_QUEUE_PUBLISH_FAILED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', latest.id)
      .eq('notification_status', 'QUEUED')
      .eq('notification_generation', generation)
      .eq('notification_queued_at', queuedAt);
    // The actor transition is already durable. Reconciliation will publish the
    // PENDING/QUEUED outbox row; do not downgrade PROCESSED to FAILED merely
    // because the notification queue was temporarily unavailable.
    console.error('eKYC notification queue publish failed', {
      eventId: latest.id,
      generation,
      code: 'NOTIFICATION_QUEUE_PUBLISH_FAILED',
    });
  }
}

async function claimWebhookProcessing(event: StoredEkycWebhookEvent, generation: number): Promise<void> {
  if (event.processing_generation !== generation) throw new RetryableEkycLeaseError();
  if (event.processing_status === 'PROCESSING') {
    const updatedAt = Date.parse(event.updated_at);
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt < PROCESSING_LEASE_STALE_MS) {
      throw new RetryableEkycLeaseError();
    }
  }

  const now = new Date().toISOString();
  const claimed = await supabaseAdmin()
    .from('ekyc_webhook_events')
    .update({
      processing_status: 'PROCESSING',
      processing_attempts: Number(event.processing_attempts || 0) + 1,
      last_error_code: null,
      updated_at: now,
    })
    .eq('id', event.id)
    .eq('processing_status', event.processing_status)
    .eq('processing_generation', generation)
    .eq('updated_at', event.updated_at)
    .select('id')
    .maybeSingle();
  if (claimed.error) throw new Error('EVENT_STORE_UPDATE_FAILED');
  if (!claimed.data) throw new RetryableEkycLeaseError();
}

async function processWebhookEvent(eventId: string, generation: number) {
  const event = await loadEvent(eventId);
  // A reconciliation dispatch fences all older at-least-once deliveries.
  if (event.processing_generation !== generation) return;
  if (event.processing_status === 'DEAD_LETTER') return;
  if (event.processing_status === 'PROCESSED') {
    await ensureNotificationQueued(event);
    return;
  }

  await claimWebhookProcessing(event, generation);

  const actor = await loadActor(event);
  const decision = transitionFor(event);
  const transition = await applyTransition(event, actor, decision, generation);
  if (transition === 'APPLIED' || transition === 'ALREADY_APPLIED') {
    await updateAttemptStatus(event, decision.attemptStatus);
  }

  const latest = await loadEvent(event.id);
  if (transition === 'STALE' && latest.notification_status === 'PENDING') {
    await updateEventForGeneration(event.id, 'PROCESS_WEBHOOK', generation, {
      notification_status: 'NOT_REQUIRED',
    });
  } else if (transition !== 'APPLIED' && latest.notification_status === 'PENDING') {
    // A higher-priority/out-of-order state won; never send a stale status.
    const currentActor = await loadActor(event);
    if (currentActor.status !== latest.target_status) {
      await updateEventForGeneration(event.id, 'PROCESS_WEBHOOK', generation, {
        notification_status: 'NOT_REQUIRED',
      });
    }
  }

  const finalized = await updateEventForGeneration(event.id, 'PROCESS_WEBHOOK', generation, {
    processing_status: 'PROCESSED',
    processed_at: new Date().toISOString(),
    last_error_code: null,
  });
  if (!finalized) return;
  await ensureNotificationQueued(event);
}

function notificationText(event: StoredEkycWebhookEvent): string | null {
  if (event.target_status === 'VERIFIED') {
    return event.actor_type === 'INVESTOR'
      ? 'ยืนยันตัวตนสำเร็จแล้ว คุณสามารถใช้งาน Asset Funding ได้แล้ว'
      : 'ยืนยันตัวตนสำเร็จแล้ว คุณสามารถเริ่มใช้งานระบบได้';
  }
  if (event.target_status === 'REJECTED') {
    return event.event_type === 'ekyc_front_card_reached_max_attempts'
      || event.event_type === 'ekyc_liveness_reached_max_attempt'
      ? 'การยืนยันตัวตนไม่สำเร็จ\n\nครบจำนวนครั้งที่พยายามแล้ว กรุณาติดต่อฝ่ายสนับสนุน'
      : 'การยืนยันตัวตนไม่สำเร็จ\n\nกรุณาตรวจสอบข้อมูลและลองใหม่ หรือติดต่อฝ่ายสนับสนุน';
  }
  if (event.target_status === 'PENDING' && event.ekyc_status === 'need_review') {
    return 'ระบบได้รับข้อมูลยืนยันตัวตนแล้ว และกำลังรอเจ้าหน้าที่ตรวจสอบเพิ่มเติม เราจะแจ้งผลให้ทราบเมื่อเสร็จสิ้น';
  }
  return null;
}

async function sendNotification(eventId: string, generation: number) {
  const event = await loadEvent(eventId);
  if (event.notification_generation !== generation) return;
  if (event.notification_status === 'SENT' || event.notification_status === 'NOT_REQUIRED' || event.notification_status === 'FAILED') return;
  if (event.processing_status !== 'PROCESSED') throw new Error('EVENT_NOT_PROCESSED');

  if (event.notification_status === 'SENDING') {
    const updatedAt = Date.parse(event.updated_at);
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt < PROCESSING_LEASE_STALE_MS) {
      throw new RetryableEkycLeaseError();
    }
  }

  const actor = await loadActor(event);
  if (!event.target_status || actor.status !== event.target_status) {
    await updateEventForGeneration(event.id, 'SEND_NOTIFICATION', generation, {
      notification_status: 'NOT_REQUIRED',
    });
    return;
  }
  const text = notificationText(event);
  if (!text || !actor.lineId) {
    await updateEventForGeneration(event.id, 'SEND_NOTIFICATION', generation, {
      notification_status: 'NOT_REQUIRED',
    });
    return;
  }

  const token = event.actor_type === 'INVESTOR'
    ? process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST
    : process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new PermanentEkycEventError('LINE_CHANNEL_CONFIG_MISSING');

  const sendingAt = new Date().toISOString();
  const claimed = await supabaseAdmin()
    .from('ekyc_webhook_events')
    .update({
      notification_status: 'SENDING',
      notification_attempts: Number(event.notification_attempts || 0) + 1,
      updated_at: sendingAt,
    })
    .eq('id', event.id)
    .eq('notification_status', event.notification_status)
    .eq('notification_generation', generation)
    .eq('updated_at', event.updated_at)
    .select('id')
    .maybeSingle();
  if (claimed.error) throw new Error('EVENT_STORE_UPDATE_FAILED');
  if (!claimed.data) throw new RetryableEkycLeaseError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINE_TIMEOUT_MS);
  try {
    let result: Awaited<ReturnType<typeof pushLineTextMessage>>;
    try {
      result = await pushLineTextMessage({
        channelAccessToken: token,
        to: actor.lineId,
        text,
        signal: controller.signal,
        // LINE de-duplicates a retried push with this key. This closes the
        // crash window after LINE accepts the message but before SENT persists.
        retryKey: event.id,
      });
    } catch (error) {
      // LINE documents retries only for timeouts, 429, and 5xx. Other 4xx
      // responses will not change without operator intervention.
      if (error instanceof LinePushError && error.status >= 400 && error.status < 500 && error.status !== 429) {
        throw new PermanentEkycEventError(error.code);
      }
      throw error;
    }
    if (!result.success) throw new PermanentEkycEventError('LINE_NOTIFICATION_SKIPPED');
    await updateEventForGeneration(event.id, 'SEND_NOTIFICATION', generation, {
      notification_status: 'SENT',
      notification_sent_at: new Date().toISOString(),
      last_error_code: null,
    });
  } finally {
    clearTimeout(timer);
  }
}

function validQueueMessage(value: unknown): value is EkycQueueMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<EkycQueueMessage>;
  return (message.kind === 'PROCESS_WEBHOOK' || message.kind === 'SEND_NOTIFICATION')
    && typeof message.eventId === 'string'
    && /^[0-9a-f-]{36}$/i.test(message.eventId)
    && Number.isSafeInteger(message.generation)
    && Number(message.generation) > 0;
}

export async function processEkycQueueMessage(message: unknown, deliveryCount: number) {
  // Poison/unknown schemas have no durable event row to update. Acknowledge
  // them after a sanitized log instead of retrying until Queue retention ends.
  if (!validQueueMessage(message)) {
    console.error('eKYC queue message rejected', { code: 'QUEUE_MESSAGE_INVALID' });
    return;
  }
  try {
    if (message.kind === 'PROCESS_WEBHOOK') await processWebhookEvent(message.eventId, message.generation);
    else await sendNotification(message.eventId, message.generation);
  } catch (error) {
    const maxDeliveries = message.kind === 'PROCESS_WEBHOOK'
      ? MAX_PROCESSING_DELIVERIES
      : MAX_NOTIFICATION_DELIVERIES;
    const exhausted = deliveryCount >= maxDeliveries;
    if (error instanceof RetryableEkycLeaseError && !exhausted) throw error;
    const permanent = error instanceof PermanentEkycEventError;
    const internalCode = error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message)
      ? error.message
      : null;
    const errorCode = error instanceof PermanentEkycEventError
      ? error.code
      : internalCode || (message.kind === 'SEND_NOTIFICATION' ? 'LINE_NOTIFICATION_FAILED' : 'EKYC_PROCESSING_FAILED');

    const persisted = await updateEventForGeneration(
      message.eventId,
      message.kind,
      message.generation,
      message.kind === 'PROCESS_WEBHOOK'
        ? {
          processing_status: permanent || exhausted ? 'DEAD_LETTER' : 'FAILED',
          last_error_code: errorCode,
        }
        : {
          notification_status: permanent || exhausted ? 'FAILED' : 'PENDING',
          last_error_code: errorCode,
        },
    );
    // A newer generation now owns the row; this delivery is safely stale.
    if (!persisted) return;

    console.error('eKYC queue item failed', {
      kind: message.kind,
      eventId: message.eventId,
      generation: message.generation,
      deliveryCount,
      code: errorCode,
      terminal: permanent || exhausted,
    });
    if (!permanent && !exhausted) throw error;
  }
}
