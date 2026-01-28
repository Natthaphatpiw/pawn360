import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

const resolveStatusLabel = (status?: string) => {
  switch (status) {
    case 'DRIVER_SEARCH':
    case 'PAYMENT_VERIFIED':
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
    const contractId = searchParams.get('contractId')?.trim();
    const lineId = searchParams.get('lineId')?.trim();

    if (!contractId || !lineId) {
      return NextResponse.json(
        { error: 'Missing contractId or lineId' },
        { status: 400 }
      );
    }

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

    if (pawner?.line_id !== lineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const { data: deliveryRequest, error: requestError } = await supabase
      .from('pawn_delivery_requests')
      .select('*')
      .eq('contract_id', contractId)
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
    });
  } catch (error: any) {
    console.error('Error fetching delivery status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
