import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const claimedLineId = String(searchParams.get('lineId') || '').trim();

    if (!claimedLineId) {
      return NextResponse.json(
        { error: 'ข้อมูลบัญชีไม่ครบถ้วน', code: 'LINE_ID_REQUIRED' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let lineId: string;
    try {
      lineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);
    } catch (error) {
      return liffAuthErrorResponse(error);
    }
    await enforceActorRateLimit({
      scope: 'pawner-registration-status',
      actor: lineId,
      limit: 30,
      windowSeconds: 10 * 60,
    });

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from('pawners')
      .select('customer_id, kyc_status')
      .eq('line_id', lineId)
      .maybeSingle();

    if (error) {
      console.error('[pawner:registration-status] database failure', {
        code: error.code || 'unknown',
      });
      return NextResponse.json(
        { error: 'ไม่สามารถตรวจสอบสถานะการลงทะเบียนได้', code: 'REGISTRATION_LOOKUP_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
    }

    const isRegistered = !!data;

    return NextResponse.json(
      {
        isRegistered,
        pawnerData: data
          ? { customer_id: data.customer_id, kyc_status: data.kyc_status }
          : null,
      },
      { headers: { 'Cache-Control': 'no-store, private' } },
    );
  } catch (error) {
    if (error instanceof ActorRateLimitError) {
      return NextResponse.json(
        {
          error: error.status === 429
            ? 'ตรวจสอบสถานะถี่เกินไป กรุณารอสักครู่'
            : 'ระบบควบคุมการใช้งานยังไม่พร้อม กรุณาลองใหม่',
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
    console.error('[pawner:registration-status] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถตรวจสอบสถานะการลงทะเบียนได้', code: 'REGISTRATION_LOOKUP_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
