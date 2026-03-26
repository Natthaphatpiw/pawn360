import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { refreshImageUrls } from '@/lib/aws/s3';

const ALLOWED_DETAIL_STATUSES = new Set(['AMOUNT_VERIFIED', 'PREPARING_ITEM', 'IN_TRANSIT', 'COMPLETED']);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ redemptionId: string }> }
) {
  try {
    const { redemptionId } = await context.params;
    const { searchParams } = new URL(request.url);
    const lineId = searchParams.get('lineId');

    if (!redemptionId || !lineId) {
      return NextResponse.json(
        { error: 'Redemption ID and LINE ID are required' },
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

    const { data: redemption, error: redemptionError } = await supabase
      .from('redemption_requests')
      .select(`
        *,
        contract:contract_id (
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
          ),
          drop_points:drop_point_id (
            drop_point_id,
            drop_point_name,
            phone_number
          )
        )
      `)
      .eq('redemption_id', redemptionId)
      .eq('contract.drop_point_id', dropPoint.drop_point_id)
      .single();

    if (redemptionError || !redemption) {
      return NextResponse.json(
        { error: 'Redemption not found' },
        { status: 404 }
      );
    }

    if (!ALLOWED_DETAIL_STATUSES.has(String(redemption.request_status || ''))) {
      return NextResponse.json(
        { error: 'รายการนี้ไม่อยู่ในสถานะที่สามารถเปิดดูได้แล้ว' },
        { status: 410 }
      );
    }

    if (
      ['COMPLETED', 'TERMINATED'].includes(String(redemption.contract?.contract_status || ''))
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
      .eq('contract_id', redemption.contract?.contract_id)
      .order('last_updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (storageBoxError && storageBoxError.code !== 'PGRST205') {
      console.error('Error fetching storage box for redemption:', storageBoxError);
      throw storageBoxError;
    }

    if (storageBoxData) {
      storageBox = storageBoxData;
    }

    const { data: bag } = await supabase
      .from('drop_point_bag_assignments')
      .select('bag_number, assigned_at')
      .eq('contract_id', redemption.contract?.contract_id)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let contractPayload = redemption.contract as any;
    if (contractPayload?.items) {
      const itemPayload = Array.isArray(contractPayload.items)
        ? await Promise.all(contractPayload.items.map(async (item: any) => ({
            ...item,
            image_urls: await refreshImageUrls(item?.image_urls),
          })))
        : {
            ...contractPayload.items,
            image_urls: await refreshImageUrls(contractPayload.items?.image_urls),
          };

      contractPayload = {
        ...contractPayload,
        items: itemPayload,
      };
    }

    const refreshedReturnPhotos = await refreshImageUrls(
      Array.isArray(redemption.drop_point_return_photos) ? redemption.drop_point_return_photos : []
    );

    return NextResponse.json({
      success: true,
      redemption: {
        ...redemption,
        contract: contractPayload,
        drop_point_return_photos: refreshedReturnPhotos,
        storage_box_code: storageBox?.box_code || null,
        storage_box_assigned_at: storageBox?.occupied_at || storageBox?.last_updated_at || null,
        bag_number: bag?.bag_number || storageBox?.box_code || null,
        bag_assigned_at: bag?.assigned_at || null
      }
    });
  } catch (error: any) {
    console.error('Error fetching drop point return detail:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
