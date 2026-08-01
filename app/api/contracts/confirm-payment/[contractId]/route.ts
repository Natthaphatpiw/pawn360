import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { requireContractParty } from '@/lib/security/contract-access';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ contractId: string }> }
) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const { contractId: rawContractId } = await context.params;
    const contractId = requireUuid(rawContractId);

    const supabase = supabaseAdmin();

    const { data: existingContract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id, contract_number, contract_status, payment_status,
        pawners:customer_id (line_id)
      `)
      .eq('contract_id', contractId)
      .maybeSingle();

    if (contractError || !existingContract) {
      return NextResponse.json({ error: 'ไม่พบสัญญา', code: 'CONTRACT_NOT_FOUND' }, { status: 404 });
    }

    await requireContractParty(request, existingContract, 'PAWNER');
    releaseLock = await acquireFinancialLock(`contract:confirm-payment:${contractId}`);

    if (existingContract.payment_status === 'COMPLETED') {
      return NextResponse.json({
        success: true,
        alreadyCompleted: true,
        contract: {
          contractId: existingContract.contract_id,
          contractNumber: existingContract.contract_number,
          status: existingContract.contract_status,
          paymentStatus: existingContract.payment_status,
        },
      });
    }

    if (
      existingContract.payment_status !== 'INVESTOR_PAID'
      || ['COMPLETED', 'DEFAULTED', 'TERMINATED', 'LIQUIDATED'].includes(existingContract.contract_status)
    ) {
      return NextResponse.json(
        {
          error: 'รายการนี้ยังไม่พร้อมให้ยืนยันการรับเงิน',
          code: 'INVALID_PAYMENT_STATE',
        },
        { status: 409 },
      );
    }

    // Update contract status to CONFIRMED and set payment confirmation timestamp
    const { data: contract, error: updateError } = await supabase
      .from('contracts')
      .update({
        contract_status: 'CONFIRMED',
        payment_confirmed_at: new Date().toISOString(),
        payment_status: 'COMPLETED',
        updated_at: new Date().toISOString()
      })
      .eq('contract_id', contractId)
      .eq('payment_status', 'INVESTOR_PAID')
      .select(`
        contract_id,
        contract_number,
        contract_status,
        payment_confirmed_at,
        payment_status
      `)
      .maybeSingle();

    if (updateError || !contract) {
      console.error('[contract:confirm-payment] update failed');
      return NextResponse.json(
        { error: 'สถานะรายการถูกเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง', code: 'STATE_CONFLICT' },
        { status: 409 }
      );
    }

    // TODO: Send notification to investor that pawner has confirmed payment

    return NextResponse.json({
      success: true,
      message: 'ยืนยันการรับเงินเรียบร้อยแล้ว',
      contract: {
        contractId: contract.contract_id,
        contractNumber: contract.contract_number,
        status: contract.contract_status,
        paymentStatus: contract.payment_status,
        paymentConfirmedAt: contract.payment_confirmed_at,
      }
    });

  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[contract:confirm-payment] failed');
    return sanitizedServerError('ไม่สามารถยืนยันการรับเงินได้ชั่วคราว กรุณาลองใหม่');
  } finally {
    await releaseLock?.();
  }
}
