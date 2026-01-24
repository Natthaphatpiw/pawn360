import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { buildPenaltyLiffUrl, getPenaltyRequirement, toDateString } from '@/lib/services/penalty';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const contractId = searchParams.get('contractId');
    const lineId = searchParams.get('lineId');

    if (!contractId) {
      return NextResponse.json(
        { error: 'contractId is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        contract_start_date,
        contract_end_date,
        customer_id,
        investor_id,
        pawners:customer_id (
          line_id,
          firstname,
          lastname
        ),
        investors:investor_id (
          line_id,
          firstname,
          lastname
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

    if (lineId && pawner?.line_id && pawner.line_id !== lineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const requirement = await getPenaltyRequirement(supabase, contract);
    const todayIso = toDateString(requirement.today);

    let payment: any = null;
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
        penaltyAmount: requirement.penaltyAmount,
      },
      payment: payment ? {
        paymentId: payment.penalty_id,
        status: payment.status,
        penaltyAmount: payment.penalty_amount,
        daysOverdue: payment.days_overdue,
        penaltyDate: payment.penalty_date,
      } : null,
      penaltyLiffUrl: buildPenaltyLiffUrl(contract.contract_id),
    });
  } catch (error: any) {
    console.error('Error fetching penalty status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
