import { NextRequest, NextResponse } from 'next/server';
import { Client, TextMessage } from '@line/bot-sdk';
import { supabaseAdmin } from '@/lib/supabase/client';
import { requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import { acquireTransactionLock, transactionLockErrorResponse } from '@/lib/security/transaction-lock';
import {
  boundedText,
  finiteNumber,
  readBoundedJsonObject,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const pawnerLineClient = process.env.LINE_CHANNEL_ACCESS_TOKEN
  ? new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
  })
  : null;

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request) as any;
    const redemptionId = requireUuid(body?.redemptionId);
    const action = boundedText(body?.action, 40, true) || '';
    if (!['amount_correct', 'amount_incorrect'].includes(action)) {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง' }, { status: 400 });
    }

    const identity = await requireLiffIdentity(request, 'DROP_POINT');
    releaseLock = await acquireTransactionLock('redemption-payment-review', redemptionId, 90);

    const supabase = supabaseAdmin();
    const { data: redemption, error } = await supabase
      .from('redemption_requests')
      .select(`
        redemption_id,
        request_status,
        total_amount,
        delivery_method,
        contract:contract_id (
          contract_id,
          contract_number,
          items:item_id (brand, model),
          pawners:customer_id (line_id),
          drop_points:drop_point_id (drop_point_name, phone_number, line_id)
        )
      `)
      .eq('redemption_id', redemptionId)
      .single();

    if (error || !redemption) {
      return NextResponse.json({ error: 'ไม่พบคำขอไถ่ถอน' }, { status: 404 });
    }

    const contract = Array.isArray(redemption.contract) ? redemption.contract[0] : redemption.contract;
    const dropPoint = Array.isArray(contract?.drop_points) ? contract.drop_points[0] : contract?.drop_points;
    const pawner = Array.isArray(contract?.pawners) ? contract.pawners[0] : contract?.pawners;
    const item = Array.isArray(contract?.items) ? contract.items[0] : contract?.items;
    if (!dropPoint?.line_id || dropPoint.line_id !== identity.lineId) {
      return NextResponse.json({ error: 'คุณไม่มีสิทธิ์ดำเนินการกับรายการนี้' }, { status: 403 });
    }

    if (redemption.request_status === 'AMOUNT_VERIFIED' && action === 'amount_correct') {
      return NextResponse.json({ success: true, alreadyVerified: true });
    }
    if (!['SLIP_UPLOADED', 'AMOUNT_MISMATCH'].includes(redemption.request_status)) {
      return NextResponse.json(
        { error: 'สถานะรายการไม่สามารถตรวจสอบยอดได้' },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    let message = '';
    if (action === 'amount_correct') {
      const { data: updated, error: updateError } = await supabase
        .from('redemption_requests')
        .update({
          request_status: 'AMOUNT_VERIFIED',
          actual_amount_received: Number(redemption.total_amount || 0),
          amount_difference: 0,
          mismatch_type: null,
          mismatch_resolved: true,
          mismatch_resolved_at: now,
          verified_at: now,
          verified_by_line_id: identity.lineId,
          updated_at: now,
        })
        .eq('redemption_id', redemptionId)
        .in('request_status', ['SLIP_UPLOADED', 'AMOUNT_MISMATCH'])
        .select('redemption_id')
        .maybeSingle();
      if (updateError || !updated) {
        return NextResponse.json({ error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' }, { status: 409 });
      }

      const itemName = [item?.brand, item?.model].filter(Boolean).join(' ').trim() || 'สินค้า';
      message = `ยอดเงินถูกต้องแล้ว\n\nสัญญา: ${contract?.contract_number || '-'}\nสินค้า: ${itemName}\n\n${deliveryInstruction(redemption.delivery_method, dropPoint?.drop_point_name)}`;
    } else {
      const difference = finiteNumber(body?.additionalAmount, {
        min: -100_000_000,
        max: 100_000_000,
        required: true,
      }) || 0;
      if (difference === 0) {
        return NextResponse.json({ error: 'กรุณาระบุยอดส่วนต่าง' }, { status: 400 });
      }

      const { data: updated, error: updateError } = await supabase
        .from('redemption_requests')
        .update({
          request_status: 'AMOUNT_MISMATCH',
          actual_amount_received: Number(redemption.total_amount || 0) + difference,
          amount_difference: difference,
          mismatch_type: difference > 0 ? 'OVERPAID' : 'UNDERPAID',
          verified_by_line_id: identity.lineId,
          updated_at: now,
        })
        .eq('redemption_id', redemptionId)
        .in('request_status', ['SLIP_UPLOADED', 'AMOUNT_MISMATCH'])
        .select('redemption_id')
        .maybeSingle();
      if (updateError || !updated) {
        return NextResponse.json({ error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' }, { status: 409 });
      }

      const itemName = [item?.brand, item?.model].filter(Boolean).join(' ').trim() || 'สินค้า';
      if (difference > 0) {
        message = `ยอดเงินที่โอนเกิน\n\nสัญญา: ${contract?.contract_number || '-'}\nสินค้า: ${itemName}\n\nยอดที่โอนเกินไป ${difference.toLocaleString()} บาท\n\nกรุณาติดต่อ ${dropPoint?.drop_point_name || 'จุดรับฝาก'} ที่เบอร์ ${dropPoint?.phone_number || 'ไม่ระบุ'} เพื่อรับเงินคืน`;
      } else {
        message = `ยอดเงินที่โอนขาด\n\nสัญญา: ${contract?.contract_number || '-'}\nสินค้า: ${itemName}\n\nยอดที่ขาดไป ${Math.abs(difference).toLocaleString()} บาท\n\nกรุณาติดต่อฝ่ายสนับสนุนเพื่อขอรายละเอียดการชำระเพิ่มเติม`;
      }
    }

    if (pawner?.line_id && pawnerLineClient && message) {
      try {
        await pawnerLineClient.pushMessage(pawner.line_id, {
          type: 'text',
          text: message,
        } as TextMessage);
      } catch {
        console.error('Error sending redemption payment review message');
      }
    }

    return NextResponse.json({ success: true, message: 'บันทึกผลตรวจสอบยอดเรียบร้อยแล้ว' });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error reviewing redemption payment');
    return sanitizedServerError('ไม่สามารถบันทึกผลตรวจสอบยอดได้ กรุณาลองใหม่');
  } finally {
    if (releaseLock) await releaseLock();
  }
}

function deliveryInstruction(method: string | null, dropPointName?: string | null): string {
  const location = dropPointName || 'จุดรับฝาก';
  if (['SELF_PICKUP', 'DROPPOINT_SELF_PICKUP'].includes(method || '')) {
    return `กรุณามารับสินค้าที่ ${location} พร้อมแสดงหลักฐานการโอนเงิน`;
  }
  if (['SELF_ARRANGE', 'DROPPOINT_SELF_RIDER'].includes(method || '')) {
    return `กรุณานัดหมายกับ ${location} เพื่อมารับสินค้า`;
  }
  if (method === 'CENTRAL_SCHEDULE_7D') {
    return `Astly จะส่งสินค้ากลับไปยัง ${location} ภายใน 7 วัน`;
  }
  if (method === 'CENTRAL_SELF_PICKUP_TODAY') {
    return 'กรุณาเปิดใบรับของและแสดง QR เมื่อต้องรับสินค้าที่คลังกลาง Astly วันนี้';
  }
  if (method === 'DROPPOINT_NEXT_DAY_PICKUP') {
    return `Astly จะส่งสินค้ากลับไปยัง ${location} เพื่อให้รับในวันถัดไป`;
  }
  return `${location} จะเตรียมสินค้าและประสานการส่งคืนให้คุณ`;
}
