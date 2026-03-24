import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

const RETURN_PENDING_STATUSES = ['AMOUNT_VERIFIED', 'PREPARING_ITEM', 'IN_TRANSIT'];

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

    const { data: redemptions, error: redemptionError } = await supabase
      .from('redemption_requests')
      .select(`
        redemption_id,
        request_status,
        total_amount,
        delivery_method,
        verified_at,
        created_at,
        updated_at,
        item_return_confirmed_at,
        contract:contract_id (
          contract_id,
          contract_number,
          drop_point_id,
          items:item_id (
            brand,
            model,
            image_urls
          ),
          pawners:customer_id (
            firstname,
            lastname,
            phone_number
          )
        )
      `)
      .eq('contract.drop_point_id', dropPoint.drop_point_id)
      .in('request_status', RETURN_PENDING_STATUSES)
      .is('item_return_confirmed_at', null)
      .order('updated_at', { ascending: false });

    if (redemptionError) {
      throw redemptionError;
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
        throw storageBoxesError;
      }

      storageBoxByContractId = (storageBoxes || []).reduce<Record<string, string>>((acc, row) => {
        if (row.contract_id && row.box_code) {
          acc[row.contract_id] = row.box_code;
        }
        return acc;
      }, {});
    }

    const formatted = normalizedRedemptions.map((redemption) => ({
      ...redemption,
      displayStatus: 'รอคืนของ',
      displayDate: redemption.verified_at || redemption.updated_at || redemption.created_at,
      storage_box_code: redemption.contract?.contract_id
        ? storageBoxByContractId[redemption.contract.contract_id] || null
        : null,
    }));

    return NextResponse.json({
      success: true,
      dropPoint,
      redemptions: formatted
    });
  } catch (error: any) {
    console.error('Error fetching drop point returns:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
