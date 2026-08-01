import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';

function rateLimitResponse(error: ActorRateLimitError) {
  return NextResponse.json(
    {
      error: error.status === 429
        ? 'ตรวจสอบข้อมูลถี่เกินไป กรุณารอสักครู่'
        : 'ระบบตรวจสอบข้อมูลยังไม่พร้อม กรุณาลองใหม่',
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ lineId: string }> },
) {
  try {
    const { lineId: rawLineId } = await context.params;
    const claimedLineId = String(rawLineId || '').trim();
    if (!/^U[A-Za-z0-9]{20,64}$/.test(claimedLineId)
      && !(process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LIFF_MOCK === 'true')) {
      return NextResponse.json(
        { error: 'ข้อมูลบัญชีไม่ถูกต้อง', code: 'LINE_ID_INVALID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let lineId: string;
    try {
      lineId = await requireLiffOwner(request, 'DROP_POINT', claimedLineId);
    } catch (error) {
      return liffAuthErrorResponse(error);
    }
    await enforceActorRateLimit({
      scope: 'drop-point-profile',
      actor: lineId,
      limit: 30,
      windowSeconds: 10 * 60,
    });

    const supabase = supabaseAdmin();
    const { data: dropPoint, error } = await supabase
      .from('drop_points')
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
      .eq('line_id', lineId)
      .maybeSingle();

    if (error) {
      console.error('[drop-points:profile] database failure', { code: error.code || 'unknown' });
      return NextResponse.json(
        { error: 'ไม่สามารถตรวจสอบข้อมูลจุดรับสินค้าได้', code: 'DROP_POINT_LOOKUP_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
    }
    if (!dropPoint) {
      return NextResponse.json(
        { success: true, registered: false, dropPoint: null },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { success: true, registered: true, dropPoint },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof ActorRateLimitError) return rateLimitResponse(error);
    console.error('[drop-points:profile] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถตรวจสอบข้อมูลจุดรับสินค้าได้', code: 'DROP_POINT_LOOKUP_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
