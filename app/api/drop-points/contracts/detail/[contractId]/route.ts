import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { refreshBlobUrls } from '@/lib/storage/blob';
import { splitItemNotesAndPasscode } from '@/lib/utils/item-private-notes';
import {
  assertUuidResourceId,
  dropPointAccessErrorResponse,
  requireDropPointActor,
} from '@/lib/security/drop-point-access';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ contractId: string }> }
) {
  try {
    const { contractId: rawContractId } = await context.params;
    const contractId = assertUuidResourceId(rawContractId);
    const { searchParams } = new URL(request.url);
    const lineId = await requireDropPointActor(
      request,
      searchParams.get('lineId') || '',
      'drop-point-contract-detail',
    );

    const supabase = supabaseAdmin();

    const { data: dropPoint, error: dropPointError } = await supabase
      .from('drop_points')
      .select('drop_point_id')
      .eq('line_id', lineId)
      .eq('is_active', true)
      .maybeSingle();

    if (dropPointError) {
      console.error('[drop-points:contract-detail] drop point lookup failed', {
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

    const { data: contract, error: contractError } = await supabase
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
        contract_start_date,
        contract_end_date,
        items:item_id (
          item_id,
          brand,
          model,
          capacity,
          color,
          image_urls,
          item_condition,
          condition_checklist,
          notes,
          defects
        ),
        pawners:customer_id (
          firstname,
          lastname,
          phone_number
        ),
        drop_points:drop_point_id (
          drop_point_id,
          drop_point_name,
          phone_number
        )
      `)
      .eq('contract_id', contractId)
      .eq('drop_point_id', dropPoint.drop_point_id)
      .maybeSingle();

    if (contractError) {
      console.error('[drop-points:contract-detail] contract query failed', {
        code: contractError.code || 'unknown',
      });
      return NextResponse.json(
        { error: 'ไม่สามารถโหลดรายละเอียดสัญญาได้', code: 'CONTRACT_DETAIL_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
    }
    if (!contract) {
      return NextResponse.json(
        { error: 'ไม่พบสัญญาหรือคุณไม่มีสิทธิ์เข้าถึง', code: 'CONTRACT_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let storageBox: { box_code?: string | null; occupied_at?: string | null; last_updated_at?: string | null } | null = null;
    const { data: storageBoxData, error: storageBoxError } = await supabase
      .from('drop_point_storage_boxes')
      .select('box_code, occupied_at, last_updated_at')
      .eq('contract_id', contractId)
      .order('last_updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (storageBoxError && storageBoxError.code !== 'PGRST205') {
      console.error('[drop-points:contract-detail] storage box query failed', {
        code: storageBoxError.code || 'unknown',
      });
      return NextResponse.json(
        { error: 'ไม่สามารถโหลดข้อมูลกล่องจัดเก็บได้', code: 'STORAGE_BOX_LOOKUP_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
    }

    if (storageBoxData) {
      storageBox = storageBoxData;
    }

    let deliveryRequestId: string | null = null;
    let deliveryRequestStatus: string | null = null;
    const { data: deliveryRequest, error: deliveryRequestError } = await supabase
      .from('pawn_delivery_requests')
      .select('delivery_request_id, status, updated_at')
      .eq('contract_id', contractId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (deliveryRequestError && deliveryRequestError.code !== 'PGRST205') {
      console.error('[drop-points:contract-detail] delivery request query failed', {
        code: deliveryRequestError.code || 'unknown',
      });
      return NextResponse.json(
        { error: 'ไม่สามารถโหลดสถานะการจัดส่งได้', code: 'DELIVERY_STATUS_LOOKUP_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
    }

    if (deliveryRequest?.delivery_request_id) {
      deliveryRequestId = deliveryRequest.delivery_request_id;
      deliveryRequestStatus = deliveryRequest.status || null;
    }

    let items = contract.items as any;
    if (Array.isArray(items)) {
      items = await Promise.all(
        items.map(async (item) => {
          const notesPayload = splitItemNotesAndPasscode(item?.notes);
          return {
            ...item,
            notes: notesPayload.publicNotes,
            image_urls: await refreshBlobUrls(item?.image_urls),
          };
        })
      );
    } else if (items) {
      const notesPayload = splitItemNotesAndPasscode(items?.notes);
      items = {
        ...items,
        notes: notesPayload.publicNotes,
        image_urls: await refreshBlobUrls(items?.image_urls),
      };
    }

    return NextResponse.json(
      {
        success: true,
        contract: {
          ...contract,
          items,
          delivery_request_id: deliveryRequestId,
          delivery_request_status: deliveryRequestStatus,
          storage_box_code: storageBox?.box_code || null,
          storage_box_assigned_at: storageBox?.occupied_at || storageBox?.last_updated_at || null,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const accessResponse = dropPointAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error('[drop-points:contract-detail] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถโหลดรายละเอียดสัญญาได้', code: 'CONTRACT_DETAIL_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
