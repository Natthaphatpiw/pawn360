import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client } from '@line/bot-sdk';
import { requirePinToken } from '@/lib/security/pin';
import { refreshInvestorTierAndTotals } from '@/lib/services/investor-tier';

const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
});

const dropPointLineClient = process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT
  ? new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT,
      channelSecret: process.env.LINE_CHANNEL_SECRET_DROPPOINT || '',
    })
  : null;

const ALLOWED_STATUSES = ['AMOUNT_VERIFIED', 'PREPARING_ITEM', 'IN_TRANSIT'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { redemptionId, lineId, returnPhotos, pinToken } = body;

    if (!redemptionId || !lineId) {
      return NextResponse.json(
        { error: 'Redemption ID and LINE ID are required' },
        { status: 400 }
      );
    }

    const pinCheck = await requirePinToken('DROP_POINT', lineId, pinToken);
    if (!pinCheck.ok) {
      return NextResponse.json(pinCheck.payload, { status: pinCheck.status });
    }

    if (!Array.isArray(returnPhotos) || returnPhotos.length < 2 || returnPhotos.some((url) => typeof url !== 'string' || !url)) {
      return NextResponse.json(
        { error: 'Return photos are required (2 images)' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: dropPoint, error: dropPointError } = await supabase
      .from('drop_points')
      .select('drop_point_id, drop_point_name')
      .eq('line_id', lineId)
      .single();

    if (dropPointError || !dropPoint) {
      return NextResponse.json(
        { error: 'Drop point not found' },
        { status: 404 }
      );
    }

    const { data: redemption, error: redemptionError } = await supabase
      .from('redemption_requests')
      .select(`
        *,
        contract:contract_id (
          contract_id,
          contract_number,
          drop_point_id,
          platform_fee_amount,
          items:item_id (
            item_id,
            brand,
            model
          ),
          pawners:customer_id (
            firstname,
            lastname,
            line_id,
            phone_number
          ),
          investors:investor_id (
            firstname,
            lastname,
            line_id
          )
        )
      `)
      .eq('redemption_id', redemptionId)
      .single();

    if (redemptionError || !redemption) {
      return NextResponse.json(
        { error: 'Redemption not found' },
        { status: 404 }
      );
    }

    if (redemption.contract?.drop_point_id !== dropPoint.drop_point_id) {
      return NextResponse.json(
        { error: 'Unauthorized drop point' },
        { status: 403 }
      );
    }

    if (redemption.request_status === 'COMPLETED' || redemption.item_return_confirmed_at) {
      return NextResponse.json({ success: true, alreadyCompleted: true });
    }

    if (!ALLOWED_STATUSES.includes(redemption.request_status)) {
      return NextResponse.json(
        { error: 'Redemption is not in a returnable state' },
        { status: 409 }
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const msPerDay = 1000 * 60 * 60 * 24;
    const startDate = new Date(redemption.contract?.contract_start_date || now);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(redemption.contract?.contract_end_date || now);
    endDate.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const rawDaysInContract = Number(redemption.contract?.contract_duration_days || 0)
      || Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay);
    const daysInContract = Math.max(1, rawDaysInContract);
    const rawDaysElapsed = Math.floor((today.getTime() - startDate.getTime()) / msPerDay) + 1;
    const daysElapsed = Math.min(daysInContract, Math.max(1, rawDaysElapsed));

    const investorRate = Number(redemption.contract?.investor_rate || 0.015);
    const principal = Number(redemption.contract?.loan_principal_amount || 0);
    const interestEarned = Math.round(principal * investorRate * (daysElapsed / 30) * 100) / 100;
    const platformFee = Number(redemption.contract?.platform_fee_amount) || 0;
    const netProfit = Math.max(0, interestEarned);
    const { error: updateError } = await supabase
      .from('redemption_requests')
      .update({
        request_status: 'COMPLETED',
        item_return_confirmed_at: nowIso,
        item_return_confirmed_by_drop_point_id: dropPoint.drop_point_id,
        item_return_confirmed_by_line_id: lineId,
        drop_point_return_photos: returnPhotos.slice(0, 2),
        drop_point_return_photos_uploaded_at: nowIso,
        final_completion_at: nowIso,
        investor_interest_earned: interestEarned,
        platform_fee_deducted: platformFee,
        investor_net_profit: netProfit,
        updated_at: nowIso
      })
      .eq('redemption_id', redemptionId);

    if (updateError) {
      console.error('Error updating redemption:', updateError);
      return NextResponse.json(
        { error: 'Failed to update redemption' },
        { status: 500 }
      );
    }

    await supabase
      .from('contracts')
      .update({
        contract_status: 'COMPLETED',
        redemption_status: 'COMPLETED',
        item_delivery_status: 'RETURNED',
        completed_at: nowIso,
        updated_at: nowIso
      })
      .eq('contract_id', redemption.contract?.contract_id);

    if (redemption.contract?.items?.item_id) {
      await supabase
        .from('items')
        .update({
          item_status: 'RETURNED',
          updated_at: nowIso
        })
        .eq('item_id', redemption.contract.items.item_id);
    }

    if (redemption.contract?.pawners?.line_id) {
      try {
        await pawnerLineClient.pushMessage(redemption.contract.pawners.line_id, {
          type: 'text',
          text: `ส่งคืนเรียบร้อย\n\nสัญญา: ${redemption.contract.contract_number}\nสินค้า: ${redemption.contract.items?.brand} ${redemption.contract.items?.model}\n\nขอบคุณที่ใช้บริการ Pawnly`
        });
      } catch (msgError) {
        console.error('Error sending to pawner:', msgError);
      }
    }

    if (redemption.contract?.investors?.line_id) {
      try {
        await investorLineClient.pushMessage(redemption.contract.investors.line_id, {
          type: 'text',
          text: `ส่งคืนเรียบร้อย\n\nสัญญา: ${redemption.contract.contract_number}\nกำไรสุทธิ: +${netProfit.toLocaleString()} บาท\n\nขอบคุณที่เป็นส่วนหนึ่งของ Pawnly`
        });
      } catch (msgError) {
        console.error('Error sending to investor:', msgError);
      }
    }

    if (dropPointLineClient) {
      try {
        await dropPointLineClient.pushMessage(lineId, {
          type: 'text',
          text: `ส่งคืนเรียบร้อย\n\nสัญญา: ${redemption.contract?.contract_number}\nสินค้า: ${redemption.contract?.items?.brand} ${redemption.contract?.items?.model}`,
        });
      } catch (msgError) {
        console.error('Error sending to drop point:', msgError);
      }
    }

    if (redemption.contract?.investor_id) {
      try {
        await refreshInvestorTierAndTotals(redemption.contract.investor_id);
      } catch (refreshError) {
        console.error('Error refreshing investor totals:', refreshError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error confirming return:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
