import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { enqueueEkycWebhookEvent } from '@/lib/ekyc/queue';
import { EkycActorType, EkycWebhookEventType } from '@/lib/ekyc/types';
import { EkycWebhookConfigurationError, verifyUpPassWebhook } from '@/lib/ekyc/webhook-auth';
import { supabaseAdmin } from '@/lib/supabase/client';

const MAX_WEBHOOK_BYTES = 512 * 1024;

const EVENT_TYPES = new Set<EkycWebhookEventType>([
  'submit_form',
  'update_status',
  'drop_off',
  'ekyc_front_card_reached_max_attempts',
  'ekyc_liveness_reached_max_attempt',
]);

interface NormalizedWebhookEvent {
  eventKey: string;
  actorType: EkycActorType;
  eventType: EkycWebhookEventType;
  uppassSlug: string;
  applicationStatus: string | null;
  ekycStatus: string | null;
  providerEventAt: string | null;
}

interface EventDispatchState {
  id: string;
  processing_status: string;
  processing_generation: number;
  updated_at: string;
}

class WebhookBodyError extends Error {
  constructor(public readonly code: 'EMPTY_BODY' | 'PAYLOAD_TOO_LARGE' | 'INVALID_ENCODING') {
    super(code);
    this.name = 'WebhookBodyError';
  }
}

function json(body: unknown, status = 200, retryAfter?: number) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (retryAfter) headers.set('Retry-After', String(retryAfter));
  return NextResponse.json(body, { status, headers });
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function shortString(value: unknown, maxLength = 255): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function isoTimestamp(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return null;
}

async function readBoundedBody(request: Request): Promise<string> {
  if (!request.body) throw new WebhookBodyError('EMPTY_BODY');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let totalBytes = 0;
  let rawBody = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_WEBHOOK_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new WebhookBodyError('PAYLOAD_TOO_LARGE');
      }
      rawBody += decoder.decode(value, { stream: true });
    }
    rawBody += decoder.decode();
  } catch (error) {
    if (error instanceof WebhookBodyError) throw error;
    throw new WebhookBodyError('INVALID_ENCODING');
  }
  if (!rawBody) throw new WebhookBodyError('EMPTY_BODY');
  return rawBody;
}

function normalizePayload(rawBody: string, actorType: EkycActorType): NormalizedWebhookEvent {
  let payload: Record<string, unknown>;
  try {
    payload = object(JSON.parse(rawBody) as unknown);
  } catch {
    throw new Error('INVALID_JSON');
  }

  const event = object(payload.event);
  const application = object(payload.application);
  const otherStatus = object(application.other_status);
  const eventType = shortString(event.type)?.toLowerCase() as EkycWebhookEventType | null;
  const uppassSlug = shortString(application.slug);
  if (!eventType || !EVENT_TYPES.has(eventType) || !uppassSlug || !/^[A-Za-z0-9_-]+$/.test(uppassSlug)) {
    throw new Error('INVALID_EVENT_SCHEMA');
  }

  const applicationStatus = shortString(application.status, 64)?.toLowerCase() || null;
  const ekycStatus = shortString(otherStatus.ekyc, 64)?.toLowerCase() || null;
  const providerEventAt = isoTimestamp(
    event.timestamp,
    event.created_at,
    application.updated_at,
    application.submitted_at,
  );
  const providerEventId = shortString(event.id, 255);
  const rawHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const fingerprint = providerEventId || providerEventAt
    ? [actorType, providerEventId || '', eventType, uppassSlug, applicationStatus || '', ekycStatus || '', providerEventAt || ''].join('|')
    : `${actorType}|${rawHash}`;

  return {
    eventKey: crypto.createHash('sha256').update(fingerprint).digest('hex'),
    actorType,
    eventType,
    uppassSlug,
    applicationStatus,
    ekycStatus,
    providerEventAt,
  };
}

export async function ingestUpPassWebhook(request: Request, actorType: EkycActorType) {
  const contentLength = Number.parseInt(request.headers.get('content-length') || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return json({ error: 'Payload too large' }, 413);
  }
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, 415);
  }

  let rawBody: string;
  try {
    rawBody = await readBoundedBody(request);
  } catch (error) {
    if (error instanceof WebhookBodyError && error.code === 'PAYLOAD_TOO_LARGE') {
      return json({ error: 'Payload too large' }, 413);
    }
    return json({ error: error instanceof WebhookBodyError && error.code === 'EMPTY_BODY' ? 'Empty payload' : 'Invalid body encoding' }, 400);
  }

  try {
    if (!verifyUpPassWebhook(request, rawBody, actorType)) {
      return json({ error: 'Unauthorized' }, 401);
    }
  } catch (error) {
    if (error instanceof EkycWebhookConfigurationError) {
      console.error('UpPass webhook rejected because authentication is not configured', {
        actorType,
        code: error.code,
      });
      return json({ error: 'Webhook unavailable' }, 503, 60);
    }
    return json({ error: 'Unauthorized' }, 401);
  }

  let normalized: NormalizedWebhookEvent;
  try {
    normalized = normalizePayload(rawBody, actorType);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID_EVENT';
    return json({ error: code === 'INVALID_JSON' ? 'Invalid JSON' : 'Invalid event schema' }, 400);
  }

  const supabase = supabaseAdmin();
  const row = {
    event_key: normalized.eventKey,
    actor_type: normalized.actorType,
    event_type: normalized.eventType,
    uppass_slug: normalized.uppassSlug,
    application_status: normalized.applicationStatus,
    ekyc_status: normalized.ekycStatus,
    provider_event_at: normalized.providerEventAt,
    processing_status: 'RECEIVED',
    notification_status: 'NOT_REQUIRED',
  };

  let event: EventDispatchState;
  const inserted = await supabase
    .from('ekyc_webhook_events')
    .insert(row)
    .select('id, processing_status, processing_generation, updated_at')
    .single();
  if (inserted.error?.code === '23505') {
    const existing = await supabase
      .from('ekyc_webhook_events')
      .select('id, processing_status, processing_generation, updated_at')
      .eq('event_key', normalized.eventKey)
      .single();
    if (existing.error || !existing.data) return json({ error: 'Event store unavailable' }, 503, 30);
    event = existing.data as EventDispatchState;
    if (['QUEUED', 'PROCESSING', 'PROCESSED', 'DEAD_LETTER'].includes(existing.data.processing_status)) {
      return json({ received: true, duplicate: true });
    }
  } else if (inserted.error || !inserted.data?.id) {
    console.error('UpPass webhook event persistence failed', {
      actorType,
      code: inserted.error?.code || 'DB_ERROR',
    });
    return json({ error: 'Event store unavailable' }, 503, 30);
  } else {
    event = inserted.data as EventDispatchState;
  }

  // Claim the durable outbox row before publishing. Publishing first allows a
  // fast consumer to write PROCESSED and then be incorrectly overwritten by
  // this request's later QUEUED update.
  const queuedAt = new Date().toISOString();
  const generation = Number(event.processing_generation || 0) + 1;
  const claimed = await supabase
    .from('ekyc_webhook_events')
    .update({
      processing_status: 'QUEUED',
      processing_generation: generation,
      processing_message_id: null,
      processing_published_at: null,
      queued_at: queuedAt,
      last_error_code: null,
      updated_at: queuedAt,
    })
    .eq('id', event.id)
    .eq('processing_status', event.processing_status)
    .eq('processing_generation', event.processing_generation)
    .eq('updated_at', event.updated_at)
    .select('id')
    .maybeSingle();
  if (claimed.error) {
    return json({ error: 'Event store unavailable' }, 503, 30);
  }
  if (!claimed.data) {
    return json({ received: true, duplicate: true });
  }

  try {
    const published = await enqueueEkycWebhookEvent(event.id, normalized.eventKey, generation);
    const recorded = await supabase
      .from('ekyc_webhook_events')
      .update({
        processing_message_id: published.messageId,
        processing_published_at: new Date().toISOString(),
      })
      .eq('id', event.id)
      .eq('processing_generation', generation);
    if (recorded.error) {
      console.error('UpPass webhook queue publish receipt persistence failed', {
        actorType,
        eventId: event.id,
        code: recorded.error.code || 'DB_ERROR',
      });
    }
  } catch {
    // Revert only our still-unconsumed claim. If a consumer already advanced
    // the row to PROCESSING/PROCESSED, never move it backwards.
    await supabase
      .from('ekyc_webhook_events')
      .update({
        processing_status: 'RECEIVED',
        last_error_code: 'QUEUE_PUBLISH_FAILED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', event.id)
      .eq('processing_status', 'QUEUED')
      .eq('processing_generation', generation)
      .eq('queued_at', queuedAt);
    console.error('UpPass webhook queue publish failed', { actorType, eventId: event.id, generation });
    return json({ error: 'Queue unavailable' }, 503, 30);
  }

  return json({ received: true, queued: true }, 202);
}
