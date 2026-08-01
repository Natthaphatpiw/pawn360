import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  dropPointAccessErrorResponse,
  requireDropPointActor,
} from '@/lib/security/drop-point-access';

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

const VISIBLE_HISTORY_STATUSES = new Set(['ถึงแล้ว', 'คืนแล้ว', 'ยกเลิก']);

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
    const { lineId: claimedLineId } = await context.params;
    const lineId = await requireDropPointActor(
      request,
      claimedLineId,
      'drop-point-history',
    );

    const supabase = supabaseAdmin();

    const { data: dropPoint, error: dropPointError } = await supabase
      .from('drop_points')
      .select('drop_point_id')
      .eq('line_id', lineId)
      .eq('is_active', true)
      .maybeSingle();

    if (dropPointError) {
      console.error('[drop-points:history] drop point lookup failed', {
        code: dropPointError.code || 'unknown',
      });
      return NextResponse.json(
        { error: 'ไม่สามารถตรวจสอบข้อมูลจุดรับสินค้าได้', code: 'DROP_POINT_LOOKUP_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
    }
    if (!dropPoint) {
      return NextResponse.json(
        { error: 'ไม่พบจุดรับสินค้าที่เปิดใช้งาน', code: 'DROP_POINT_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
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
      console.error('[drop-points:history] contract query failed', {
        code: contractsError.code || 'unknown',
      });
      return NextResponse.json(
        { error: 'ไม่สามารถโหลดประวัติรายการได้', code: 'DROP_POINT_HISTORY_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
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
        contract:contracts!inner (
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
      console.error('[drop-points:history] redemption query failed', {
        code: redemptionsError.code || 'unknown',
      });
      return NextResponse.json(
        { error: 'ไม่สามารถโหลดประวัติรายการได้', code: 'DROP_POINT_HISTORY_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
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
      .filter((entry) => entry.date && VISIBLE_HISTORY_STATUSES.has(entry.status))
      .sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime());

    return NextResponse.json(
      { success: true, entries },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const accessResponse = dropPointAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error('[drop-points:history] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถโหลดประวัติรายการได้', code: 'DROP_POINT_HISTORY_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
