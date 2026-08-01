import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const resolveStatusLabel = (status?: string) => {
  switch (status) {
    case 'DRIVER_SEARCH':
    case 'PAYMENT_VERIFIED':
    case 'AWAITING_PAYMENT':
    case 'PAYMENT_REJECTED':
    case 'SLIP_UPLOADED':
      return 'drop-point กำลังหารถไปรับของ';
    case 'DRIVER_ASSIGNED':
      return 'มีรถกำลังเข้าไปรับของ';
    case 'ITEM_PICKED':
      return 'รับสินค้าแล้วกำลังนำไปส่งที่ Drop Point';
    case 'ARRIVED':
      return 'สินค้าถึง Drop Point แล้ว อยู่ในขั้นตอนตรวจสอบ';
    default:
      return 'กำลังเตรียมข้อมูล';
  }
};

const resolveStepIndex = (status?: string) => {
  switch (status) {
    case 'DRIVER_ASSIGNED':
      return 1;
    case 'ITEM_PICKED':
      return 2;
    case 'ARRIVED':
      return 3;
    default:
      return 0;
  }
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contractId = requireUuid(searchParams.get('contractId'));
    const identity = await requireLiffIdentity(request, 'PAWNER');

    const supabase = supabaseAdmin();

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        items:item_id (brand, model),
        pawners:customer_id (line_id)
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

    if (!pawner?.line_id || pawner.line_id !== identity.lineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const { data: deliveryRequest, error: requestError } = await supabase
      .from('pawn_delivery_requests')
      .select(`
        delivery_request_id,
        contract_id,
        status,
        delivery_fee,
        address_house_no,
        address_village,
        address_street,
        address_sub_district,
        address_district,
        address_province,
        address_postcode,
        address_full,
        contact_phone,
        notes,
        driver_assigned_at,
        item_picked_at,
        arrived_at,
        created_at,
        updated_at
      `)
      .eq('contract_id', contractId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (requestError || !deliveryRequest) {
      return NextResponse.json(
        { error: 'Delivery request not found' },
        { status: 404 }
      );
    }

    const statusLabel = resolveStatusLabel(deliveryRequest.status);
    const stepIndex = resolveStepIndex(deliveryRequest.status);

    return NextResponse.json({
      success: true,
      contract: {
        contract_id: contract.contract_id,
        contract_number: contract.contract_number,
        item: contract.items,
      },
      deliveryRequest,
      statusLabel,
      stepIndex,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('[pawn-delivery:status] failed');
    return sanitizedServerError('ไม่สามารถโหลดสถานะการจัดส่งได้ กรุณาลองใหม่');
  }
}
