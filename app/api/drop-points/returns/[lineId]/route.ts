import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  dropPointAccessErrorResponse,
  requireDropPointActor,
} from '@/lib/security/drop-point-access';

const RETURN_PENDING_STATUSES = ['AMOUNT_VERIFIED', 'PREPARING_ITEM', 'IN_TRANSIT'];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ lineId: string }> }
) {
  try {
    const { lineId: claimedLineId } = await context.params;
    const lineId = await requireDropPointActor(
      request,
      claimedLineId,
      'drop-point-return-list',
    );

    const supabase = supabaseAdmin();

    const { data: dropPoint, error: dpError } = await supabase
      .from('drop_points')
      .select('drop_point_id, drop_point_name, drop_point_code')
      .eq('line_id', lineId)
      .eq('is_active', true)
      .maybeSingle();

    if (dpError) {
      console.error('[drop-points:returns] drop point lookup failed', {
        code: dpError.code || 'unknown',
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

    const { data: redemptions, error: redemptionError } = await supabase
      .from('redemption_requests')
      .select(`
        redemption_id,
        request_status,
        verified_at,
        created_at,
        updated_at,
        item_return_confirmed_at,
        contract:contracts!inner (
          contract_id,
          contract_number,
          contract_status,
          item_delivery_status,
          drop_point_id,
          items:item_id (
            brand,
            model,
            image_urls
          )
        )
      `)
      .eq('contract.drop_point_id', dropPoint.drop_point_id)
      .in('request_status', RETURN_PENDING_STATUSES)
      .is('item_return_confirmed_at', null)
      .order('updated_at', { ascending: false });

    if (redemptionError) {
      console.error('[drop-points:returns] redemption query failed', {
        code: redemptionError.code || 'unknown',
      });
      return NextResponse.json(
        { error: 'ไม่สามารถโหลดรายการส่งคืนได้', code: 'RETURN_LIST_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
    }

    const normalizedRedemptions = (redemptions || []).map((redemption) => ({
      ...redemption,
      contract: Array.isArray(redemption.contract) ? redemption.contract[0] : redemption.contract,
    }));

    const contractIds = normalizedRedemptions
      .map((redemption) => redemption.contract?.contract_id)
      .filter((value): value is string => Boolean(value));
    let storageBoxByContractId: Record<string, string> = {};

    if (contractIds.length > 0) {
      const { data: storageBoxes, error: storageBoxesError } = await supabase
        .from('drop_point_storage_boxes')
        .select('contract_id, box_code')
        .in('contract_id', contractIds);

      if (storageBoxesError && storageBoxesError.code !== 'PGRST205') {
        console.error('[drop-points:returns] storage box query failed', {
          code: storageBoxesError.code || 'unknown',
        });
        return NextResponse.json(
          { error: 'ไม่สามารถโหลดข้อมูลกล่องจัดเก็บได้', code: 'STORAGE_BOX_LOOKUP_FAILED' },
          { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
        );
      }

      storageBoxByContractId = (storageBoxes || []).reduce<Record<string, string>>((acc, row) => {
        if (row.contract_id && row.box_code) {
          acc[row.contract_id] = row.box_code;
        }
        return acc;
      }, {});
    }

    const formatted = normalizedRedemptions
      .filter((redemption) => (
        !['COMPLETED', 'TERMINATED'].includes(String(redemption.contract?.contract_status || ''))
        && redemption.contract?.item_delivery_status !== 'RETURNED'
      ))
      .map((redemption) => ({
        redemption_id: redemption.redemption_id,
        request_status: redemption.request_status,
        contract: redemption.contract
          ? {
              contract_id: redemption.contract.contract_id,
              contract_number: redemption.contract.contract_number,
              items: redemption.contract.items,
            }
          : null,
        displayStatus: 'รอคืนของ',
        displayDate: redemption.verified_at || redemption.updated_at || redemption.created_at,
        storage_box_code: redemption.contract?.contract_id
          ? storageBoxByContractId[redemption.contract.contract_id] || null
          : null,
      }));

    return NextResponse.json(
      {
        success: true,
        dropPoint,
        redemptions: formatted,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const accessResponse = dropPointAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error('[drop-points:returns] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถโหลดรายการส่งคืนได้', code: 'RETURN_LIST_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
