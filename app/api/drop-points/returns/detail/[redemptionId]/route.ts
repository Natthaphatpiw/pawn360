import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { refreshBlobUrls } from '@/lib/storage/blob';
import {
  assertUuidResourceId,
  dropPointAccessErrorResponse,
  requireDropPointActor,
} from '@/lib/security/drop-point-access';

const ALLOWED_DETAIL_STATUSES = new Set(['AMOUNT_VERIFIED', 'PREPARING_ITEM', 'IN_TRANSIT', 'COMPLETED']);

function maskNationalId(value: unknown): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ redemptionId: string }> }
) {
  try {
    const { redemptionId: rawRedemptionId } = await context.params;
    const redemptionId = assertUuidResourceId(rawRedemptionId);
    const { searchParams } = new URL(request.url);
    const lineId = await requireDropPointActor(
      request,
      searchParams.get('lineId') || '',
      'drop-point-return-detail',
    );

    const supabase = supabaseAdmin();

    const { data: dropPoint, error: dropPointError } = await supabase
      .from('drop_points')
      .select('drop_point_id')
      .eq('line_id', lineId)
      .eq('is_active', true)
      .maybeSingle();

    if (dropPointError) {
      console.error('[drop-points:return-detail] drop point lookup failed', {
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

    const { data: redemption, error: redemptionError } = await supabase
      .from('redemption_requests')
      .select(`
        redemption_id,
        request_status,
        item_return_confirmed_at,
        delivery_method,
        delivery_address_full,
        delivery_contact_phone,
        drop_point_return_photos,
        contract:contracts!inner (
          contract_id,
          contract_number,
          contract_status,
          item_delivery_status,
          drop_point_id,
          items:item_id (
            item_id,
            brand,
            model,
            image_urls
          ),
          pawners:customer_id (
            firstname,
            lastname,
            phone_number,
            national_id
          )
        )
      `)
      .eq('redemption_id', redemptionId)
      .eq('contract.drop_point_id', dropPoint.drop_point_id)
      .maybeSingle();

    if (redemptionError) {
      console.error('[drop-points:return-detail] redemption query failed', {
        code: redemptionError.code || 'unknown',
      });
      return NextResponse.json(
        { error: 'ไม่สามารถโหลดรายละเอียดการส่งคืนได้', code: 'RETURN_DETAIL_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
    }
    if (!redemption) {
      return NextResponse.json(
        { error: 'ไม่พบรายการส่งคืนหรือคุณไม่มีสิทธิ์เข้าถึง', code: 'RETURN_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const rawContract = Array.isArray(redemption.contract)
      ? redemption.contract[0]
      : redemption.contract;
    if (!rawContract || rawContract.drop_point_id !== dropPoint.drop_point_id) {
      return NextResponse.json(
        { error: 'ไม่พบรายการส่งคืนหรือคุณไม่มีสิทธิ์เข้าถึง', code: 'RETURN_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (!ALLOWED_DETAIL_STATUSES.has(String(redemption.request_status || ''))) {
      return NextResponse.json(
        { error: 'รายการนี้ไม่อยู่ในสถานะที่สามารถเปิดดูได้แล้ว' },
        { status: 410 }
      );
    }

    if (
      ['COMPLETED', 'TERMINATED'].includes(String(rawContract.contract_status || ''))
      && redemption.request_status !== 'COMPLETED'
    ) {
      return NextResponse.json(
        { error: 'รายการนี้สิ้นสุดไปแล้ว' },
        { status: 410 }
      );
    }

    let storageBox: { box_code?: string | null; occupied_at?: string | null; last_updated_at?: string | null } | null = null;
    const { data: storageBoxData, error: storageBoxError } = await supabase
      .from('drop_point_storage_boxes')
      .select('box_code, occupied_at, last_updated_at')
      .eq('contract_id', rawContract.contract_id)
      .order('last_updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (storageBoxError && storageBoxError.code !== 'PGRST205') {
      console.error('[drop-points:return-detail] storage box query failed', {
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

    const { data: bag } = await supabase
      .from('drop_point_bag_assignments')
      .select('bag_number, assigned_at')
      .eq('contract_id', rawContract.contract_id)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let contractPayload = rawContract as any;
    if (contractPayload?.items) {
      const itemPayload = Array.isArray(contractPayload.items)
        ? await Promise.all(contractPayload.items.map(async (item: any) => ({
            ...item,
            image_urls: await refreshBlobUrls(item?.image_urls),
          })))
        : {
            ...contractPayload.items,
            image_urls: await refreshBlobUrls(contractPayload.items?.image_urls),
          };

      contractPayload = {
        ...contractPayload,
        items: itemPayload,
      };
    }

    const rawPawner = Array.isArray(contractPayload?.pawners)
      ? contractPayload.pawners[0]
      : contractPayload?.pawners;
    contractPayload = {
      contract_id: contractPayload.contract_id,
      contract_number: contractPayload.contract_number,
      items: contractPayload.items,
      pawners: rawPawner
        ? {
            firstname: rawPawner.firstname,
            lastname: rawPawner.lastname,
            phone_number: rawPawner.phone_number,
            national_id: maskNationalId(rawPawner.national_id),
          }
        : null,
    };

    const refreshedReturnPhotos = await refreshBlobUrls(
      Array.isArray(redemption.drop_point_return_photos) ? redemption.drop_point_return_photos : []
    );

    return NextResponse.json(
      {
        success: true,
        redemption: {
          redemption_id: redemption.redemption_id,
          request_status: redemption.request_status,
          item_return_confirmed_at: redemption.item_return_confirmed_at,
          delivery_method: redemption.delivery_method,
          delivery_address_full: redemption.delivery_address_full,
          delivery_contact_phone: redemption.delivery_contact_phone,
          contract: contractPayload,
          drop_point_return_photos: refreshedReturnPhotos,
          storage_box_code: storageBox?.box_code || null,
          storage_box_assigned_at: storageBox?.occupied_at || storageBox?.last_updated_at || null,
          bag_number: bag?.bag_number || storageBox?.box_code || null,
          bag_assigned_at: bag?.assigned_at || null,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const accessResponse = dropPointAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error('[drop-points:return-detail] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถโหลดรายละเอียดการส่งคืนได้', code: 'RETURN_DETAIL_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
