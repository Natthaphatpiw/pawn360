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
const BAG_NUMBER_REGEX = /^[A-Z0-9-]{4,32}$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { redemptionId, lineId, returnPhotos, bagNumber, pinToken } = body;

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

    const resolvedBagNumber = String(bagNumber || '').trim().toUpperCase();
    if (!resolvedBagNumber) {
      return NextResponse.json(
        { error: 'Bag number is required' },
        { status: 400 }
      );
    }

    if (!BAG_NUMBER_REGEX.test(resolvedBagNumber)) {
      return NextResponse.json(
        { error: 'หมายเลขถุงไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' },
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
          contract_start_date,
          contract_end_date,
          contract_duration_days,
          loan_principal_amount,
          investor_rate,
          investor_id,
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

    const { data: existingBagAssignment, error: existingBagAssignmentError } = await supabase
      .from('drop_point_bag_assignments')
      .select('bag_number')
      .eq('contract_id', redemption.contract?.contract_id)
      .maybeSingle();

    if (existingBagAssignmentError) {
      console.error('Error checking existing bag assignment:', existingBagAssignmentError);
      return NextResponse.json(
        { error: 'Failed to verify bag assignment' },
        { status: 500 }
      );
    }

    if (
      existingBagAssignment?.bag_number &&
      existingBagAssignment.bag_number !== resolvedBagNumber
    ) {
      return NextResponse.json(
        { error: `หมายเลขถุงไม่ตรงกับข้อมูลเดิม (${existingBagAssignment.bag_number})` },
        { status: 400 }
      );
    }

    const { data: duplicateBagAssignment, error: duplicateBagAssignmentError } = await supabase
      .from('drop_point_bag_assignments')
      .select('contract_id, bag_number')
      .eq('bag_number', resolvedBagNumber)
      .maybeSingle();

    if (duplicateBagAssignmentError) {
      console.error('Error checking duplicate bag assignment:', duplicateBagAssignmentError);
      return NextResponse.json(
        { error: 'Failed to verify bag number' },
        { status: 500 }
      );
    }

    if (
      duplicateBagAssignment?.contract_id &&
      duplicateBagAssignment.contract_id !== redemption.contract?.contract_id
    ) {
      return NextResponse.json(
        { error: `หมายเลขถุง ${resolvedBagNumber} ถูกใช้กับรายการอื่นแล้ว` },
        { status: 400 }
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
    const netProfit = Math.max(0, interestEarned - platformFee);
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

    const { error: bagAssignmentError } = await supabase
      .from('drop_point_bag_assignments')
      .upsert({
        drop_point_id: dropPoint.drop_point_id,
        contract_id: redemption.contract?.contract_id,
        item_id: redemption.contract?.items?.item_id,
        bag_number: resolvedBagNumber,
        assigned_by_line_id: lineId,
        assigned_at: nowIso,
      }, { onConflict: 'contract_id' });

    if (bagAssignmentError) {
      console.error('Error saving return bag assignment:', bagAssignmentError);
      return NextResponse.json(
        { error: 'Failed to save bag assignment' },
        { status: 500 }
      );
    }

    const { error: releaseBoxError } = await supabase
      .from('drop_point_storage_boxes')
      .update({
        box_status: 'AVAILABLE',
        contract_id: null,
        item_id: null,
        customer_id: null,
        contract_number: null,
        item_brand: null,
        item_model: null,
        item_type: null,
        item_snapshot: {},
        assigned_by_line_id: null,
        occupied_at: null,
        released_at: nowIso,
        last_updated_at: nowIso,
      })
      .eq('contract_id', redemption.contract?.contract_id);

    if (releaseBoxError && releaseBoxError.code !== 'PGRST205') {
      console.error('Error releasing storage box:', releaseBoxError);
      return NextResponse.json(
        { error: 'Failed to release storage box' },
        { status: 500 }
      );
    }

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
        await pawnerLineClient.pushMessage(redemption.contract.pawners.line_id, createPawnerReturnAcknowledgementCard({
          redemptionId,
          redemption,
          bagNumber: resolvedBagNumber,
        }));
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

function createPawnerReturnAcknowledgementCard(params: {
  redemptionId: string;
  redemption: any;
  bagNumber: string;
}) {
  const { redemptionId, redemption, bagNumber } = params;
  const itemName = [redemption.contract?.items?.brand, redemption.contract?.items?.model]
    .filter(Boolean)
    .join(' ')
    .trim() || 'สินค้า';

  return {
    type: 'flex' as const,
    altText: 'สินค้าถูกส่งคืนแล้ว กรุณายืนยันการรับของ',
    contents: {
      type: 'bubble' as const,
      header: {
        type: 'box' as const,
        layout: 'vertical' as const,
        contents: [
          {
            type: 'text' as const,
            text: 'สินค้าถูกส่งคืนแล้ว',
            weight: 'bold' as const,
            size: 'lg' as const,
            color: '#ffffff',
            align: 'center' as const,
          },
          {
            type: 'text' as const,
            text: 'กรุณาถ่ายรูปสินค้าที่ได้รับคืนทุกครั้ง',
            size: 'sm' as const,
            color: '#ffffff',
            align: 'center' as const,
            margin: 'sm' as const,
            wrap: true,
          },
        ],
        backgroundColor: '#B85C38',
        paddingAll: 'lg',
      },
      body: {
        type: 'box' as const,
        layout: 'vertical' as const,
        spacing: 'md' as const,
        contents: [
          {
            type: 'box' as const,
            layout: 'baseline' as const,
            spacing: 'sm' as const,
            contents: [
              { type: 'text' as const, text: 'สัญญา:', color: '#666666', size: 'sm' as const, flex: 2 },
              { type: 'text' as const, text: redemption.contract?.contract_number || '-', color: '#333333', size: 'sm' as const, flex: 5, weight: 'bold' as const },
            ],
          },
          {
            type: 'box' as const,
            layout: 'baseline' as const,
            spacing: 'sm' as const,
            contents: [
              { type: 'text' as const, text: 'สินค้า:', color: '#666666', size: 'sm' as const, flex: 2 },
              { type: 'text' as const, text: itemName, color: '#333333', size: 'sm' as const, flex: 5, weight: 'bold' as const, wrap: true },
            ],
          },
          {
            type: 'box' as const,
            layout: 'baseline' as const,
            spacing: 'sm' as const,
            contents: [
              { type: 'text' as const, text: 'หมายเลขถุง:', color: '#666666', size: 'sm' as const, flex: 2 },
              { type: 'text' as const, text: bagNumber, color: '#B85C38', size: 'sm' as const, flex: 5, weight: 'bold' as const },
            ],
          },
          {
            type: 'separator' as const,
            margin: 'md' as const,
          },
          {
            type: 'text' as const,
            text: '1. ถ่ายรูปสินค้าก่อนแกะซองให้ชัดเจน',
            size: 'sm' as const,
            color: '#333333',
            wrap: true,
          },
          {
            type: 'text' as const,
            text: '2. ถ่ายรูปสินค้าหลังแกะซองให้ชัดเจน',
            size: 'sm' as const,
            color: '#333333',
            wrap: true,
          },
          {
            type: 'text' as const,
            text: 'หากไม่กดปุ่มภายใน 48 ชั่วโมง ระบบจะถือว่าได้รับสินค้าแล้วโดยอัตโนมัติ',
            size: 'xs' as const,
            color: '#666666',
            wrap: true,
            margin: 'md' as const,
          },
        ],
      },
      footer: {
        type: 'box' as const,
        layout: 'vertical' as const,
        spacing: 'sm' as const,
        contents: [
          {
            type: 'button' as const,
            style: 'primary' as const,
            color: '#B85C38',
            action: {
              type: 'postback' as const,
              label: 'ได้รับของคืนแล้ว',
              data: `action=pawner_confirm_received&redemptionId=${redemptionId}`,
              displayText: 'ได้รับของคืนแล้ว',
            },
          },
          {
            type: 'button' as const,
            style: 'secondary' as const,
            action: {
              type: 'postback' as const,
              label: 'ยังไม่ได้รับของ',
              data: `action=pawner_report_not_received&redemptionId=${redemptionId}`,
              displayText: 'ยังไม่ได้รับของ',
            },
          },
        ],
      },
    },
  };
}
