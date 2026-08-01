import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { getPenaltyRequirement, toDateString } from '@/lib/services/penalty';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import { acquireTransactionLock, transactionLockErrorResponse } from '@/lib/security/transaction-lock';
import {
  boundedText,
  readBoundedJsonObject,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request) as any;
    const contractId = requireUuid(body?.contractId);
    const pawnerLineId = boundedText(body?.pawnerLineId, 128, true) || '';
    const verifiedLineId = await requireLiffOwner(request, 'PAWNER', pawnerLineId);

    releaseLock = await acquireTransactionLock('penalty-create', contractId, 60);

    const supabase = supabaseAdmin();
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        contract_status,
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

    if (!pawner?.line_id || pawner.line_id !== verifiedLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    if (!['ACTIVE', 'CONFIRMED'].includes(contract.contract_status)) {
      return NextResponse.json(
        { error: 'สัญญาไม่อยู่ในสถานะที่สร้างรายการค่าปรับได้' },
        { status: 409 },
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
      .select('penalty_id, status, penalty_amount, days_overdue, penalty_date')
      .single();

    if (createError || !created) {
      if (createError?.code === '23505') {
        const { data: racedExisting } = await supabase
          .from('penalty_payments')
          .select('penalty_id, status, penalty_amount, days_overdue, penalty_date')
          .eq('contract_id', contract.contract_id)
          .eq('penalty_date', todayIso)
          .maybeSingle();
        if (racedExisting) {
          return NextResponse.json({
            success: true,
            penaltyRequired: true,
            paymentId: racedExisting.penalty_id,
            status: racedExisting.status,
            penaltyAmount: racedExisting.penalty_amount,
            daysOverdue: racedExisting.days_overdue,
            penaltyDate: racedExisting.penalty_date,
            resumed: true,
          });
        }
      }
      console.error('Error creating penalty payment');
      return sanitizedServerError('ไม่สามารถสร้างรายการค่าปรับได้ กรุณาลองใหม่');
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
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error creating penalty payment');
    return sanitizedServerError('ไม่สามารถสร้างรายการค่าปรับได้ กรุณาลองใหม่');
  } finally {
    if (releaseLock) await releaseLock();
  }
}
