import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { haversineDistanceMeters } from '@/lib/services/geo';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  finiteNumber,
  readBoundedJsonObject,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

export async function POST(request: NextRequest) {
  try {
    let lineId = 'local-mock';
    if (!(process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LIFF_MOCK === 'true')) {
      const identity = await requireLiffIdentity(request, 'PAWNER');
      lineId = identity.lineId;
    }
    await enforceActorRateLimit({
      scope: 'resolve-drop-point',
      actor: lineId,
      limit: 30,
      windowSeconds: 10 * 60,
    });

    const body = await readBoundedJsonObject(request, 8 * 1024);
    const latitude = finiteNumber(body.latitude, { min: -90, max: 90, required: true }) || 0;
    const longitude = finiteNumber(body.longitude, { min: -180, max: 180, required: true }) || 0;

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from('drop_points')
      .select(
        'drop_point_id, drop_point_name, latitude, longitude, addr_sub_district, addr_district, addr_province, addr_postcode'
      )
      .eq('is_active', true)
      .eq('is_accepting_items', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) {
      console.error('[drop-points:resolve] database failure', { code: error.code || 'unknown' });
      return NextResponse.json(
        { error: 'ไม่สามารถค้นหาจุดรับสินค้าได้', code: 'BRANCH_LOOKUP_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, reason: 'NO_ACTIVE_BRANCHES' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const origin = { latitude, longitude };
    let best: (typeof data)[number] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const branch of data) {
      if (branch.latitude == null || branch.longitude == null) continue;
      const distance = haversineDistanceMeters(origin, {
        latitude: Number(branch.latitude),
        longitude: Number(branch.longitude),
      });
      if (Number.isFinite(distance) && distance < bestDistance) {
        bestDistance = distance;
        best = branch;
      }
    }

    if (!best) {
      return NextResponse.json(
        { success: false, reason: 'NO_VALID_COORDS' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        branch: {
          branch_id: best.drop_point_id,
          branch_name: best.drop_point_name,
          district: best.addr_district,
          province: best.addr_province,
          postcode: best.addr_postcode,
        },
        distance_m: Math.round(bestDistance),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if (error instanceof ActorRateLimitError) {
      return NextResponse.json(
        {
          error: error.status === 429
            ? 'ค้นหาจุดรับสินค้าถี่เกินไป กรุณารอสักครู่'
            : 'ระบบค้นหาจุดรับสินค้ายังไม่พร้อม',
          code: error.code,
          retryable: true,
        },
        {
          status: error.status,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': String(error.retryAfterSeconds) },
        },
      );
    }
    console.error('[drop-points:resolve] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถค้นหาจุดรับสินค้าได้', code: 'BRANCH_LOOKUP_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
