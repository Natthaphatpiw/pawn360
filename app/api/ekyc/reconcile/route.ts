import { NextRequest, NextResponse } from 'next/server';
import { enqueueEkycNotification, enqueueEkycWebhookEvent } from '@/lib/ekyc/queue';
import { internalAuthErrorResponse, requireInternalRequest } from '@/lib/security/request-auth';
import { supabaseAdmin } from '@/lib/supabase/client';

const MAX_BATCH = 50;
// Must exceed the Queue consumer's 60-second max duration before a PROCESSING
// or SENDING lease can be reclaimed without overlapping a live invocation.
const STALE_AFTER_MS = 2 * 60_000;

async function reconcile(request: NextRequest) {
  // Shared with the other cron handlers so an unset CRON_SECRET reports 503
  // CONFIG_MISSING instead of a bare 401. A local check that answered 401 for
  // both "not configured" and "wrong token" made an unset secret look like a
  // rejected caller, which is exactly the wrong diagnosis to hand an operator.
  try {
    requireInternalRequest(request, ['CRON_SECRET']);
  } catch (error) {
    return internalAuthErrorResponse(error);
  }
  const supabase = supabaseAdmin();
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const [webhooks, notifications] = await Promise.all([
    supabase
      .from('ekyc_webhook_events')
      .select('id, event_key, processing_status, processing_generation, updated_at')
      .in('processing_status', ['RECEIVED', 'FAILED', 'QUEUED', 'PROCESSING'])
      .lt('updated_at', staleBefore)
      .order('updated_at', { ascending: true })
      .limit(MAX_BATCH),
    supabase
      .from('ekyc_webhook_events')
      .select('id, event_key, notification_status, notification_generation, updated_at')
      .eq('processing_status', 'PROCESSED')
      .in('notification_status', ['PENDING', 'QUEUED', 'SENDING'])
      .lt('updated_at', staleBefore)
      .order('updated_at', { ascending: true })
      .limit(MAX_BATCH),
  ]);

  if (webhooks.error || notifications.error) {
    console.error('eKYC reconciliation query failed', {
      webhookCode: webhooks.error?.code || null,
      notificationCode: notifications.error?.code || null,
    });
    return NextResponse.json({ error: 'Reconciliation store unavailable' }, { status: 503 });
  }

  let requeuedWebhooks = 0;
  let requeuedNotifications = 0;
  let failures = 0;

  await Promise.all((webhooks.data || []).map(async (event) => {
    const queuedAt = new Date().toISOString();
    const previousGeneration = Number(event.processing_generation || 0);
    const generation = previousGeneration + 1;
    try {
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
        .eq('processing_generation', previousGeneration)
        .eq('updated_at', event.updated_at)
        .select('id')
        .maybeSingle();
      if (claimed.error) throw new Error('RECONCILE_CLAIM_FAILED');
      if (!claimed.data) return;

      const published = await enqueueEkycWebhookEvent(String(event.id), String(event.event_key), generation);
      const recorded = await supabase
        .from('ekyc_webhook_events')
        .update({
          processing_message_id: published.messageId,
          processing_published_at: new Date().toISOString(),
        })
        .eq('id', event.id)
        .eq('processing_generation', generation);
      if (recorded.error) {
        console.error('eKYC webhook publish receipt persistence failed', {
          eventId: event.id,
          generation,
          code: recorded.error.code || 'DB_ERROR',
        });
      }
      requeuedWebhooks += 1;
    } catch {
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
      failures += 1;
    }
  }));

  await Promise.all((notifications.data || []).map(async (event) => {
    const queuedAt = new Date().toISOString();
    const previousGeneration = Number(event.notification_generation || 0);
    const generation = previousGeneration + 1;
    try {
      const claimed = await supabase
        .from('ekyc_webhook_events')
        .update({
          notification_status: 'QUEUED',
          notification_generation: generation,
          notification_message_id: null,
          notification_published_at: null,
          notification_queued_at: queuedAt,
          last_error_code: null,
          updated_at: queuedAt,
        })
        .eq('id', event.id)
        .eq('notification_status', event.notification_status)
        .eq('notification_generation', previousGeneration)
        .eq('updated_at', event.updated_at)
        .select('id')
        .maybeSingle();
      if (claimed.error) throw new Error('RECONCILE_CLAIM_FAILED');
      if (!claimed.data) return;

      const published = await enqueueEkycNotification(String(event.id), String(event.event_key), generation);
      const recorded = await supabase
        .from('ekyc_webhook_events')
        .update({
          notification_message_id: published.messageId,
          notification_published_at: new Date().toISOString(),
        })
        .eq('id', event.id)
        .eq('notification_generation', generation);
      if (recorded.error) {
        console.error('eKYC notification publish receipt persistence failed', {
          eventId: event.id,
          generation,
          code: recorded.error.code || 'DB_ERROR',
        });
      }
      requeuedNotifications += 1;
    } catch {
      await supabase
        .from('ekyc_webhook_events')
        .update({
          notification_status: 'PENDING',
          last_error_code: 'NOTIFICATION_QUEUE_PUBLISH_FAILED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', event.id)
        .eq('notification_status', 'QUEUED')
        .eq('notification_generation', generation)
        .eq('notification_queued_at', queuedAt);
      failures += 1;
    }
  }));

  return NextResponse.json({
    success: failures === 0,
    requeuedWebhooks,
    requeuedNotifications,
    failures,
  }, {
    status: failures === 0 ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: NextRequest) {
  return reconcile(request);
}

export async function POST(request: NextRequest) {
  return reconcile(request);
}
