import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifyPaymentSlip } from '@/lib/services/slip-verification';
import { Client, FlexMessage } from '@line/bot-sdk';

const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
});

const dropPointLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_DROPPOINT || '',
});

const getPawnerStatusUrl = (contractId: string) => {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_PAWNER_DELIVERY || '2008216710-690r5uXQ';
  return `https://liff.line.me/${liffId}?contractId=${encodeURIComponent(contractId)}`;
};

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
            text: 'มีผู้จำนำชำระค่าจัดส่งแล้ว',
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
              { type: 'text', text: `${feeAmount.toLocaleString()} บาท`, color: '#C0562F', size: 'sm', flex: 5, weight: 'bold' },
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deliveryRequestId = typeof body?.deliveryRequestId === 'string' ? body.deliveryRequestId.trim() : '';
    const slipUrl = typeof body?.slipUrl === 'string' ? body.slipUrl.trim() : '';
    const pawnerLineId = typeof body?.pawnerLineId === 'string' ? body.pawnerLineId.trim() : '';

    if (!deliveryRequestId || !slipUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

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

    if (pawnerLineId && contract.pawners?.line_id !== pawnerLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
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
      await supabase
        .from('pawn_delivery_requests')
        .update({
          status: 'PAYMENT_REJECTED',
          updated_at: new Date().toISOString(),
        })
        .eq('delivery_request_id', deliveryRequestId);

      return NextResponse.json(
        { error: 'เกินจำนวนครั้งที่อนุญาต กรุณาติดต่อฝ่าย Support' },
        { status: 400 }
      );
    }

    const expectedAmount = Number(deliveryRequest.delivery_fee || 40);
    const verificationResult = await verifyPaymentSlip(slipUrl, expectedAmount);

    const updatePayload: any = {
      slip_url: slipUrl,
      slip_uploaded_at: new Date().toISOString(),
      slip_amount_detected: verificationResult.detectedAmount,
      slip_verification_result: verificationResult.result,
      slip_verification_details: verificationResult.rawResponse,
      slip_attempt_count: attemptCount,
      updated_at: new Date().toISOString(),
    };

    if (verificationResult.result === 'MATCHED' || verificationResult.result === 'OVERPAID') {
      updatePayload.status = 'DRIVER_SEARCH';
      updatePayload.payment_verified_at = new Date().toISOString();

      await supabase
        .from('pawn_delivery_requests')
        .update(updatePayload)
        .eq('delivery_request_id', deliveryRequestId);

      await supabase
        .from('contracts')
        .update({
          item_delivery_status: 'PENDING',
          updated_at: new Date().toISOString(),
        })
        .eq('contract_id', deliveryRequest.contract_id);

      const statusUrl = getPawnerStatusUrl(contract.contract_id);

      if (contract.pawners?.line_id) {
        try {
          await pawnerLineClient.pushMessage(contract.pawners.line_id, {
            type: 'text',
            text: `ชำระค่าส่งเรียบร้อยแล้ว\n\nDrop Point จะเรียกรถไปรับสินค้าของคุณภายใน 2 ชั่วโมง\nกรุณาเตรียมสินค้าไว้ให้พร้อม\n\nเช็คสถานะการเข้ารับสินค้าได้ที่นี่:\n${statusUrl}`,
          });
        } catch (msgError) {
          console.error('Error sending delivery status to pawner:', msgError);
        }
      }

      if (contract.drop_points?.line_id && process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT) {
        try {
          const itemName = `${contract.items?.brand || ''} ${contract.items?.model || ''}`.trim();
          const card = buildDropPointPickupCard({
            deliveryRequestId,
            contractNumber: contract.contract_number,
            itemName: itemName || '-',
            addressFull: deliveryRequest.address_full || '',
            contactPhone: deliveryRequest.contact_phone,
            feeAmount: expectedAmount,
          });
          await dropPointLineClient.pushMessage(contract.drop_points.line_id, card);
        } catch (msgError) {
          console.error('Error sending delivery pickup to drop point:', msgError);
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

    await supabase
      .from('pawn_delivery_requests')
      .update(updatePayload)
      .eq('delivery_request_id', deliveryRequestId);

    return NextResponse.json({
      success: false,
      result: verificationResult.result,
      message: verificationResult.message,
      expectedAmount,
      detectedAmount: verificationResult.detectedAmount,
    });
  } catch (error: any) {
    console.error('Error verifying delivery slip:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
