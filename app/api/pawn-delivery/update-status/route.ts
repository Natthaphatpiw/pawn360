import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client } from '@line/bot-sdk';

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

const getPawnerStatusUrl = (contractId: string) => {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_PAWNER_DELIVERY || '2008216710-690r5uXQ';
  return `https://liff.line.me/${liffId}?contractId=${encodeURIComponent(contractId)}`;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deliveryRequestId = typeof body?.deliveryRequestId === 'string' ? body.deliveryRequestId.trim() : '';
    const lineId = typeof body?.lineId === 'string' ? body.lineId.trim() : '';
    const action = typeof body?.action === 'string' ? body.action.trim() : '';

    if (!deliveryRequestId || !lineId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: deliveryRequest, error: requestError } = await supabase
      .from('pawn_delivery_requests')
      .select('*')
      .eq('delivery_request_id', deliveryRequestId)
      .single();

    if (requestError || !deliveryRequest) {
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
        items:item_id (brand, model),
        pawners:customer_id (line_id),
        drop_points:drop_point_id (line_id, drop_point_name)
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

    const isPawner = pawner?.line_id === lineId;
    const isDropPoint = dropPoint?.line_id === lineId;

    const now = new Date().toISOString();
    const updatePayload: any = { updated_at: now };
    const contractPayload: any = { updated_at: now };

    if (action === 'DRIVER_ASSIGNED') {
      if (!isDropPoint) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        );
      }
      if (!['DRIVER_SEARCH', 'PAYMENT_VERIFIED'].includes(deliveryRequest.status)) {
        return NextResponse.json(
          { error: 'สถานะปัจจุบันไม่สามารถอัปเดตเป็นมีรถมารับงานได้' },
          { status: 400 }
        );
      }
      updatePayload.status = 'DRIVER_ASSIGNED';
      updatePayload.driver_assigned_at = now;
      contractPayload.item_delivery_status = 'IN_TRANSIT';
    } else if (action === 'PAWNER_CONFIRMED') {
      if (!isPawner) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        );
      }
      if (deliveryRequest.status !== 'DRIVER_ASSIGNED') {
        return NextResponse.json(
          { error: 'ยังไม่อยู่ในสถานะที่ยืนยันรับของได้' },
          { status: 400 }
        );
      }
      updatePayload.status = 'ITEM_PICKED';
      updatePayload.item_picked_at = now;
      contractPayload.item_delivery_status = 'PAWNER_CONFIRMED';
    } else if (action === 'ARRIVED') {
      if (!isDropPoint) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        );
      }
      if (deliveryRequest.status !== 'ITEM_PICKED') {
        return NextResponse.json(
          { error: 'ต้องรอให้ผู้จำนำยืนยันรับของก่อน' },
          { status: 400 }
        );
      }
      updatePayload.status = 'ARRIVED';
      updatePayload.arrived_at = now;
      contractPayload.item_delivery_status = 'RECEIVED_AT_DROP_POINT';
      contractPayload.item_received_at = now;
    } else {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    await supabase
      .from('pawn_delivery_requests')
      .update(updatePayload)
      .eq('delivery_request_id', deliveryRequestId);

    await supabase
      .from('contracts')
      .update(contractPayload)
      .eq('contract_id', deliveryRequest.contract_id);

    if (action === 'ARRIVED' && pawner?.line_id && pawnerLineClient) {
      const statusUrl = getPawnerStatusUrl(contract.contract_id);
      try {
        await pawnerLineClient.pushMessage(pawner.line_id, {
          type: 'text',
          text: `สินค้าถึง Drop Point แล้ว\nกำลังอยู่ในขั้นตอนตรวจสอบสินค้า\n\nเช็คสถานะได้ที่นี่:\n${statusUrl}`,
        });
      } catch (msgError) {
        console.error('Error sending arrival message to pawner:', msgError);
      }
    }

    return NextResponse.json({
      success: true,
      status: updatePayload.status,
    });
  } catch (error: any) {
    console.error('Error updating delivery status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
