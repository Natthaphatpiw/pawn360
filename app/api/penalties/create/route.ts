import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { getPenaltyRequirement, toDateString } from '@/lib/services/penalty';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const contractId = typeof body?.contractId === 'string' ? body.contractId.trim() : '';
    const pawnerLineId = typeof body?.pawnerLineId === 'string' ? body.pawnerLineId.trim() : '';

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

    if (pawnerLineId && pawner?.line_id && pawner.line_id !== pawnerLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const requirement = await getPenaltyRequirement(supabase, contract);

    if (requirement.daysOverdue <= 0) {
      return NextResponse.json({
        success: true,
        penaltyRequired: false,
        message: 'No penalty required',
      });
    }

    if (!requirement.required) {
      return NextResponse.json({
        success: true,
        penaltyRequired: false,
        alreadyPaid: true,
        message: 'Penalty already paid for today',
      });
    }

    const todayIso = toDateString(requirement.today);
    const { data: existingPayments, error: existingError } = await supabase
      .from('penalty_payments')
      .select('penalty_id, status, penalty_amount, days_overdue, penalty_date')
      .eq('contract_id', contract.contract_id)
      .eq('penalty_date', todayIso)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    const existing = Array.isArray(existingPayments) ? existingPayments[0] : null;
    if (existing) {
      return NextResponse.json({
        success: true,
        penaltyRequired: true,
        paymentId: existing.penalty_id,
        status: existing.status,
        penaltyAmount: existing.penalty_amount,
        daysOverdue: existing.days_overdue,
        penaltyDate: existing.penalty_date,
      });
    }

    const nowIso = new Date().toISOString();
    const { data: created, error: createError } = await supabase
      .from('penalty_payments')
      .insert({
        contract_id: contract.contract_id,
        customer_id: contract.customer_id,
        investor_id: contract.investor_id,
        penalty_date: todayIso,
        days_overdue: requirement.daysOverdue,
        penalty_amount: requirement.penaltyAmount,
        status: 'PENDING',
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select()
      .single();

    if (createError || !created) {
      console.error('Error creating penalty payment:', createError);
      return NextResponse.json(
        { error: 'Failed to create penalty payment' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      penaltyRequired: true,
      paymentId: created.penalty_id,
      status: created.status,
      penaltyAmount: created.penalty_amount,
      daysOverdue: created.days_overdue,
      penaltyDate: created.penalty_date,
    });
  } catch (error: any) {
    console.error('Error creating penalty payment:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
