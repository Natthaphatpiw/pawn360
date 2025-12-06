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
      deliveryFee,
      branchId,
      duration,
      interestRate,
      totalInterest,
      totalRepayment,
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

    // Create item record
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
      item_status: 'PENDING',
    };

    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert(itemRecord)
      .select()
      .single();

    if (itemError || !item) {
      console.error('Error creating item:', itemError);
      return NextResponse.json(
        { error: 'Failed to create item record' },
        { status: 500 }
      );
    }

    // If camera with lenses, create lens records
    if (itemData.lenses && itemData.lenses.length > 0) {
      const lensRecords = itemData.lenses.map((lens: { brand: string; model: string }) => ({
        item_id: item.item_id,
        lens_brand: lens.brand,
        lens_model: lens.model,
      }));

      const { error: lensError } = await supabase
        .from('item_lenses')
        .insert(lensRecords);

      if (lensError) {
        console.error('Error creating lenses:', lensError);
      }
    }

    // Create loan request
    const deliveryMethodMap = {
      'delivery': 'DELIVERY',
      'pickup': 'WALK_IN',
      'courier': 'COURIER'
    };

    const loanRequestRecord = {
      customer_id: customerId,
      item_id: item.item_id,
      drop_point_id: branchId,
      requested_amount: loanAmount,
      requested_duration_days: duration,
      delivery_method: deliveryMethodMap[deliveryMethod as keyof typeof deliveryMethodMap] || 'WALK_IN',
      delivery_fee: deliveryFee,
      request_status: 'PENDING',
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
    };

    const { data: loanRequest, error: loanRequestError } = await supabase
      .from('loan_requests')
      .insert(loanRequestRecord)
      .select()
      .single();

    if (loanRequestError || !loanRequest) {
      console.error('Error creating loan request:', loanRequestError);
      return NextResponse.json(
        { error: 'Failed to create loan request' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      loanRequestId: loanRequest.loan_request_id,
      itemId: item.item_id,
      message: 'Loan request created successfully',
    });
  } catch (error) {
    console.error('Error in loan-request/create:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
