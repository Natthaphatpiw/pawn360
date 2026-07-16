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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deliveryRequestId = typeof body?.deliveryRequestId === 'string' ? body.deliveryRequestId.trim() : '';
    const contractIdFromBody = typeof body?.contractId === 'string' ? body.contractId.trim() : '';
    const lineId = typeof body?.lineId === 'string' ? body.lineId.trim() : '';
    const action = typeof body?.action === 'string' ? body.action.trim() : '';

    if ((!deliveryRequestId && !contractIdFromBody) || !lineId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    let deliveryRequest: any = null;

    if (deliveryRequestId) {
      const { data, error } = await supabase
        .from('pawn_delivery_requests')
        .select('*')
        .eq('delivery_request_id', deliveryRequestId)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json(
          { error: 'Delivery request not found' },
          { status: 404 }
        );
      }

      deliveryRequest = data;
    } else if (contractIdFromBody) {
      const { data, error } = await supabase
        .from('pawn_delivery_requests')
        .select('*')
        .eq('contract_id', contractIdFromBody)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST205') {
        throw error;
      }

      deliveryRequest = data || null;
    }

    if (!deliveryRequest && action !== 'ARRIVED') {
      return NextResponse.json(
        { error: 'Delivery request not found' },
        { status: 404 }
      );
    }

    const contractId = deliveryRequest?.contract_id || contractIdFromBody;

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        item_delivery_status,
        item_received_at,
        items:item_id (brand, model),
        pawners:customer_id (line_id),
        drop_points:drop_point_id (line_id, drop_point_name)
      `)
      .eq('contract_id', contractId)
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
    let shouldUpdateDeliveryRequest = Boolean(deliveryRequest);

    if (action === 'DRIVER_ASSIGNED') {
      if (!deliveryRequest) {
        return NextResponse.json(
          { error: 'Delivery request not found' },
          { status: 404 }
        );
      }
      if (!isDropPoint) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        );
      }
      if (!['DRIVER_SEARCH', 'PAYMENT_VERIFIED', 'AWAITING_PAYMENT', 'PAYMENT_REJECTED', 'SLIP_UPLOADED'].includes(deliveryRequest.status)) {
        return NextResponse.json(
          { error: 'สถานะปัจจุบันไม่สามารถอัปเดตเป็นมีรถมารับงานได้' },
          { status: 400 }
        );
      }
      updatePayload.status = 'DRIVER_ASSIGNED';
      updatePayload.driver_assigned_at = now;
      contractPayload.item_delivery_status = 'IN_TRANSIT';
    } else if (action === 'PAWNER_CONFIRMED') {
      if (!deliveryRequest) {
        return NextResponse.json(
          { error: 'Delivery request not found' },
          { status: 404 }
        );
      }
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

      const deliveryRequestCanArrive = deliveryRequest
        ? ['DRIVER_ASSIGNED', 'ITEM_PICKED', 'ARRIVED'].includes(deliveryRequest.status)
        : false;
      const contractCanArrive = ['PAWNER_CONFIRMED', 'IN_TRANSIT', 'RECEIVED_AT_DROP_POINT'].includes(contract.item_delivery_status);

      if (!deliveryRequestCanArrive && !contractCanArrive) {
        return NextResponse.json(
          { error: 'สถานะปัจจุบันยังไม่สามารถเปลี่ยนเป็นสินค้าถึง Drop Point ได้' },
          { status: 400 }
        );
      }

      if (deliveryRequest) {
        updatePayload.status = 'ARRIVED';
        updatePayload.arrived_at = deliveryRequest.arrived_at || now;
      } else {
        shouldUpdateDeliveryRequest = false;
      }

      contractPayload.item_delivery_status = 'RECEIVED_AT_DROP_POINT';
      contractPayload.item_received_at = contract.item_received_at || now;
    } else {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    if (shouldUpdateDeliveryRequest && deliveryRequest?.delivery_request_id) {
      const { error: deliveryUpdateError } = await supabase
        .from('pawn_delivery_requests')
        .update(updatePayload)
        .eq('delivery_request_id', deliveryRequest.delivery_request_id);

      if (deliveryUpdateError) {
        throw deliveryUpdateError;
      }
    }

    const { error: contractUpdateError } = await supabase
      .from('contracts')
      .update(contractPayload)
      .eq('contract_id', contract.contract_id);

    if (contractUpdateError) {
      throw contractUpdateError;
    }

    if (action === 'ARRIVED' && contract.item_delivery_status !== 'RECEIVED_AT_DROP_POINT' && pawner?.line_id && pawnerLineClient) {
      try {
        await pawnerLineClient.pushMessage(pawner.line_id, {
          type: 'text',
          text: 'สินค้าถึง Drop Point แล้ว\nกำลังอยู่ในขั้นตอนตรวจสอบสินค้า',
        });
      } catch (msgError) {
        console.error('Error sending arrival message to pawner:', msgError);
      }
    }

    return NextResponse.json({
      success: true,
      status: updatePayload.status || (action === 'ARRIVED' ? 'ARRIVED' : undefined),
      itemDeliveryStatus: contractPayload.item_delivery_status,
    });
  } catch (error: any) {
    console.error('Error updating delivery status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
