import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const claimedCustomerId = String(searchParams.get('customerId') || '').trim();

    let lineId: string;
    try {
      const identity = await requireLiffIdentity(request, 'PAWNER');
      lineId = identity.lineId;
    } catch (error) {
      return liffAuthErrorResponse(error);
    }
    await enforceActorRateLimit({
      scope: 'pawner-contract-list',
      actor: lineId,
      limit: 60,
      windowSeconds: 10 * 60,
    });

    const supabase = supabaseAdmin();
    const { data: pawner, error: pawnerError } = await supabase
      .from('pawners')
      .select('customer_id')
      .eq('line_id', lineId)
      .maybeSingle();

    if (pawnerError) {
      console.error('[pawners:contracts] owner lookup failed', {
        code: pawnerError.code || 'unknown',
      });
      return NextResponse.json(
        { error: 'ไม่สามารถตรวจสอบข้อมูลผู้ขายได้', code: 'PAWNER_LOOKUP_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
    }
    if (!pawner) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลผู้ขาย', code: 'PAWNER_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (claimedCustomerId && claimedCustomerId !== pawner.customer_id) {
      return NextResponse.json(
        { error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้', code: 'CUSTOMER_ACCESS_DENIED' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { data: contracts, error } = await supabase
      .from('contracts')
      .select('contract_id, contract_number, loan_principal_amount, contract_end_date, contract_status, items!inner(item_id, brand, model, item_type)')
      .eq('customer_id', pawner.customer_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[pawners:contracts] contract query failed', {
        code: error.code || 'unknown',
      });
      return NextResponse.json(
        { error: 'ไม่สามารถโหลดรายการสัญญาได้', code: 'CONTRACT_LIST_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
    }

    const formattedContracts = contracts?.map(contract => {
      const item = Array.isArray(contract.items) ? contract.items[0] : contract.items;
      const brand = item && typeof item === 'object' && 'brand' in item ? item.brand : '';
      const model = item && typeof item === 'object' && 'model' in item ? item.model : '';
      
      return {
        contract_id: contract.contract_id,
        contract_number: contract.contract_number,
        item_name: `${brand} ${model}`.trim(),
        loan_principal_amount: contract.loan_principal_amount,
        contract_end_date: contract.contract_end_date,
        contract_status: contract.contract_status
      };
    });

    return NextResponse.json(
      { success: true, contracts: formattedContracts },
      { headers: { 'Cache-Control': 'no-store, private' } },
    );

  } catch (error) {
    if (error instanceof ActorRateLimitError) {
      return NextResponse.json(
        {
          error: error.status === 429
            ? 'เรียกดูข้อมูลถี่เกินไป กรุณารอสักครู่'
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
    console.error('[pawners:contracts] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถโหลดรายการสัญญาได้', code: 'CONTRACT_LIST_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
