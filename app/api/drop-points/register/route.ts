import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import {
  boundedText,
  finiteNumber,
  readBoundedJsonObject,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const MAX_REGISTRATION_BYTES = 48 * 1024;

function optionalText(value: unknown, maxLength: number): string | null {
  return boundedText(value, maxLength, false);
}
export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request, MAX_REGISTRATION_BYTES);
    const claimedLineId = boundedText(body.line_id, 80, true) || '';

    let lineId: string;
    try {
      lineId = await requireLiffOwner(request, 'DROP_POINT', claimedLineId);
    } catch (error) {
      return liffAuthErrorResponse(error);
    }

    await enforceActorRateLimit({
      scope: 'drop-point-register',
      actor: lineId,
      limit: 5,
      windowSeconds: 15 * 60,
    });

    const dropPointName = boundedText(body.drop_point_name, 160, true) || '';
    const dropPointCode = boundedText(body.drop_point_code, 40, true)?.toUpperCase() || '';
    const phoneNumber = boundedText(body.phone_number, 32, true) || '';
    if (!/^[A-Z0-9_-]{2,40}$/.test(dropPointCode) || !/^\+?[0-9 -]{8,20}$/.test(phoneNumber)) {
      return NextResponse.json(
        { error: 'รหัสสาขาหรือเบอร์โทรไม่ถูกต้อง', code: 'INVALID_REGISTRATION_DATA' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const latitude = finiteNumber(body.latitude, { min: -90, max: 90 });
    const longitude = finiteNumber(body.longitude, { min: -180, max: 180 });
    const openingHours = body.opening_hours;
    if (
      openingHours != null
      && (typeof openingHours !== 'object'
        || Array.isArray(openingHours)
        || JSON.stringify(openingHours).length > 4_096)
    ) {
      return NextResponse.json(
        { error: 'ข้อมูลเวลาทำการไม่ถูกต้อง', code: 'INVALID_OPENING_HOURS' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const supabase = supabaseAdmin();
    const [{ data: existingCode }, { data: existingLine }] = await Promise.all([
      supabase
        .from('drop_points')
        .select('drop_point_id')
        .eq('drop_point_code', dropPointCode)
        .maybeSingle(),
      supabase
        .from('drop_points')
        .select('drop_point_id')
        .eq('line_id', lineId)
        .maybeSingle(),
    ]);

    if (existingCode) {
      return NextResponse.json(
        { error: 'รหัสสาขานี้มีอยู่แล้ว', code: 'DROP_POINT_CODE_EXISTS' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (existingLine) {
      return NextResponse.json(
        { error: 'บัญชี LINE นี้ลงทะเบียนแล้ว', code: 'DROP_POINT_ACCOUNT_EXISTS' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { data: dropPoint, error } = await supabase
      .from('drop_points')
      .insert({
        drop_point_name: dropPointName,
        drop_point_code: dropPointCode,
        phone_number: phoneNumber,
        email: optionalText(body.email, 254),
        addr_house_no: optionalText(body.addr_house_no, 100),
        addr_village: optionalText(body.addr_village, 160),
        addr_street: optionalText(body.addr_street, 160),
        addr_sub_district: optionalText(body.addr_sub_district, 160),
        addr_district: optionalText(body.addr_district, 160),
        addr_province: optionalText(body.addr_province, 160),
        addr_postcode: optionalText(body.addr_postcode, 16),
        google_map_url: optionalText(body.google_map_url, 2_048),
        map_embed: null,
        latitude,
        longitude,
        manager_name: optionalText(body.manager_name, 160),
        manager_phone: optionalText(body.manager_phone, 32),
        manager_line_id: lineId,
        line_id: lineId,
        opening_hours: openingHours || null,
        is_active: true,
        is_accepting_items: true,
      })
      .select(`
        drop_point_id,
        drop_point_name,
        drop_point_code,
        phone_number,
        email,
        addr_house_no,
        addr_street,
        addr_sub_district,
        addr_district,
        addr_province,
        addr_postcode,
        manager_name,
        is_active,
        is_accepting_items
      `)
      .single();

    if (error || !dropPoint) {
      console.error('[drop-points:register] database failure', { code: error?.code || 'unknown' });
      return NextResponse.json(
        { error: 'ไม่สามารถลงทะเบียนจุดรับสินค้าได้', code: 'DROP_POINT_CREATE_FAILED' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { success: true, dropPoint },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if (error instanceof ActorRateLimitError) {
      return NextResponse.json(
        {
          error: error.status === 429
            ? 'ส่งคำขอลงทะเบียนถี่เกินไป กรุณารอแล้วลองใหม่'
            : 'ระบบควบคุมคำขอยังไม่พร้อม กรุณาลองใหม่',
          code: error.code,
          retryable: true,
        },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(error.retryAfterSeconds),
          },
        },
      );
    }
    console.error('[drop-points:register] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการลงทะเบียน', code: 'DROP_POINT_CREATE_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
