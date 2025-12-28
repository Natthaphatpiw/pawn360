import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      lineId,
      itemData,
      branchId,
    } = body;

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
      notes: itemData.notes || null,
      image_urls: itemData.images,
      item_status: 'DRAFT',
      drop_point_id: branchId || null,
    };

    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert(itemRecord)
      .select()
      .single();

    if (itemError || !item) {
      console.error('Error creating item draft:', itemError);
      return NextResponse.json(
        { error: 'Failed to save draft' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      itemId: item.item_id,
      message: 'Draft saved successfully',
    });
  } catch (error) {
    console.error('Error in loan-request/save-draft:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
