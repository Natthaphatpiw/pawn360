import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deliveryRequestId = requireUuid(searchParams.get('deliveryRequestId'));
    const identity = await requireLiffIdentity(request, 'DROP_POINT');

    const supabase = supabaseAdmin();

    const { data: deliveryRequest, error: requestError } = await supabase
      .from('pawn_delivery_requests')
      .select(`
        delivery_request_id,
        contract_id,
        status,
        delivery_fee,
        address_full,
        contact_phone,
        driver_assigned_at,
        item_picked_at,
        arrived_at,
        created_at,
        updated_at
      `)
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
        items:item_id (brand, model),
        drop_points:drop_point_id (drop_point_name, line_id)
      `)
      .eq('contract_id', deliveryRequest.contract_id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const dropPoint = Array.isArray(contract.drop_points)
      ? contract.drop_points[0]
      : contract.drop_points;

    if (!dropPoint?.line_id || dropPoint.line_id !== identity.lineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      deliveryRequest,
      contract: {
        contract_id: contract.contract_id,
        contract_number: contract.contract_number,
        item: contract.items,
        drop_point: dropPoint ? { drop_point_name: dropPoint.drop_point_name } : null,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('[pawn-delivery:drop-point] failed');
    return sanitizedServerError('ไม่สามารถโหลดงานรับสินค้าได้ กรุณาลองใหม่');
  }
}
