import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import { sanitizedServerError } from '@/lib/security/transaction-request';

const INVESTOR_APPROVAL_REQUEST_STATUSES = [
  'PENDING_INVESTOR_APPROVAL',
  'AWAITING_INVESTOR_APPROVAL',
];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ lineId: string }> }
) {
  try {
    await context.params;
    const { lineId } = await requireLiffIdentity(request, 'INVESTOR');

    const supabase = supabaseAdmin();

    // Get investor by LINE ID
    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('investor_id')
      .eq('line_id', lineId)
      .single();

    if (investorError || !investor) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูล Asset Funding', code: 'INVESTOR_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Get investor contracts across active and completed states
    const { data: contracts, error: contractsError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        contract_start_date,
        contract_end_date,
        contract_duration_days,
        loan_principal_amount,
        current_principal_amount,
        original_principal_amount,
        interest_rate,
        interest_amount,
        total_amount,
        platform_fee_rate,
        investor_rate,
        contract_status,
        funding_status,
        payment_status,
        item_delivery_status,
        completed_at,
        created_at,
        updated_at,
        items:item_id (
          item_id,
          brand,
          model,
          capacity,
          image_urls,
          item_condition
        ),
        drop_points:drop_point_id (
          drop_point_id,
          drop_point_name
        )
      `)
      .eq('investor_id', investor.investor_id)
      .in('contract_status', ['ACTIVE', 'CONFIRMED', 'EXTENDED', 'COMPLETED', 'DEFAULTED', 'TERMINATED'])
      .order('created_at', { ascending: false })
      .limit(500);

    if (contractsError) {
      console.error('[contracts:by-investor] query failed');
      return NextResponse.json(
        { error: 'ไม่สามารถโหลดรายการสัญญาได้', code: 'CONTRACT_QUERY_FAILED' },
        { status: 500 }
      );
    }

    const contractIds = (contracts || []).map((contract) => contract.contract_id);
    let principalIncreaseRequestByContractId: Record<string, any> = {};

    if (contractIds.length > 0) {
      const { data: principalIncreaseRequests, error: requestsError } = await supabase
        .from('contract_action_requests')
        .select(`
          request_id,
          contract_id,
          request_type,
          request_status,
          increase_amount,
          principal_after_increase,
          created_at,
          updated_at
        `)
        .in('contract_id', contractIds)
        .eq('request_type', 'PRINCIPAL_INCREASE')
        .in('request_status', INVESTOR_APPROVAL_REQUEST_STATUSES)
        .order('created_at', { ascending: false })
        .limit(500);

      if (requestsError) {
        console.error('[contracts:by-investor] action request query delayed');
      }

      principalIncreaseRequestByContractId = (principalIncreaseRequests || []).reduce<Record<string, any>>((acc, request) => {
        if (request.contract_id && !acc[request.contract_id]) {
          acc[request.contract_id] = request;
        }
        return acc;
      }, {});
    }

    // Calculate additional info for each contract
    const contractsWithInfo = contracts?.map(contract => {
      const endDate = new Date(contract.contract_end_date);
      const now = new Date();
      const remainingDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      return {
        ...contract,
        pending_principal_increase_request: principalIncreaseRequestByContractId[contract.contract_id] || null,
        remaining_days: remainingDays,
        is_overdue: remainingDays < 0
      };
    }) || [];

    return NextResponse.json({
      success: true,
      contracts: contractsWithInfo
    }, { headers: { 'Cache-Control': 'private, no-store' } });

  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    console.error('[contracts:by-investor] failed');
    return sanitizedServerError('ไม่สามารถโหลดรายการสัญญาได้ กรุณาลองใหม่');
  }
}
