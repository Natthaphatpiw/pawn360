import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { lineRetryKeyFromMaterial, pushLineTextMessage } from '@/lib/line/push-text';
import {
  internalAuthErrorResponse,
  requireInternalRequest,
} from '@/lib/security/request-auth';

const AUTO_CONFIRM_HOURS = 48;

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

    return NextResponse.json({
      success: true,
      processed,
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
