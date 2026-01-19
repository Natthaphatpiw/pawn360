import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

const INCOMING_STATUSES = ['PAWNER_CONFIRMED', 'IN_TRANSIT'];
const ARRIVED_STATUSES = ['RECEIVED_AT_DROP_POINT', 'VERIFIED'];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ lineId: string }> }
) {
  try {
    const { lineId } = await context.params;

    if (!lineId) {
      return NextResponse.json(
        { error: 'LINE ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: dropPoint, error: dpError } = await supabase
      .from('drop_points')
      .select('drop_point_id, drop_point_name, drop_point_code')
      .eq('line_id', lineId)
      .single();

    if (dpError || !dropPoint) {
      return NextResponse.json(
        { error: 'Drop point not found' },
        { status: 404 }
      );
    }

    const { data: contracts, error: contractsError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        item_delivery_status,
        item_received_at,
        item_verified_at,
        created_at,
        updated_at,
        items:item_id (
          brand,
          model,
          item_type,
          image_urls
        ),
        pawners:customer_id (
          firstname,
          lastname,
          phone_number
        )
      `)
      .eq('drop_point_id', dropPoint.drop_point_id)
      .in('item_delivery_status', [...INCOMING_STATUSES, ...ARRIVED_STATUSES])
      .order('updated_at', { ascending: false });

    if (contractsError) {
      throw contractsError;
    }

    const formatted = (contracts || []).map((contract) => {
      const statusGroup = INCOMING_STATUSES.includes(contract.item_delivery_status)
        ? 'INCOMING'
        : ARRIVED_STATUSES.includes(contract.item_delivery_status)
          ? 'ARRIVED'
          : 'UNKNOWN';

      const displayStatus = statusGroup === 'INCOMING'
        ? 'กำลังมา'
        : statusGroup === 'ARRIVED'
          ? 'ถึงแล้ว'
          : 'ไม่ทราบสถานะ';

      const displayDate = contract.item_received_at
        || contract.item_verified_at
        || contract.updated_at
        || contract.created_at;

      return {
        ...contract,
        statusGroup,
        displayStatus,
        displayDate
      };
    });

    return NextResponse.json({
      success: true,
      dropPoint,
      contracts: formatted
    });
  } catch (error: any) {
    console.error('Error fetching drop point contracts:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
