import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { getCompanyBankAccount, verifyPaymentSlip } from '@/lib/services/slip-verification';
import { Client, FlexMessage } from '@line/bot-sdk';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import { acquireTransactionLock, transactionLockErrorResponse } from '@/lib/security/transaction-lock';
import { paymentEvidenceWasUsed } from '@/lib/security/payment-evidence';
import {
  boundedText,
  fingerprintOwnedBlob,
  readBoundedJsonObject,
  requireOwnedBlobUrl,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const createLineClient = (channelAccessToken?: string, channelSecret?: string) => {
  if (!channelAccessToken) {
    return null;
  }
  return new Client({
    channelAccessToken,
    channelSecret: channelSecret || '',
  });
};

const pawnerLineClient = createLineClient(
  process.env.LINE_CHANNEL_ACCESS_TOKEN,
  process.env.LINE_CHANNEL_SECRET
);
const dropPointLineClient = createLineClient(
  process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT,
  process.env.LINE_CHANNEL_SECRET_DROPPOINT
);

const getDropPointUrl = (deliveryRequestId: string) => {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_PICKUP || '2008651088-cx00A4cZ';
  return `https://liff.line.me/${liffId}?deliveryRequestId=${encodeURIComponent(deliveryRequestId)}`;
};

const buildDropPointPickupCard = (payload: {
  deliveryRequestId: string;
  contractNumber: string;
  itemName: string;
  addressFull: string;
  contactPhone?: string | null;
  feeAmount: number;
}) => {
  const { deliveryRequestId, contractNumber, itemName, addressFull, contactPhone, feeAmount } = payload;
  return {
    type: 'flex',
    altText: 'รับงานไปรับสินค้า',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'รับงานไปรับสินค้า',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
            align: 'center',
          },
          {
            type: 'text',
            text: 'พร้อมให้เข้ารับสินค้าแล้ว',
            size: 'sm',
            color: '#ffffff',
            align: 'center',
            margin: 'sm',
          },
        ],
        backgroundColor: '#365314',
        paddingAll: 'lg',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'สัญญา:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: contractNumber, color: '#333333', size: 'sm', flex: 5, weight: 'bold' },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'สินค้า:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: itemName, color: '#333333', size: 'sm', flex: 5, weight: 'bold' },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'ค่าจัดส่ง:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: `${feeAmount.toLocaleString()} บาท (บริษัทรับผิดชอบ)`, color: '#C0562F', size: 'sm', flex: 5, weight: 'bold' },
            ],
          },
          {
            type: 'separator',
            margin: 'lg',
          },
          {
            type: 'text',
            text: 'ที่อยู่รับสินค้า',
            size: 'sm',
            weight: 'bold',
            color: '#333333',
            margin: 'md',
          },
          {
            type: 'text',
            text: addressFull || '-',
            size: 'sm',
            color: '#555555',
            wrap: true,
          },
          {
            type: 'text',
            text: contactPhone ? `โทร: ${contactPhone}` : 'โทร: -',
            size: 'sm',
            color: '#555555',
            margin: 'sm',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'อัปเดตสถานะรับของ',
              uri: getDropPointUrl(deliveryRequestId),
            },
            style: 'primary',
            color: '#365314',
          },
        ],
      },
    },
  } as FlexMessage;
};

const buildPawnerStatusCard = (payload: {
  contractNumber: string;
  itemName: string;
}) => {
  const { contractNumber, itemName } = payload;
  return {
    type: 'flex',
    altText: 'แจ้งการเข้ารับสินค้า',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'รับข้อมูลเรียบร้อย',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
            align: 'center',
          },
          {
            type: 'text',
            text: 'Drop Point กำลังประสานรถเข้ารับสินค้า',
            size: 'sm',
            color: '#ffffff',
            align: 'center',
            margin: 'sm',
            wrap: true,
          },
        ],
        backgroundColor: '#C0562F',
        paddingAll: 'lg',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: 'กรุณาเตรียมสินค้าไว้ให้พร้อม รถจะเข้ารับภายใน 2 ชั่วโมง',
            size: 'sm',
            color: '#444444',
            wrap: true,
          },
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'สัญญา:', size: 'sm', color: '#666666', flex: 2 },
              { type: 'text', text: contractNumber, size: 'sm', color: '#333333', weight: 'bold', flex: 5, wrap: true },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'สินค้า:', size: 'sm', color: '#666666', flex: 2 },
              { type: 'text', text: itemName || '-', size: 'sm', color: '#333333', weight: 'bold', flex: 5, wrap: true },
            ],
          },
        ],
      },
    },
  } as FlexMessage;
};

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  let releaseEvidenceLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request) as any;
    const deliveryRequestId = requireUuid(body?.deliveryRequestId);
    const slipUrl = requireOwnedBlobUrl(body?.slipUrl, ['pawn-items/', 'slips/']);
    const pawnerLineId = boundedText(body?.pawnerLineId, 128, true) || '';
    const verifiedLineId = await requireLiffOwner(request, 'PAWNER', pawnerLineId);

    releaseLock = await acquireTransactionLock('pawn-delivery-slip', deliveryRequestId, 300);

    const supabase = supabaseAdmin();

    const { data: deliveryRequest, error: deliveryError } = await supabase
      .from('pawn_delivery_requests')
      .select('*')
      .eq('delivery_request_id', deliveryRequestId)
      .single();

    if (deliveryError || !deliveryRequest) {
      return NextResponse.json(
        { error: 'Delivery request not found' },
        { status: 404 }
      );
    }

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        item_delivery_status,
        items:item_id (brand, model, image_urls),
        pawners:customer_id (line_id, firstname, lastname),
        drop_points:drop_point_id (drop_point_name, line_id, phone_number)
      `)
      .eq('contract_id', deliveryRequest.contract_id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const pawner = Array.isArray(contract.pawners)
      ? contract.pawners[0]
      : contract.pawners;
    const dropPoint = Array.isArray(contract.drop_points)
      ? contract.drop_points[0]
      : contract.drop_points;
    const item = Array.isArray(contract.items)
      ? contract.items[0]
      : contract.items;

    if (!pawner?.line_id || pawner.line_id !== verifiedLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    if (deliveryRequest.slip_verification_result === 'MATCHED') {
      return NextResponse.json({
        success: true,
        alreadyVerified: true,
        result: 'MATCHED',
      });
    }

    const slipFingerprint = `sha256:${await fingerprintOwnedBlob(slipUrl)}`;
    releaseEvidenceLock = await acquireTransactionLock('payment-evidence', slipFingerprint.slice(7), 300);

    if (await paymentEvidenceWasUsed(supabase, slipFingerprint)) {
      return NextResponse.json(
        { error: 'สลิปนี้ถูกใช้แล้ว กรุณาใช้สลิปใหม่' },
        { status: 409 },
      );
    }

    const validStatuses = ['AWAITING_PAYMENT', 'PAYMENT_REJECTED', 'SLIP_UPLOADED'];
    if (!validStatuses.includes(deliveryRequest.status)) {
      return NextResponse.json(
        { error: 'สถานะไม่ถูกต้องสำหรับการตรวจสอบสลิป' },
        { status: 400 }
      );
    }

    const attemptCount = (deliveryRequest.slip_attempt_count || 0) + 1;
    if (attemptCount > 2) {
      const { data: rejected, error: rejectError } = await supabase
        .from('pawn_delivery_requests')
        .update({
          status: 'PAYMENT_REJECTED',
          updated_at: new Date().toISOString(),
        })
        .eq('delivery_request_id', deliveryRequestId)
        .in('status', validStatuses)
        .select('delivery_request_id')
        .maybeSingle();

      if (rejectError) {
        return sanitizedServerError('ไม่สามารถบันทึกสถานะสลิปได้ กรุณาลองใหม่');
      }
      if (!rejected) {
        return NextResponse.json(
          { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: 'เกินจำนวนครั้งที่อนุญาต กรุณาติดต่อฝ่าย Support' },
        { status: 400 }
      );
    }

    const expectedAmount = Number(deliveryRequest.delivery_fee ?? 40);
    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
      return NextResponse.json(
        { error: 'ไม่สามารถตรวจสอบยอดค่าจัดส่งได้ กรุณาติดต่อฝ่ายสนับสนุน' },
        { status: 409 },
      );
    }
    const companyBank = await getCompanyBankAccount();
    const verificationResult = await verifyPaymentSlip(slipUrl, expectedAmount, {
      receiverAccountNo: companyBank.account_number || companyBank.bank_account_no || null,
      receiverPromptpay: companyBank.promptpay_number || null,
      receiverName: companyBank.account_name || companyBank.bank_account_name || null,
      useSlipOkLogCheck: true,
    });

    const updatePayload: any = {
      slip_url: slipUrl,
      slip_uploaded_at: new Date().toISOString(),
      slip_amount_detected: verificationResult.detectedAmount,
      slip_verification_result: verificationResult.result,
      slip_verification_details: {
        provider: verificationResult.rawResponse?.provider || null,
        fingerprint: slipFingerprint,
      },
      slip_attempt_count: attemptCount,
      updated_at: new Date().toISOString(),
    };

    if (verificationResult.result === 'MATCHED') {
      updatePayload.status = 'DRIVER_SEARCH';
      updatePayload.payment_verified_at = new Date().toISOString();

      const { data: updatedDelivery, error: deliveryUpdateError } = await supabase
        .from('pawn_delivery_requests')
        .update(updatePayload)
        .eq('delivery_request_id', deliveryRequestId)
        .in('status', validStatuses)
        .select('delivery_request_id')
        .maybeSingle();

      if (deliveryUpdateError) {
        return sanitizedServerError('ไม่สามารถบันทึกผลตรวจสลิปได้ กรุณาลองใหม่');
      }
      if (!updatedDelivery) {
        return NextResponse.json(
          { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
          { status: 409 },
        );
      }

      let contractUpdateQuery = supabase
        .from('contracts')
        .update({
          item_delivery_status: 'PENDING',
          updated_at: new Date().toISOString(),
        })
        .eq('contract_id', deliveryRequest.contract_id);
      contractUpdateQuery = contract.item_delivery_status === null
        ? contractUpdateQuery.is('item_delivery_status', null)
        : contractUpdateQuery.eq('item_delivery_status', contract.item_delivery_status);
      const { data: updatedContract, error: contractUpdateError } = await contractUpdateQuery
        .select('contract_id')
        .maybeSingle();

      if (contractUpdateError || !updatedContract) {
        await supabase
          .from('pawn_delivery_requests')
          .update({
            status: deliveryRequest.status,
            slip_url: deliveryRequest.slip_url,
            slip_uploaded_at: deliveryRequest.slip_uploaded_at,
            slip_amount_detected: deliveryRequest.slip_amount_detected,
            slip_verification_result: deliveryRequest.slip_verification_result,
            slip_verification_details: deliveryRequest.slip_verification_details,
            slip_attempt_count: deliveryRequest.slip_attempt_count,
            payment_verified_at: deliveryRequest.payment_verified_at,
            updated_at: new Date().toISOString(),
          })
          .eq('delivery_request_id', deliveryRequestId)
          .eq('status', 'DRIVER_SEARCH');
        if (contractUpdateError) {
          return sanitizedServerError('ไม่สามารถบันทึกสถานะสัญญาได้ กรุณาลองใหม่');
        }
        return NextResponse.json(
          { error: 'สถานะสัญญาเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
          { status: 409 },
        );
      }

      if (pawner?.line_id && pawnerLineClient) {
        try {
          const itemName = `${[item?.brand, item?.model].filter(Boolean).join(' ') || '-'}`.trim();
          const card = buildPawnerStatusCard({
            contractNumber: contract.contract_number,
            itemName: itemName || '-',
          });
          await pawnerLineClient.pushMessage(pawner.line_id, card);
        } catch {
          console.error('Error sending delivery status to pawner');
        }
      }

      if (dropPoint?.line_id && dropPointLineClient) {
        try {
          const itemName = `${[item?.brand, item?.model].filter(Boolean).join(' ') || '-'}`.trim();
          const card = buildDropPointPickupCard({
            deliveryRequestId,
            contractNumber: contract.contract_number,
            itemName: itemName || '-',
            addressFull: deliveryRequest.address_full || '',
            contactPhone: deliveryRequest.contact_phone,
            feeAmount: expectedAmount,
          });
          await dropPointLineClient.pushMessage(dropPoint.line_id, card);
        } catch {
          console.error('Error sending delivery pickup to drop point');
        }
      }

      return NextResponse.json({
        success: true,
        result: verificationResult.result,
        message: 'ตรวจสอบสลิปสำเร็จ',
        expectedAmount,
      });
    }

    if (verificationResult.result === 'UNDERPAID' || verificationResult.result === 'INVALID') {
      updatePayload.status = 'PAYMENT_REJECTED';
    } else {
      updatePayload.status = 'SLIP_UPLOADED';
    }

    const { data: updatedDelivery, error: deliveryUpdateError } = await supabase
      .from('pawn_delivery_requests')
      .update(updatePayload)
      .eq('delivery_request_id', deliveryRequestId)
      .in('status', validStatuses)
      .select('delivery_request_id')
      .maybeSingle();

    if (deliveryUpdateError) {
      return sanitizedServerError('ไม่สามารถบันทึกผลตรวจสลิปได้ กรุณาลองใหม่');
    }
    if (!updatedDelivery) {
      return NextResponse.json(
        { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: false,
      result: verificationResult.result,
      message: verificationResult.message,
      expectedAmount,
      detectedAmount: verificationResult.detectedAmount,
    });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error verifying delivery slip');
    return sanitizedServerError('ไม่สามารถตรวจสอบสลิปได้ กรุณาลองใหม่');
  } finally {
    if (releaseLock) await releaseLock();
    if (releaseEvidenceLock) await releaseEvidenceLock();
  }
}
