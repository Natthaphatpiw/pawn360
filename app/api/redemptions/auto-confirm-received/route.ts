import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client } from '@line/bot-sdk';

const AUTO_CONFIRM_HOURS = 48;

const pawnerLineClient = process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_SECRET
  ? new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.LINE_CHANNEL_SECRET,
    })
  : null;

const ensureCronAuthorized = (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }

  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token === secret;
};

export async function GET(request: NextRequest) {
  try {
    if (!ensureCronAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      const { error: updateError } = await supabase
        .from('redemption_requests')
        .update({
          request_status: 'PAWNER_CONFIRMED',
          pawner_confirmed_at: nowIso,
          updated_at: nowIso,
        })
        .eq('redemption_id', redemption.redemption_id)
        .eq('request_status', 'COMPLETED')
        .is('pawner_confirmed_at', null);

      if (updateError) {
        console.error('Error auto-confirming redemption receipt:', redemption.redemption_id, updateError);
        continue;
      }

      processed += 1;

      const pawner = Array.isArray(contract?.pawners)
        ? contract?.pawners[0]
        : contract?.pawners;
      if (pawnerLineClient && pawner?.line_id) {
        try {
          await pawnerLineClient.pushMessage(pawner.line_id, {
            type: 'text',
            text: `ระบบยืนยันการได้รับของคืนให้อัตโนมัติแล้ว\n\nสัญญา: ${contract?.contract_number || '-'}\nหากยังไม่ได้รับของจริง กรุณาติดต่อเจ้าหน้าที่ช่วยเหลือทันที`,
          });
        } catch (messageError) {
          console.error('Error sending auto-confirm message to pawner:', messageError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      threshold,
    });
  } catch (error: any) {
    console.error('Error auto-confirming redemption receipts:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
