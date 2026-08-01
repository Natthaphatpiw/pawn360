import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import { getContractRemainingDays } from '@/lib/utils/time';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ contractId: string }> }
) {
  try {
    const { contractId } = await context.params;

    if (!UUID_PATTERN.test(String(contractId || ''))) {
      return NextResponse.json(
        { error: 'รหัสสัญญาไม่ถูกต้อง', code: 'CONTRACT_ID_INVALID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let lineId: string;
    try {
      const identity = await requireLiffIdentity(request, 'PAWNER');
      lineId = identity.lineId;
    } catch (error) {
      return liffAuthErrorResponse(error);
    }
    await enforceActorRateLimit({
      scope: 'pawner-contract-detail',
      actor: lineId,
      limit: 60,
      windowSeconds: 10 * 60,
    });

    const supabase = supabaseAdmin();
    const { data: pawner, error: pawnerError } = await supabase
      .from('pawners')
      .select('customer_id, firstname, lastname')
      .eq('line_id', lineId)
      .maybeSingle();

    if (pawnerError) {
      console.error('[pawners:contract-detail] owner lookup failed', {
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

    const { data: contractData, error } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        contract_start_date,
        contract_end_date,
        contract_duration_days,
        loan_principal_amount,
        interest_rate,
        interest_amount,
        total_amount,
        contract_status,
        items!inner (
          item_type,
          brand,
          model
        )
      `)
      .eq('contract_id', contractId)
      .eq('customer_id', pawner.customer_id)
      .maybeSingle();

    if (error) {
      console.error('[pawners:contract-detail] contract query failed', {
        code: error.code || 'unknown',
      });
      return NextResponse.json(
        { error: 'ไม่สามารถโหลดรายละเอียดสัญญาได้', code: 'CONTRACT_DETAIL_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } },
      );
    }
    if (!contractData) {
      return NextResponse.json(
        { error: 'ไม่พบสัญญาหรือคุณไม่มีสิทธิ์เข้าถึง', code: 'CONTRACT_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // Calculate remaining days on this contract's own term (a renewal starts
    // when the previous term ends, so it can begin in the future).
    const remainingDays = Math.max(0, getContractRemainingDays(contractData));

    // Format data for frontend
    const formattedContract = {
      contract_id: contractData.contract_id,
      contract_number: contractData.contract_number,
      customer: {
        name: `${pawner.firstname || ''} ${pawner.lastname || ''}`.trim() || 'ไม่พบข้อมูล',
        idCard: 'ข้อมูลถูกปกปิด',
        phone: 'ข้อมูลถูกปกปิด',
      },
      details: {
        contractId: contractData.contract_number,
        item: contractData.items && contractData.items.length > 0
          ? `${contractData.items[0].brand} ${contractData.items[0].model}`.trim()
          : 'ไม่พบข้อมูลสินค้า',
        status: contractData.contract_status === 'ACTIVE' ? 'ปกติ' : contractData.contract_status,
        value: Number(contractData.loan_principal_amount || 0).toLocaleString('th-TH'),
        interest: `${Number(contractData.interest_amount || 0).toLocaleString('th-TH')} (${(Number(contractData.interest_rate || 0) * 100).toFixed(1)}%)`,
        duration: `${contractData.contract_duration_days} วัน`,
        startDate: new Date(contractData.contract_start_date).toLocaleDateString('th-TH'),
        endDate: new Date(contractData.contract_end_date).toLocaleDateString('th-TH'),
        partnerName: 'Pawnly'
      },
      remark: 'ไม่มี',
      remainingDays: remainingDays
    };

    return NextResponse.json(
      { success: true, contract: formattedContract },
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
    console.error('[pawners:contract-detail] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถโหลดรายละเอียดสัญญาได้', code: 'CONTRACT_DETAIL_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
