import { supabaseAdmin } from '@/lib/supabase/client';

/**
 * Last resort after the market-search escalation ladder is exhausted.
 *
 * The product goal is that this never fires: an estimate that cannot find
 * evidence should climb to a slower, more expensive search rung rather than
 * give up (see SEARCH_ESCALATION_TIERS in estimate-pipeline.ts). When it does
 * fire it means every rung came back empty, so the request is handed to a human
 * instead of being shown to the pawner as a failure.
 *
 * The LINE notification is deliberately a thin, isolated seam: it resolves an
 * operator channel from configuration and posts a plain text message. Point
 * MANUAL_ESTIMATE_LINE_TOKEN / MANUAL_ESTIMATE_LINE_TARGET at the operator OA
 * once it exists and the path starts delivering; until then the row is still
 * written and the pawner still gets a "we are pricing this by hand" answer, so
 * nothing is lost by the channel being unconfigured.
 */

export interface ManualEstimateEscalation {
  lineId: string;
  itemType: string;
  brand: string;
  model: string;
  productName: string;
  capacity?: string;
  reason: string;
  /** Escalation rungs already attempted, for the operator's context. */
  tiersAttempted: string[];
}

export interface ManualEstimateEscalationResult {
  requestId: string | null;
  notified: boolean;
}

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_TIMEOUT_MS = 8_000;

function operatorChannel(): { token: string; target: string } | null {
  const token = String(
    process.env.MANUAL_ESTIMATE_LINE_TOKEN
    || process.env.LINE_ADMIN_CHANNEL_ACCESS_TOKEN
    || '',
  ).trim();
  const target = String(
    process.env.MANUAL_ESTIMATE_LINE_TARGET
    || String(process.env.LINE_ADMIN_TARGET_IDS || '').split(',')[0]
    || '',
  ).trim();
  return token && target ? { token, target } : null;
}

function operatorMessage(input: ManualEstimateEscalation, requestId: string | null): string {
  return [
    'ขอราคาประเมินโดยเจ้าหน้าที่ (ระบบหาราคาตลาดไม่พบ)',
    '',
    `สินค้า: ${input.productName}`,
    `ประเภท: ${input.itemType}`,
    input.capacity ? `ความจุ: ${input.capacity}` : null,
    `สาเหตุ: ${input.reason}`,
    `ค้นหาแล้ว ${input.tiersAttempted.length} ระดับ: ${input.tiersAttempted.join(' → ')}`,
    requestId ? `เลขที่คำขอ: ${requestId}` : null,
  ].filter(Boolean).join('\n');
}

async function notifyOperator(text: string): Promise<boolean> {
  const channel = operatorChannel();
  if (!channel) {
    console.warn('Manual-estimate escalation channel is not configured; row written without a push.');
    return false;
  }
  try {
    const response = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${channel.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: channel.target, messages: [{ type: 'text', text }] }),
      signal: AbortSignal.timeout(LINE_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('Manual-estimate escalation push failed', { status: response.status });
      return false;
    }
    return true;
  } catch {
    console.error('Manual-estimate escalation push failed to send.');
    return false;
  }
}

/**
 * Records the request for an operator and notifies the manual-pricing channel.
 * Never throws: the caller is already on a degraded path and a bookkeeping
 * failure must not turn a "we will price this by hand" answer into an error.
 */
export async function escalateToManualEstimate(
  input: ManualEstimateEscalation,
): Promise<ManualEstimateEscalationResult> {
  let requestId: string | null = null;
  try {
    const { data, error } = await supabaseAdmin()
      .from('manual_estimate_requests')
      .insert({
        line_id: input.lineId,
        status: 'PENDING',
        // The table keeps request details in a JSONB blob rather than columns,
        // so match the shape the operator UI already reads.
        item_data: {
          itemType: input.itemType,
          brand: input.brand,
          model: input.model,
          capacity: input.capacity ?? null,
          productName: input.productName,
          source: 'AUTO_ESCALATION',
          escalationReason: input.reason,
          tiersAttempted: input.tiersAttempted,
        },
        image_urls: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .maybeSingle();
    if (error) throw error;
    const row = data as Record<string, unknown> | null;
    const id = row?.id ?? row?.request_id ?? row?.manual_estimate_id;
    requestId = id ? String(id) : null;
  } catch (error) {
    console.error('Manual-estimate escalation could not be recorded', {
      code: (error as { code?: string })?.code || 'DB_ERROR',
    });
  }

  const notified = await notifyOperator(operatorMessage(input, requestId));
  return { requestId, notified };
}
