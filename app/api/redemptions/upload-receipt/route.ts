import { NextRequest, NextResponse } from 'next/server';
import { Client, TextMessage } from '@line/bot-sdk';
import { supabaseAdmin } from '@/lib/supabase/client';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import { acquireTransactionLock, transactionLockErrorResponse } from '@/lib/security/transaction-lock';
import {
  boundedText,
  readBoundedJsonObject,
  requireOwnedBlobUrl,
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
    const claimedLineId = boundedText(body?.pawnerLineId, 128, true) || '';
    const verifiedLineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);

    if (!Array.isArray(body?.receiptPhotos) || body.receiptPhotos.length < 1 || body.receiptPhotos.length > 6) {
      return NextResponse.json(
        { error: 'กรุณาอัปโหลดรูปหลักฐาน 1-6 รูป' },
        { status: 400 },
      );
    }
    const receiptPhotos = body.receiptPhotos.map((url: unknown) => requireOwnedBlobUrl(
      url,
      ['pawn-items/', 'redemption-receipts/'],
    ));

    releaseLock = await acquireTransactionLock('redemption-receipt', redemptionId, 90);

    const supabase = supabaseAdmin();
    const { data: redemption, error } = await supabase
      .from('redemption_requests')
      .select(`
        redemption_id,
        request_status,
        item_return_confirmed_at,
        pawner_receipt_uploaded_at,
        contract:contract_id (
          contract_id,
          contract_number,
          contract_status,
          item_delivery_status,
          pawners:customer_id (line_id)
        )
      `)
      .eq('redemption_id', redemptionId)
      .single();

    if (error || !redemption) {
      return NextResponse.json({ error: 'ไม่พบคำขอไถ่ถอน' }, { status: 404 });
    }

    const contract = Array.isArray(redemption.contract) ? redemption.contract[0] : redemption.contract;
    const pawner = Array.isArray(contract?.pawners) ? contract.pawners[0] : contract?.pawners;
    if (!pawner?.line_id || pawner.line_id !== verifiedLineId) {
      return NextResponse.json({ error: 'คุณไม่มีสิทธิ์ดำเนินการกับรายการนี้' }, { status: 403 });
    }

    if (redemption.pawner_receipt_uploaded_at) {
      return NextResponse.json({ success: true, alreadyUploaded: true });
    }

    // A seller-supplied photo is evidence only; it must never be able to mark
    // a financial contract complete. Completion must already have been
    // confirmed by the assigned Drop Point workflow.
    if (
      redemption.request_status !== 'COMPLETED'
      || !redemption.item_return_confirmed_at
      || contract?.contract_status !== 'COMPLETED'
      || contract?.item_delivery_status !== 'RETURNED'
    ) {
      return NextResponse.json(
        {
          error: 'จุดรับฝากยังไม่ได้ยืนยันการส่งคืนสินค้า กรุณารอการยืนยันก่อนส่งหลักฐาน',
          code: 'RETURN_NOT_CONFIRMED',
        },
        { status: 409, headers: { 'Retry-After': '30' } },
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('redemption_requests')
      .update({
        pawner_receipt_photos: receiptPhotos,
        pawner_receipt_uploaded_at: now,
        // Uploading is not independent proof that the photos are authentic.
        pawner_receipt_verified: false,
        updated_at: now,
      })
      .eq('redemption_id', redemptionId)
      .eq('request_status', 'COMPLETED')
      .not('item_return_confirmed_at', 'is', null)
      .is('pawner_receipt_uploaded_at', null)
      .select('redemption_id')
      .maybeSingle();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
        { status: 409 },
      );
    }

    if (pawnerLineClient) {
      try {
        await pawnerLineClient.pushMessage(verifiedLineId, {
          type: 'text',
          text: `ได้รับรูปหลักฐานการรับสินค้าคืนแล้ว\n\nสัญญา ${contract.contract_number}\n\nขอบคุณที่ใช้บริการ Astly`,
        } as TextMessage);
      } catch {
        console.error('Error sending redemption receipt acknowledgement');
      }
    }

    return NextResponse.json({
      success: true,
      message: 'บันทึกรูปหลักฐานเรียบร้อยแล้ว',
    });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error uploading redemption receipt');
    return sanitizedServerError('ไม่สามารถบันทึกรูปหลักฐานได้ กรุณาลองใหม่');
  } finally {
    if (releaseLock) await releaseLock();
  }
}
