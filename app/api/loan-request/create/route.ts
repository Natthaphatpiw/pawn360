import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { haversineDistanceMeters } from '@/lib/services/geo';
import { buildItemNotesWithPasscode } from '@/lib/utils/item-private-notes';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import {
  EstimateAttestationError,
  estimateAttestationErrorResponse,
  verifyEstimateAttestation,
} from '@/lib/security/estimate-attestation';
import {
  acquireTransactionLock,
  transactionLockErrorResponse,
} from '@/lib/security/transaction-lock';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);
const MIN_REQUESTED_AMOUNT = 1000;
const MAX_JSON_BYTES = 256 * 1024;

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
  let releaseLock: (() => Promise<void>) | null = null;
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
      loanAmount,
      deliveryMethod,
      deliveryFee,
      branchId,
      userLocation,
      duration,
      draftItemId,
    } = body;

    if (typeof claimedLineId !== 'string' || !claimedLineId.trim() || claimedLineId.length > 80) {
      return NextResponse.json(
        { error: 'LINE ID is required', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    if (!itemData || typeof itemData !== 'object' || JSON.stringify(itemData).length > 128 * 1024) {
      return NextResponse.json(
        { error: 'Invalid item data', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    let lineId: string;
    try {
      lineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);
    } catch (error) {
      return liffAuthErrorResponse(error);
    }

    const attestation = verifyEstimateAttestation(itemData.estimateAttestation, {
      lineId,
      itemData,
    });
    releaseLock = await acquireTransactionLock(
      'loan-request-create',
      attestation.referenceId,
      120,
    );

    // Get customer_id from lineId
    const { data: pawnerData, error: pawnerError } = await supabase
      .from('pawners')
      .select('customer_id, last_location_lat, last_location_lng')
      .eq('line_id', lineId)
      .single();

    if (pawnerError || !pawnerData) {
      return NextResponse.json(
        { error: 'Pawner not found' },
        { status: 404 }
      );
    }

    const customerId = pawnerData.customer_id;
    const resolvedRequestedAmount = normalizeNumber(loanAmount);

    if (resolvedRequestedAmount === null || resolvedRequestedAmount < MIN_REQUESTED_AMOUNT) {
      return NextResponse.json(
        {
          error: `วงเงินขอสินเชื่อขั้นต่ำ ${MIN_REQUESTED_AMOUNT.toLocaleString()} บาท`,
          code: 'MIN_LOAN_AMOUNT',
        },
        { status: 400 }
      );
    }
    if (resolvedRequestedAmount > attestation.estimatedPrice) {
      return NextResponse.json(
        {
          error: `วงเงินสูงสุดตามราคาประเมินคือ ${attestation.estimatedPrice.toLocaleString()} บาท`,
          code: 'LOAN_AMOUNT_EXCEEDS_ESTIMATE',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { data: existingRequest, error: existingRequestError } = await supabase
      .from('loan_requests')
      .select('request_id, item_id')
      .eq('customer_id', customerId)
      .eq('estimate_reference_id', attestation.referenceId)
      .maybeSingle();
    if (existingRequestError) {
      console.error('[loan-request:create] estimate idempotency lookup failed', {
        code: existingRequestError.code || 'unknown',
      });
      return NextResponse.json(
        {
          error: 'ระบบยืนยันราคาประเมินยังไม่พร้อม กรุณาลองใหม่อีกครั้ง',
          code: 'ESTIMATE_LEDGER_UNAVAILABLE',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } },
      );
    }
    if (existingRequest) {
      return NextResponse.json({
        success: true,
        loanRequestId: existingRequest.request_id,
        itemId: existingRequest.item_id,
        message: 'Loan request already created',
        idempotentReplay: true,
      });
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

    const itemCondition = Math.round(attestation.condition * 100);
    const estimatedValue = attestation.estimatedPrice;
    const aiConditionScore = attestation.aiCondition ?? attestation.condition;
    const aiConfidence = attestation.confidence;
    const conditionChecklist = itemData?.conditionChecklist || null;

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
      condition_checklist: conditionChecklist,
      accessories: itemData.appleAccessories ? itemData.appleAccessories.join(', ') : null,
      defects: itemData.defects || null,
      notes: buildItemNotesWithPasscode(itemData.notes, itemData.devicePasscode),
      image_urls: itemData.images,
      item_status: 'PENDING',
      estimate_job_id: attestation.referenceId,
      estimate_attestation: itemData.estimateAttestation,
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

    if (itemError && `${itemError.message || ''}`.toLowerCase().includes('item_status')) {
      const fallbackRecord = { ...itemRecord, item_status: 'DRAFT' };
      delete (fallbackRecord as Record<string, unknown>).condition_checklist;
      ({ data: item, error: itemError } = await insertItemRecord(fallbackRecord));
    }

    if (itemError || !item) {
      console.error('Error creating item:', itemError);
      return NextResponse.json(
        { error: 'Failed to create item record', code: 'ITEM_CREATE_FAILED' },
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
      estimate_reference_id: attestation.referenceId,
    };

    const { data: loanRequest, error: loanRequestError } = await supabase
      .from('loan_requests')
      .insert(loanRequestRecord)
      .select()
      .single();

    if (loanRequestError || !loanRequest) {
      console.error('[loan-request:create] insert failed', {
        code: loanRequestError?.code || 'unknown',
      });
      // Compensate the item insert so a failed multi-table mutation does not
      // leave an orphan that can later be mistaken for an active request.
      await supabase
        .from('items')
        .delete()
        .eq('item_id', item.item_id)
        .eq('customer_id', customerId);
      return NextResponse.json(
        { error: 'Failed to create loan request' },
        { status: 500 }
      );
    }

    if (typeof draftItemId === 'string' && draftItemId.trim()) {
      const { error: deleteDraftError } = await supabase
        .from('items')
        .delete()
        .eq('item_id', draftItemId.trim())
        .eq('line_id', lineId)
        .eq('item_status', 'DRAFT');

      if (deleteDraftError) {
        console.error('Error deleting consumed draft:', deleteDraftError);
      }
    }

    return NextResponse.json({
      success: true,
      loanRequestId: loanRequest.request_id,
      itemId: item.item_id,
      message: 'Loan request created successfully',
    });
  } catch (error) {
    if (error instanceof EstimateAttestationError) {
      return NextResponse.json(estimateAttestationErrorResponse(error), {
        status: error.status,
        headers: {
          'Cache-Control': 'no-store',
          ...(error.status === 503 ? { 'Retry-After': '30' } : {}),
        },
      });
    }
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[loan-request:create] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await releaseLock?.();
  }
}
