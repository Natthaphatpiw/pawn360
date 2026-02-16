import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { haversineDistanceMeters } from '@/lib/services/geo';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);
const MIN_REQUESTED_AMOUNT = 1000;

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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

const SERIAL_OPTIONAL_TYPES = new Set([
  'อุปกรณ์เสริมโทรศัพท์',
  'กล้อง',
  'อุปกรณ์คอมพิวเตอร์',
]);

const isSerialRequiredForType = (itemType?: string) => {
  if (!itemType) return false;
  return !SERIAL_OPTIONAL_TYPES.has(itemType);
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
      userLocation,
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
    const resolvedRequestedAmount = normalizeNumber(loanAmount);
    console.log('✅ Found customerId:', customerId);

    if (resolvedRequestedAmount === null || resolvedRequestedAmount < MIN_REQUESTED_AMOUNT) {
      return NextResponse.json(
        {
          error: `วงเงินจำนำขั้นต่ำ ${MIN_REQUESTED_AMOUNT.toLocaleString()} บาท`,
          code: 'MIN_LOAN_AMOUNT',
        },
        { status: 400 }
      );
    }

    const branchInput = typeof branchId === 'string' ? branchId.trim() : '';
    if (!branchInput) {
      return NextResponse.json(
        { error: 'กรุณาเลือกสาขาก่อนดำเนินการ' },
        { status: 400 }
      );
    }

    let resolvedBranch: { drop_point_id: string; latitude: number | null; longitude: number | null } | null = null;

    if (isUuid(branchInput)) {
      const { data: branchById, error: branchByIdError } = await supabase
        .from('drop_points')
        .select('drop_point_id, latitude, longitude')
        .eq('drop_point_id', branchInput)
        .single();

      if (!branchByIdError && branchById) {
        resolvedBranch = branchById;
      }
    }

    if (!resolvedBranch) {
      const { data: branchByCode, error: branchByCodeError } = await supabase
        .from('drop_points')
        .select('drop_point_id, latitude, longitude')
        .eq('drop_point_code', branchInput)
        .single();

      if (!branchByCodeError && branchByCode) {
        resolvedBranch = branchByCode;
      }
    }

    if (!resolvedBranch) {
      return NextResponse.json(
        { error: 'ไม่พบสาขาที่เลือก กรุณาเลือกสาขาใหม่' },
        { status: 400 }
      );
    }

    const resolvedBranchId = resolvedBranch.drop_point_id;

    if (deliveryMethod === 'delivery') {
      const locationLat = Number(
        typeof userLocation?.latitude === 'number'
          ? userLocation.latitude
          : pawnerData.last_location_lat
      );
      const locationLng = Number(
        typeof userLocation?.longitude === 'number'
          ? userLocation.longitude
          : pawnerData.last_location_lng
      );

      if (!Number.isFinite(locationLat) || !Number.isFinite(locationLng)) {
        return NextResponse.json(
          {
            error: 'กรุณาอนุญาตตำแหน่งของคุณก่อนใช้บริการจัดส่ง',
            code: 'LOCATION_REQUIRED'
          },
          { status: 400 }
        );
      }

      if (resolvedBranch.latitude == null || resolvedBranch.longitude == null) {
        return NextResponse.json(
          { error: 'สาขาที่เลือกยังไม่พร้อมให้บริการจัดส่ง กรุณาเลือกสาขาอื่นหรือเลือก Walk-in' },
          { status: 400 }
        );
      }

      const distanceMeters = haversineDistanceMeters(
        { latitude: locationLat, longitude: locationLng },
        { latitude: Number(resolvedBranch.latitude), longitude: Number(resolvedBranch.longitude) }
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

    const itemType = itemData?.itemType;
    const serialValue = typeof itemData?.serialNumber === 'string'
      ? itemData.serialNumber.trim()
      : typeof itemData?.serialNo === 'string'
        ? itemData.serialNo.trim()
        : '';

    if (isSerialRequiredForType(itemType) && !serialValue) {
      return NextResponse.json(
        { error: 'กรุณาระบุหมายเลขเครื่อง/Serial ก่อนดำเนินการ', code: 'SERIAL_REQUIRED' },
        { status: 400 }
      );
    }

    const itemCondition = clampInt(itemData?.condition, 0, 100);
    const estimatedValue = normalizeNumber(itemData?.estimatedPrice);
    const aiConditionScore = normalizeNumber(itemData?.aiConditionScore);
    const aiConfidence = normalizeNumber(itemData?.aiConfidence);

    // Create item record
    const itemRecord = {
      customer_id: customerId,
      item_type: itemType,
      brand: itemData.brand,
      model: itemData.model,
      capacity: itemData.capacity || null,
      serial_number: serialValue || null,
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
      drop_point_id: resolvedBranchId,
      requested_amount: resolvedRequestedAmount,
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
