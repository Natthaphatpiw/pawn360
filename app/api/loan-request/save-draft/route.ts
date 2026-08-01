import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildItemNotesWithPasscode } from '@/lib/utils/item-private-notes';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);
const MAX_JSON_BYTES = 256 * 1024;

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_JSON_BYTES) {
      return NextResponse.json(
        { error: 'Request body is too large', code: 'PAYLOAD_TOO_LARGE' },
        { status: 413 }
      );
    }

    const body = await request.json();
    const {
      lineId: claimedLineId,
      itemData,
      branchId,
    } = body;

    if (
      typeof claimedLineId !== 'string'
      || !claimedLineId.trim()
      || claimedLineId.length > 80
      || !itemData
      || typeof itemData !== 'object'
      || JSON.stringify(itemData).length > 128 * 1024
    ) {
      return NextResponse.json(
        { error: 'Invalid draft data', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    let lineId: string;
    try {
      lineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);
    } catch (error) {
      return liffAuthErrorResponse(error);
    }

    // Get customer_id from lineId (optional for drafts)
    const { data: pawnerData, error: pawnerError } = await supabase
      .from('pawners')
      .select('customer_id')
      .eq('line_id', lineId)
      .maybeSingle();

    if (pawnerError) {
      console.error('Error fetching pawner for draft:', pawnerError);
      return NextResponse.json(
        { error: 'Failed to verify pawner' },
        { status: 500 }
      );
    }

    const customerId = pawnerData?.customer_id || null;

    // Create item record with draft status
    const itemRecord = {
      customer_id: customerId,
      line_id: lineId,
      item_type: itemData.itemType,
      brand: itemData.brand,
      model: itemData.model,
      capacity: itemData.capacity || null,
      serial_number: itemData.serialNumber || itemData.serialNo || null,
      color: itemData.color || null,
      screen_size: itemData.screenSize || null,
      watch_size: itemData.watchSize || null,
      watch_connectivity: itemData.watchConnectivity || null,
      cpu: itemData.processor || null,
      ram: itemData.ram || null,
      storage: itemData.storage || null,
      gpu: itemData.gpu || null,
      item_condition: itemData.condition,
      ai_condition_score: itemData.aiConditionScore || null,
      ai_condition_reason: itemData.aiConditionReason || null,
      estimated_value: itemData.estimatedPrice,
      ai_confidence: itemData.aiConfidence || null,
      accessories: itemData.appleAccessories ? itemData.appleAccessories.join(', ') : null,
      defects: itemData.defects || null,
      notes: buildItemNotesWithPasscode(itemData.notes, itemData.devicePasscode),
      image_urls: itemData.images,
      item_status: 'DRAFT',
      drop_point_id: branchId || null,
    };

    const insertItemRecord = async (record: Record<string, unknown>) => (
      supabase
        .from('items')
        .insert(record)
        .select()
        .single()
    );

    let { data: item, error: itemError } = await insertItemRecord(itemRecord);

    if (itemError && `${itemError.message || ''}`.toLowerCase().includes('condition_checklist')) {
      const fallbackRecord = { ...itemRecord };
      delete (fallbackRecord as Record<string, unknown>).condition_checklist;
      ({ data: item, error: itemError } = await insertItemRecord(fallbackRecord));
    }

    if (itemError || !item) {
      console.error('Error creating item draft:', itemError);
      return NextResponse.json(
        { error: 'Failed to save draft', code: 'DRAFT_SAVE_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      itemId: item.item_id,
      message: 'Draft saved successfully',
    });
  } catch (error) {
    console.error('[loan-request:save-draft] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
