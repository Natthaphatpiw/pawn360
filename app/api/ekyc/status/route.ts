import { NextRequest, NextResponse } from 'next/server';
import { getActorDatabaseConfig } from '@/lib/ekyc/config';
import { EkycActorType } from '@/lib/ekyc/types';
import { hasKycSubmissionCompleted, isKycNeedReview } from '@/lib/kyc/review';
import { requireLiffIdentity, LiffAuthError } from '@/lib/security/liff-auth';
import { supabaseAdmin } from '@/lib/supabase/client';

function response(body: unknown, status = 200, retryAfter?: number) {
  const headers = new Headers({
    'Cache-Control': 'no-store, private, max-age=0',
    Pragma: 'no-cache',
  });
  if (retryAfter) headers.set('Retry-After', String(retryAfter));
  return NextResponse.json(body, { status, headers });
}

function actorTypeFromRequest(request: NextRequest): EkycActorType | null {
  const role = String(request.nextUrl.searchParams.get('role') || '').toUpperCase();
  if (role === 'PAWNER' || role === 'SELLER') return 'PAWNER';
  if (role === 'INVESTOR' || role === 'ASSET_FUNDING') return 'INVESTOR';
  return null;
}

export async function GET(request: NextRequest) {
  const actorType = actorTypeFromRequest(request);
  if (!actorType) {
    return response({ error: 'Invalid role', code: 'EKYC_ROLE_INVALID' }, 400);
  }

  try {
    const config = getActorDatabaseConfig(actorType);
    const identity = await requireLiffIdentity(request, config.lineTokenRole);
    const { data, error } = await supabaseAdmin()
      .from(config.table)
      .select('kyc_status, kyc_data, ekyc_url')
      .eq('line_id', identity.lineId)
      .maybeSingle();

    if (error) return response({ error: 'ไม่สามารถตรวจสอบสถานะได้ชั่วคราว', code: 'EKYC_STATUS_UNAVAILABLE', retryable: true }, 503, 15);
    if (!data) return response({ exists: false, status: 'NOT_REGISTERED' });
    const status = String(data.kyc_status || '');
    if (!['NOT_VERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'].includes(status)) {
      console.error('eKYC actor has an invalid status', { actorType, code: 'EKYC_STATUS_INVALID' });
      return response({ error: 'ไม่สามารถตรวจสอบสถานะได้ชั่วคราว', code: 'EKYC_STATUS_UNAVAILABLE', retryable: true }, 503, 15);
    }

    const reviewRequired = isKycNeedReview(data);
    const submissionCompleted = hasKycSubmissionCompleted(data);
    return response({
      exists: true,
      status,
      reviewRequired,
      submissionCompleted,
      resumeAvailable: status === 'PENDING'
        && Boolean(data.ekyc_url)
        && !reviewRequired
        && !submissionCompleted,
    });
  } catch (error) {
    if (error instanceof LiffAuthError) {
      return response({
        error: error.status === 503
          ? 'ไม่สามารถตรวจสอบบัญชี LINE ได้ชั่วคราว'
          : 'กรุณาเปิดหน้านี้ผ่าน LINE และเข้าสู่ระบบอีกครั้ง',
        code: error.code,
        retryable: error.retryable,
      }, error.status, error.retryable ? 15 : undefined);
    }
    console.error('eKYC status lookup failed', { code: error instanceof Error ? error.name : 'UNKNOWN_ERROR' });
    return response({ error: 'ไม่สามารถตรวจสอบสถานะได้ชั่วคราว', code: 'EKYC_STATUS_UNAVAILABLE', retryable: true }, 503, 15);
  }
}
