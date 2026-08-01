import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client } from '@line/bot-sdk';
import { requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import { acquireTransactionLock, transactionLockErrorResponse } from '@/lib/security/transaction-lock';
import {
  boundedText,
  readBoundedJsonObject,
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

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  let releaseContractLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request) as any;
    const deliveryRequestId = body?.deliveryRequestId ? requireUuid(body.deliveryRequestId) : '';
    const contractIdFromBody = body?.contractId ? requireUuid(body.contractId) : '';
    const action = boundedText(body?.action, 40, true) || '';

    if ((!deliveryRequestId && !contractIdFromBody) || !['DRIVER_ASSIGNED', 'PAWNER_CONFIRMED', 'ARRIVED'].includes(action)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const role = action === 'PAWNER_CONFIRMED' ? 'PAWNER' : 'DROP_POINT';
    const identity = await requireLiffIdentity(request, role);
    releaseLock = await acquireTransactionLock(
      'pawn-delivery-status',
      deliveryRequestId || contractIdFromBody,
      90,
    );

    const supabase = supabaseAdmin();

    let deliveryRequest: any = null;

    if (deliveryRequestId) {
      const { data, error } = await supabase
        .from('pawn_delivery_requests')
        .select('delivery_request_id, contract_id, status, driver_assigned_at, item_picked_at, arrived_at')
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
        .select('delivery_request_id, contract_id, status, driver_assigned_at, item_picked_at, arrived_at')
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
    releaseContractLock = await acquireTransactionLock(
      'pawn-delivery-contract',
      contractId,
      90,
    );

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

    const isDropPoint = dropPoint?.line_id === identity.lineId;
    const isPawner = pawner?.line_id === identity.lineId;

    const now = new Date().toISOString();
    const updatePayload: any = { updated_at: now };
    const contractPayload: any = { updated_at: now };
    let shouldUpdateDeliveryRequest = Boolean(deliveryRequest);
    let deliveryWasUpdated = false;

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
      if (deliveryRequest.status === 'DRIVER_ASSIGNED') {
        return NextResponse.json({
          success: true,
          alreadyUpdated: true,
          status: 'DRIVER_ASSIGNED',
          itemDeliveryStatus: contract.item_delivery_status,
        });
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
      if (deliveryRequest.status === 'ITEM_PICKED') {
        return NextResponse.json({
          success: true,
          alreadyUpdated: true,
          status: 'ITEM_PICKED',
          itemDeliveryStatus: contract.item_delivery_status,
        });
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

      if (deliveryRequest?.status === 'ARRIVED' && contract.item_delivery_status === 'RECEIVED_AT_DROP_POINT') {
        return NextResponse.json({
          success: true,
          alreadyUpdated: true,
          status: 'ARRIVED',
          itemDeliveryStatus: 'RECEIVED_AT_DROP_POINT',
        });
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
      const { data: updatedDelivery, error: deliveryUpdateError } = await supabase
        .from('pawn_delivery_requests')
        .update(updatePayload)
        .eq('delivery_request_id', deliveryRequest.delivery_request_id)
        .eq('status', deliveryRequest.status)
        .select('delivery_request_id')
        .maybeSingle();

      if (deliveryUpdateError || !updatedDelivery) {
        if (!deliveryUpdateError) {
          return NextResponse.json(
            { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
            { status: 409 },
          );
        }
        throw deliveryUpdateError;
      }
      deliveryWasUpdated = true;
    }

    let contractUpdateQuery = supabase
      .from('contracts')
      .update(contractPayload)
      .eq('contract_id', contract.contract_id);
    contractUpdateQuery = contract.item_delivery_status === null
      ? contractUpdateQuery.is('item_delivery_status', null)
      : contractUpdateQuery.eq('item_delivery_status', contract.item_delivery_status);
    const { data: updatedContract, error: contractUpdateError } = await contractUpdateQuery
      .select('contract_id')
      .maybeSingle();

    if (contractUpdateError || !updatedContract) {
      if (deliveryWasUpdated && deliveryRequest?.delivery_request_id) {
        const rollbackPayload: Record<string, unknown> = {
          status: deliveryRequest.status,
          updated_at: new Date().toISOString(),
        };
        if (action === 'DRIVER_ASSIGNED') {
          rollbackPayload.driver_assigned_at = deliveryRequest.driver_assigned_at;
        } else if (action === 'PAWNER_CONFIRMED') {
          rollbackPayload.item_picked_at = deliveryRequest.item_picked_at;
        } else if (action === 'ARRIVED') {
          rollbackPayload.arrived_at = deliveryRequest.arrived_at;
        }
        await supabase
          .from('pawn_delivery_requests')
          .update(rollbackPayload)
          .eq('delivery_request_id', deliveryRequest.delivery_request_id)
          .eq('status', updatePayload.status);
      }
      if (!contractUpdateError) {
        return NextResponse.json(
          { error: 'สถานะสัญญาเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
          { status: 409 },
        );
      }
      throw contractUpdateError;
    }

    if (action === 'ARRIVED' && contract.item_delivery_status !== 'RECEIVED_AT_DROP_POINT' && pawner?.line_id && pawnerLineClient) {
      try {
        await pawnerLineClient.pushMessage(pawner.line_id, {
          type: 'text',
          text: 'สินค้าถึง Drop Point แล้ว\nกำลังอยู่ในขั้นตอนตรวจสอบสินค้า',
        });
      } catch {
        console.error('Error sending arrival message to pawner');
      }
    }

    return NextResponse.json({
      success: true,
      status: updatePayload.status || (action === 'ARRIVED' ? 'ARRIVED' : undefined),
      itemDeliveryStatus: contractPayload.item_delivery_status,
    });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error updating delivery status');
    return sanitizedServerError('ไม่สามารถอัปเดตสถานะได้ กรุณาลองใหม่');
  } finally {
    if (releaseContractLock) await releaseContractLock();
    if (releaseLock) await releaseLock();
  }
}
