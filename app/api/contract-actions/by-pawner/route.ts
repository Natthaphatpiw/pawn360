import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import { sanitizedServerError } from '@/lib/security/transaction-request';

export async function GET(request: NextRequest) {
  try {
    const { lineId } = await requireLiffIdentity(request, 'PAWNER');

    const supabase = supabaseAdmin();

    const { data: pawner, error: pawnerError } = await supabase
      .from('pawners')
      .select('customer_id')
      .eq('line_id', lineId)
      .single();

    if (pawnerError || !pawner) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลผู้ใช้', code: 'PAWNER_NOT_FOUND' },
        { status: 404 }
      );
    }

    const { data: contracts, error: contractsError } = await supabase
      .from('contracts')
      .select('contract_id')
      .eq('customer_id', pawner.customer_id)
      .limit(500);

    if (contractsError) {
      throw contractsError;
    }

    const contractIds = (contracts || []).map((contract) => contract.contract_id);
    if (contractIds.length === 0) {
      return NextResponse.json(
        { success: true, requests: [] },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    // refund_status/refund_amount arrive via
    // 2026_08_05_add_action_request_refund.sql. PostgREST rejects the entire
    // select on an unknown column, so an unapplied migration would empty the
    // pawner's whole request list rather than just omit a badge.
    const buildSelect = (withRefund: boolean) => `
        request_id,
        request_type,
        request_status,
        increase_amount,
        reduction_amount,
        interest_to_pay,
        interest_for_period,
        total_amount,
        ${withRefund ? 'refund_status,\n        refund_amount,' : ''}
        created_at,
        updated_at,
        contract:contract_id (
          contract_id,
          contract_number,
          contract_status,
          items:item_id (
            item_id,
            brand,
            model,
            capacity,
            image_urls
          )
        )
      `;

    const selectRequests = (withRefund: boolean) => supabase
      .from('contract_action_requests')
      .select(buildSelect(withRefund))
      .in('contract_id', contractIds)
      .in('request_status', [
        'PENDING',
        'AWAITING_PAYMENT',
        'SLIP_UPLOADED',
        'SLIP_VERIFIED',
        'SLIP_REJECTED',
        'AWAITING_SIGNATURE',
        'PENDING_INVESTOR_APPROVAL',
        'AWAITING_INVESTOR_APPROVAL',
        'INVESTOR_APPROVED',
        'INVESTOR_REJECTED',
        'AWAITING_INVESTOR_PAYMENT',
        'INVESTOR_SLIP_UPLOADED',
        'INVESTOR_SLIP_VERIFIED',
        'INVESTOR_SLIP_REJECTED',
        'INVESTOR_TRANSFERRED',
        'AWAITING_PAWNER_CONFIRM'
      ])
      .order('created_at', { ascending: false })
      .limit(500);

    let { data: requests, error: requestsError } = await selectRequests(true);
    if (requestsError && `${requestsError.message || ''}`.toLowerCase().includes('refund_')) {
      console.warn('contract_action_requests refund columns are missing; run 2026_08_05_add_action_request_refund.sql. Loading without them.');
      ({ data: requests, error: requestsError } = await selectRequests(false));
    }

    if (requestsError) {
      throw requestsError;
    }

    return NextResponse.json({
      success: true,
      requests: requests || [],
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    console.error('[contract-actions:by-pawner] failed');
    return sanitizedServerError('ไม่สามารถโหลดสถานะคำขอได้ กรุณาลองใหม่');
  }
}
