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
      loanAmount,
      deliveryMethod,
      branchId,
      duration,
    } = body;

    // Get customer_id from lineId
    const { data: pawnerData, error: pawnerError } = await supabase
      .from('pawners')
      .select('customer_id')
      .eq('line_id', lineId)
      .single();

    if (pawnerError || !pawnerData) {
      return NextResponse.json(
        { error: 'Pawner not found' },
        { status: 404 }
      );
    }

    const customerId = pawnerData.customer_id;

    // Create item record with draft status
    const itemRecord = {
      customer_id: customerId,
      item_type: itemData.itemType,
      brand: itemData.brand,
      model: itemData.model,
      capacity: itemData.capacity || null,
      serial_number: itemData.serialNumber || null,
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
      item_status: 'PENDING', // Changed from DRAFT to PENDING
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

    // Create draft loan request
    const loanRequestRecord = {
      customer_id: customerId,
      item_id: item.item_id,
      drop_point_id: branchId || null,
      requested_loan_amount: loanAmount || 0,
      loan_duration_months: duration || 1,
      delivery_method: deliveryMethod || 'walk-in',
      request_status: 'DRAFT',
    };

    const { data: loanRequest, error: loanRequestError } = await supabase
      .from('loan_requests')
      .insert(loanRequestRecord)
      .select()
      .single();

    if (loanRequestError || !loanRequest) {
      console.error('Error creating loan request draft:', loanRequestError);
      return NextResponse.json(
        { error: 'Failed to save draft' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      loanRequestId: loanRequest.loan_request_id,
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
