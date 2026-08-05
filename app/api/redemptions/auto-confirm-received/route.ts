import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { lineRetryKeyFromMaterial, pushLineTextMessage } from '@/lib/line/push-text';
import {
  internalAuthErrorResponse,
  requireInternalRequest,
} from '@/lib/security/request-auth';

const AUTO_CONFIRM_HOURS = 48;
/**
 * How long the investor's payout sits unconfirmed before the redemption closes
 * itself.
 *
 * The confirmation exists to catch a payout that never reached the investor. It
 * cannot be a blocking step: investors do not open the app to press buttons, so
 * requiring their action would leave every completed redemption open forever
 * and teach everyone to ignore the state. Instead the quiet period closes it,
 * and the row records that nobody actually asserted receipt - an investor who
 * did NOT get their money is exactly the person who will press
 * "ยังไม่ได้รับเงิน", which marks the redemption disputed and stops this sweep
 * from touching it.
 *
 * Deliberately longer than the pawner's 48h: this one is about money, and the
 * cost of waiting is only a delayed status while the cost of closing too early
 * is a missed payout failure.
 */
const INVESTOR_AUTO_CONFIRM_HOURS = Number(process.env.REDEMPTION_INVESTOR_AUTO_CONFIRM_HOURS) > 0
  ? Number(process.env.REDEMPTION_INVESTOR_AUTO_CONFIRM_HOURS)
  : 72;

export async function GET(request: NextRequest) {
  try {
    requireInternalRequest(request, ['CRON_SECRET']);
  } catch (error) {
    return internalAuthErrorResponse(error);
  }

  try {
    const supabase = supabaseAdmin();
    const threshold = new Date(Date.now() - AUTO_CONFIRM_HOURS * 60 * 60 * 1000).toISOString();

    const { data: redemptions, error } = await supabase
      .from('redemption_requests')
      .select(`
        redemption_id,
        contract_id,
        request_status,
        item_return_confirmed_at,
        pawner_confirmed_at,
        contract:contract_id (
          contract_number,
          pawners:customer_id (
            line_id
          )
        )
      `)
      .eq('request_status', 'COMPLETED')
      .is('pawner_confirmed_at', null)
      .not('item_return_confirmed_at', 'is', null)
      .lte('item_return_confirmed_at', threshold);

    if (error) {
      throw error;
    }

    let processed = 0;

    for (const redemption of redemptions || []) {
      const contract = Array.isArray(redemption.contract)
        ? redemption.contract[0]
        : redemption.contract;
      const nowIso = new Date().toISOString();
      const { data: claimed, error: updateError } = await supabase
        .from('redemption_requests')
        .update({
          request_status: 'PAWNER_CONFIRMED',
          pawner_confirmed_at: nowIso,
          updated_at: nowIso,
        })
        .eq('redemption_id', redemption.redemption_id)
        .eq('request_status', 'COMPLETED')
        .is('pawner_confirmed_at', null)
        .select('redemption_id')
        .maybeSingle();

      if (updateError) {
        console.error('Error auto-confirming redemption receipt:', redemption.redemption_id, updateError);
        continue;
      }
      // A concurrent cron invocation may have claimed this row first.
      if (!claimed) continue;

      processed += 1;

      const pawner = Array.isArray(contract?.pawners)
        ? contract?.pawners[0]
        : contract?.pawners;
      if (process.env.LINE_CHANNEL_ACCESS_TOKEN && pawner?.line_id) {
        try {
          await pushLineTextMessage({
            channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
            to: pawner.line_id,
            text: `ระบบยืนยันการได้รับของคืนให้อัตโนมัติแล้ว\n\nสัญญา: ${contract?.contract_number || '-'}\nหากยังไม่ได้รับของจริง กรุณาติดต่อเจ้าหน้าที่ช่วยเหลือทันที`,
            retryKey: lineRetryKeyFromMaterial(
              `redemption-auto-confirm:${redemption.redemption_id}`,
            ),
            signal: AbortSignal.timeout(10_000),
          });
        } catch (messageError) {
          console.error('Auto-confirm LINE notification failed', {
            redemptionId: redemption.redemption_id,
            type: messageError instanceof Error ? messageError.name : 'unknown',
          });
        }
      }
    }

    // Second sweep: close redemptions whose investor never responded either way.
    let investorAutoConfirmed = 0;
    const investorThreshold = new Date(
      Date.now() - INVESTOR_AUTO_CONFIRM_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const { data: awaitingInvestor, error: awaitingInvestorError } = await supabase
      .from('redemption_requests')
      .select('redemption_id, pawner_confirmed_at')
      .eq('request_status', 'PAWNER_CONFIRMED')
      .is('investor_confirmed_at', null)
      .is('investor_disputed_at', null)
      .not('pawner_confirmed_at', 'is', null)
      .lte('pawner_confirmed_at', investorThreshold);

    if (awaitingInvestorError) {
      // The dispute/source columns arrive with
      // 2026_08_05_add_redemption_investor_confirmation.sql. Until it is
      // applied this sweep is skipped rather than failing the whole cron -
      // the pawner-side sweep above still has to run.
      console.warn('Investor auto-confirm sweep skipped', {
        code: (awaitingInvestorError as { code?: string })?.code || 'QUERY_FAILED',
      });
    } else {
      for (const row of awaitingInvestor || []) {
        const nowIso = new Date().toISOString();
        const { data: closed } = await supabase
          .from('redemption_requests')
          .update({
            request_status: 'COMPLETED',
            investor_confirmed_at: nowIso,
            investor_confirmation_source: 'AUTO',
            updated_at: nowIso,
          })
          .eq('redemption_id', row.redemption_id)
          .eq('request_status', 'PAWNER_CONFIRMED')
          .is('investor_confirmed_at', null)
          .is('investor_disputed_at', null)
          .select('redemption_id')
          .maybeSingle();
        if (closed) investorAutoConfirmed += 1;
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      investorAutoConfirmed,
      threshold,
    });
  } catch (error) {
    console.error('Error auto-confirming redemption receipts', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถประมวลผลการยืนยันอัตโนมัติได้', code: 'AUTO_CONFIRM_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
