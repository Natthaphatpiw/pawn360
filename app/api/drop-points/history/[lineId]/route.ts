import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

const mapPawnStatus = (status: string, contractStatus?: string) => {
  if (['PAWNER_CONFIRMED', 'IN_TRANSIT'].includes(status)) return 'กำลังมา';
  if (['RECEIVED_AT_DROP_POINT', 'VERIFIED'].includes(status)) return 'ถึงแล้ว';
  if (status === 'RETURNED') return 'คืนแล้ว';
  if (['REJECTED', 'CANCELLED'].includes(contractStatus || '')) return 'ยกเลิก';
  return 'ไม่ทราบสถานะ';
};

const mapRedemptionStatus = (status: string) => {
  if (['AMOUNT_VERIFIED', 'PREPARING_ITEM', 'IN_TRANSIT'].includes(status)) return 'รอคืนของ';
  if (status === 'COMPLETED') return 'คืนแล้ว';
  if (['CANCELLED', 'REJECTED', 'AMOUNT_MISMATCH'].includes(status)) return 'ยกเลิก';
  return 'ไม่ทราบสถานะ';
};

const getItemTitle = (
  items?: { brand?: string | null; model?: string | null }
    | Array<{ brand?: string | null; model?: string | null }>
) => {
  const item = Array.isArray(items) ? items[0] : items;
  const brand = item?.brand || '';
  const model = item?.model || '';
  return `${brand} ${model}`.trim();
};

const getContractItems = (
  contract?: { items?: { brand?: string | null; model?: string | null } | Array<{ brand?: string | null; model?: string | null }> }
    | Array<{ items?: { brand?: string | null; model?: string | null } | Array<{ brand?: string | null; model?: string | null }> }>
) => {
  const contractItem = Array.isArray(contract) ? contract[0] : contract;
  return contractItem?.items;
};

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

    const { data: dropPoint, error: dropPointError } = await supabase
      .from('drop_points')
      .select('drop_point_id')
      .eq('line_id', lineId)
      .single();

    if (dropPointError || !dropPoint) {
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
        contract_status,
        item_delivery_status,
        item_received_at,
        item_verified_at,
        created_at,
        updated_at,
        items:item_id (
          brand,
          model
        )
      `)
      .eq('drop_point_id', dropPoint.drop_point_id)
      .order('updated_at', { ascending: false });

    if (contractsError) {
      throw contractsError;
    }

    const { data: redemptions, error: redemptionsError } = await supabase
      .from('redemption_requests')
      .select(`
        redemption_id,
        request_status,
        verified_at,
        item_return_confirmed_at,
        created_at,
        updated_at,
        contract:contract_id (
          contract_id,
          contract_number,
          drop_point_id,
          items:item_id (
            brand,
            model
          )
        )
      `)
      .eq('contract.drop_point_id', dropPoint.drop_point_id)
      .order('updated_at', { ascending: false });

    if (redemptionsError) {
      throw redemptionsError;
    }

    const contractEntries = (contracts || []).map((contract) => {
      const date = contract.item_verified_at
        || contract.item_received_at
        || contract.updated_at
        || contract.created_at;
      return {
        id: contract.contract_id,
        type: 'PAWN',
        title: getItemTitle(contract.items),
        status: mapPawnStatus(contract.item_delivery_status, contract.contract_status),
        rawStatus: contract.item_delivery_status,
        date
      };
    });

    const redemptionEntries = (redemptions || []).map((redemption) => {
      const date = redemption.item_return_confirmed_at
        || redemption.verified_at
        || redemption.updated_at
        || redemption.created_at;
      return {
        id: redemption.redemption_id,
        type: 'REDEMPTION',
        title: getItemTitle(getContractItems(redemption.contract)),
        status: mapRedemptionStatus(redemption.request_status),
        rawStatus: redemption.request_status,
        date
      };
    });

    const entries = [...contractEntries, ...redemptionEntries]
      .filter((entry) => entry.date)
      .sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime());

    return NextResponse.json({
      success: true,
      entries
    });
  } catch (error: any) {
    console.error('Error fetching drop point history:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
