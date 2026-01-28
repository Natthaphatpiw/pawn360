import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { haversineDistanceMeters } from '@/lib/services/geo';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const normalizeNumber = (value: unknown) => {
  const num = typeof value === 'string' ? Number(value) : Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeInt = (value: unknown) => {
  const num = normalizeNumber(value);
  if (num === null) {
    return null;
  }
  return Math.round(num);
};

const clampInt = (value: unknown, min: number, max: number) => {
  const num = normalizeInt(value);
  if (num === null) {
    return null;
  }
  return Math.min(max, Math.max(min, num));
};

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
    console.log('🔍 Looking for pawner with lineId:', lineId);
    const { data: pawnerData, error: pawnerError } = await supabase
      .from('pawners')
      .select('customer_id, last_location_lat, last_location_lng')
      .eq('line_id', lineId)
      .single();

    console.log('📋 Pawner query result:', { pawnerData, pawnerError });

    if (pawnerError || !pawnerData) {
      console.error('❌ Pawner not found:', { pawnerError, lineId });
      return NextResponse.json(
        { error: 'Pawner not found' },
        { status: 404 }
      );
    }

    const customerId = pawnerData.customer_id;
    console.log('✅ Found customerId:', customerId);

    if (deliveryMethod === 'delivery') {
      const locationLat = Number(pawnerData.last_location_lat);
      const locationLng = Number(pawnerData.last_location_lng);

      if (!Number.isFinite(locationLat) || !Number.isFinite(locationLng)) {
        return NextResponse.json(
          {
            error: 'กรุณาอนุญาตตำแหน่งของคุณก่อนใช้บริการจัดส่ง',
            code: 'LOCATION_REQUIRED'
          },
          { status: 400 }
        );
      }

      const { data: branchData, error: branchError } = await supabase
        .from('drop_points')
        .select('drop_point_id, latitude, longitude')
        .eq('drop_point_id', branchId)
        .single();

      if (branchError || !branchData || branchData.latitude == null || branchData.longitude == null) {
        return NextResponse.json(
          { error: 'ไม่สามารถตรวจสอบระยะทางกับสาขาที่เลือกได้' },
          { status: 400 }
        );
      }

      const distanceMeters = haversineDistanceMeters(
        { latitude: locationLat, longitude: locationLng },
        { latitude: Number(branchData.latitude), longitude: Number(branchData.longitude) }
      );

      if (distanceMeters > 10000) {
        return NextResponse.json(
          {
            error: 'คุณอยู่ไกลจาก Drop Point เกินกว่าที่กำหนด ขออภัยกรุณาเลือก "ดำเนินการด้วยตัวเอง (Walk-in)" เพื่อนำมาส่งให้ Drop Point ด้วยตัวเอง ขออภัยในความสะดวก ขอบคุณครับ',
            code: 'DELIVERY_OUT_OF_RANGE',
            distanceKm: Math.round((distanceMeters / 1000) * 10) / 10
          },
          { status: 400 }
        );
      }
    }

    const itemCondition = clampInt(itemData?.condition, 0, 100);
    const estimatedValue = normalizeNumber(itemData?.estimatedPrice);
    const aiConditionScore = normalizeNumber(itemData?.aiConditionScore);
    const aiConfidence = normalizeNumber(itemData?.aiConfidence);

    // Create item record
    const itemRecord = {
      customer_id: customerId,
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
      item_condition: itemCondition,
      ai_condition_score: aiConditionScore,
      ai_condition_reason: itemData.aiConditionReason || null,
      estimated_value: estimatedValue,
      ai_confidence: aiConfidence,
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
      requested_amount: normalizeNumber(loanAmount),
      requested_duration_days: normalizeInt(duration),
      delivery_method: deliveryMethodMap[deliveryMethod as keyof typeof deliveryMethodMap] || 'WALK_IN',
      delivery_fee: normalizeNumber(deliveryFee),
      request_status: 'PENDING',
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
    };

    console.log('📝 Creating loan request with data:', loanRequestRecord);
    const { data: loanRequest, error: loanRequestError } = await supabase
      .from('loan_requests')
      .insert(loanRequestRecord)
      .select()
      .single();

    console.log('📋 Loan request creation result:', { loanRequest, loanRequestError });

    if (loanRequestError || !loanRequest) {
      console.error('❌ Error creating loan request:', loanRequestError);
      return NextResponse.json(
        { error: 'Failed to create loan request' },
        { status: 500 }
      );
    }

    console.log('✅ Loan request created with ID:', loanRequest.request_id);

    console.log('✅ Loan request created successfully:', {
      loanRequestId: loanRequest.loan_request_id,
      itemId: item.item_id,
      loanRequest: loanRequest,
      item: item
    });

    return NextResponse.json({
      success: true,
      loanRequestId: loanRequest.request_id,
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
