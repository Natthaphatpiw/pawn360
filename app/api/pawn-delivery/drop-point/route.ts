import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deliveryRequestId = searchParams.get('deliveryRequestId')?.trim();
    const lineId = searchParams.get('lineId')?.trim();

    if (!deliveryRequestId || !lineId) {
      return NextResponse.json(
        { error: 'Missing deliveryRequestId or lineId' },
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
        items:item_id (brand, model),
        pawners:customer_id (firstname, lastname, phone_number, line_id),
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

    if (dropPoint?.line_id !== lineId) {
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
        pawner: contract.pawners,
        drop_point: dropPoint,
      },
    });
  } catch (error: any) {
    console.error('Error fetching drop point delivery request:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
