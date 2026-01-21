import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client } from '@line/bot-sdk';
import { requirePinToken } from '@/lib/security/pin';

const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
});

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

    const interestEarned = Number(redemption.interest_amount) || 0;
    const platformFee = Number(redemption.contract?.platform_fee_amount) || 0;
    const netProfit = Math.max(0, interestEarned - platformFee);
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('redemption_requests')
      .update({
        request_status: 'COMPLETED',
        item_return_confirmed_at: now,
        item_return_confirmed_by_drop_point_id: dropPoint.drop_point_id,
        item_return_confirmed_by_line_id: lineId,
        drop_point_return_photos: returnPhotos.slice(0, 2),
        drop_point_return_photos_uploaded_at: now,
        final_completion_at: now,
        investor_interest_earned: interestEarned,
        platform_fee_deducted: platformFee,
        investor_net_profit: netProfit,
        updated_at: now
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
        completed_at: now,
        updated_at: now
      })
      .eq('contract_id', redemption.contract?.contract_id);

    if (redemption.contract?.items?.item_id) {
      await supabase
        .from('items')
        .update({
          item_status: 'RETURNED',
          updated_at: now
        })
        .eq('item_id', redemption.contract.items.item_id);
    }

    if (redemption.contract?.pawners?.line_id) {
      try {
        await pawnerLineClient.pushMessage(redemption.contract.pawners.line_id, {
          type: 'text',
          text: `ยืนยันการรับสินค้าจาก Drop Point เรียบร้อยแล้ว\n\nสัญญา: ${redemption.contract.contract_number}\nสินค้า: ${redemption.contract.items?.brand} ${redemption.contract.items?.model}\n\nขอบคุณที่ใช้บริการ Pawnly`
        });
      } catch (msgError) {
        console.error('Error sending to pawner:', msgError);
      }
    }

    if (redemption.contract?.investors?.line_id) {
      try {
        await investorLineClient.pushMessage(redemption.contract.investors.line_id, {
          type: 'text',
          text: `การไถ่ถอนเสร็จสิ้นแล้ว\n\nสัญญา: ${redemption.contract.contract_number}\nกำไรสุทธิ: +${netProfit.toLocaleString()} บาท\n\nขอบคุณที่เป็นส่วนหนึ่งของ Pawnly`
        });
      } catch (msgError) {
        console.error('Error sending to investor:', msgError);
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
