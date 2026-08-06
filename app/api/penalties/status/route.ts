import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  PENALTY_PER_DAY,
  buildPenaltyLiffUrl,
  getPenaltyRequirement,
  roundCurrency,
  toDateString,
} from '@/lib/services/penalty';
import { requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const contractId = requireUuid(searchParams.get('contractId'));
    const identity = await requireLiffIdentity(request, 'PAWNER');

    const supabase = supabaseAdmin();
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        contract_start_date,
        contract_end_date,
        current_principal_amount,
        loan_principal_amount,
        customer_id,
        investor_id,
        pawners:customer_id (
          line_id
        )
      `)
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const pawner = Array.isArray(contract.pawners) ? contract.pawners[0] : contract.pawners;

    if (!pawner?.line_id || pawner.line_id !== identity.lineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const requirement = await getPenaltyRequirement(supabase, contract);
    const todayIso = toDateString(requirement.today);

    let payment: {
      penalty_id: string;
      status: string;
      penalty_amount: number;
      days_overdue: number;
      penalty_date: string;
    } | null = null;
    if (requirement.daysOverdue > 0) {
      const { data: existingPayments, error: paymentError } = await supabase
        .from('penalty_payments')
        .select('penalty_id, status, penalty_amount, days_overdue, penalty_date')
        .eq('contract_id', contract.contract_id)
        .eq('penalty_date', todayIso)
        .order('created_at', { ascending: false })
        .limit(1);

      if (paymentError) {
        throw paymentError;
      }

      payment = Array.isArray(existingPayments) ? existingPayments[0] : null;
    }

    return NextResponse.json({
      success: true,
      penaltyRequired: requirement.required,
      alreadyPaid: requirement.daysOverdue > 0 && !requirement.required,
      penalty: {
        contractId: contract.contract_id,
        contractNumber: contract.contract_number,
        contractStartDate: requirement.contractStartDate.toISOString(),
        contractEndDate: requirement.contractEndDate.toISOString(),
        today: requirement.today.toISOString(),
        daysOverdue: requirement.daysOverdue,
        // The screen renders the rate and the day count and lets the pawner
        // check the multiplication, so both have to come from the engine.
        penaltyPerDay: roundCurrency(PENALTY_PER_DAY),
        unpaidDays: requirement.unpaidDays,
        penaltyAmount: requirement.penaltyAmount,
        penaltyDue: requirement.penaltyDue,
        overdueInterestAmount: requirement.overdueInterestAmount,
        overdueInterestDue: requirement.overdueInterestDue,
        totalLateChargeAmount: requirement.totalLateChargeAmount,
        totalLateChargeDue: requirement.totalLateChargeDue,
      },
      payment: payment ? {
        paymentId: payment.penalty_id,
        status: payment.status,
        penaltyAmount: payment.penalty_amount,
        daysOverdue: payment.days_overdue,
        penaltyDate: payment.penalty_date,
      } : null,
      penaltyLiffUrl: buildPenaltyLiffUrl(contract.contract_id),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('[penalty:status] failed');
    return sanitizedServerError('ไม่สามารถโหลดข้อมูลค่าปรับได้ กรุณาลองใหม่');
  }
}
