/**
 * The operator side of a refund owed to a pawner.
 *
 * There is no outbound payment rail in this system: a human logs into a bank
 * and sends the money. This route's job is to show what is outstanding and to
 * record the evidence that it was settled - it never moves money itself.
 *
 *   GET    the queue of outstanding obligations, oldest first
 *   POST   mark one settled, against an uploaded transfer slip
 *   PATCH  cancel one that was resolved off-platform, with a reason
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { logContractAction } from '@/lib/services/slip-verification';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import { LiffAuthError } from '@/lib/security/liff-auth';
import {
  liffAuthErrorResponse,
  requireAdminLiffIdentity,
  requireInternalRequest,
} from '@/lib/security/request-auth';
import {
  boundedText,
  readBoundedJsonObject,
  requireOwnedBlobUrl,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';
import {
  REFUND_SLA_BUSINESS_DAYS,
  SUPPORT_PHONE,
  formatRefundDestination,
} from '@/lib/services/action-refund';
import { lineRetryKeyFromMaterial, pushLineTextMessage } from '@/lib/line/push-text';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/**
 * Internal secret first so a cron or back-office script works headlessly, with
 * an admin LIFF identity as the interactive fallback - the same shape
 * /api/manual-estimate uses.
 */
async function requireAdminOrInternal(request: NextRequest): Promise<string | null> {
  try {
    requireInternalRequest(request, ['INTERNAL_API_SECRET']);
    return null;
  } catch {
    return await requireAdminLiffIdentity(request);
  }
}

const REFUND_COLUMNS = `
  request_id,
  contract_id,
  request_type,
  request_status,
  increase_amount,
  total_amount,
  interest_for_period,
  slip_url,
  investor_rejection_reason,
  investor_rejected_at,
  refund_status,
  refund_amount,
  refund_reason,
  refund_reference,
  refund_due_at,
  refund_bank_name,
  refund_bank_account_no,
  refund_bank_account_name,
  refund_slip_url,
  refund_paid_at,
  refund_paid_by,
  contract:contract_id (
    contract_number,
    customer_id,
    pawners:customer_id ( line_id, first_name, last_name, phone )
  )
`;

const relationOne = <T,>(value: T | T[] | null | undefined): T | null => (
  Array.isArray(value) ? value[0] || null : value || null
);

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrInternal(request);
    const supabase = supabaseAdmin();

    const statusParam = boundedText(
      request.nextUrl.searchParams.get('status'),
      16,
      true,
    ) || 'PENDING';
    const status = ['PENDING', 'PAID', 'CANCELLED'].includes(statusParam) ? statusParam : 'PENDING';

    const { data, error } = await supabase
      .from('contract_action_requests')
      .select(REFUND_COLUMNS)
      .eq('refund_status', status)
      .order('refund_due_at', { ascending: true })
      .limit(200);

    if (error) throw error;

    const refunds = (data || []).map((row: any) => {
      const contract = relationOne<any>(row.contract);
      const pawner = relationOne<any>(contract?.pawners);
      return {
        requestId: row.request_id,
        contractId: row.contract_id,
        contractNumber: contract?.contract_number || null,
        pawnerName: [pawner?.first_name, pawner?.last_name].filter(Boolean).join(' ') || null,
        pawnerPhone: pawner?.phone || null,
        reference: row.refund_reference,
        amount: Number(row.refund_amount || 0),
        reason: row.refund_reason,
        dueAt: row.refund_due_at,
        bankName: row.refund_bank_name,
        bankAccountNo: row.refund_bank_account_no,
        bankAccountName: row.refund_bank_account_name,
        rejectionReason: row.investor_rejection_reason,
        paidSlipUrl: row.slip_url,
        refundSlipUrl: row.refund_slip_url,
        refundPaidAt: row.refund_paid_at,
        refundPaidBy: row.refund_paid_by,
      };
    });

    return NextResponse.json(
      {
        status,
        count: refunds.length,
        totalAmount: refunds.reduce((sum, r) => sum + r.amount, 0),
        slaBusinessDays: REFUND_SLA_BUSINESS_DAYS,
        refunds,
      },
      { headers: NO_STORE },
    );
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    console.error('[contract-action:refund] queue read failed');
    return sanitizedServerError();
  }
}

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const operatorId = await requireAdminOrInternal(request);
    const body = await readBoundedJsonObject(request, 16 * 1024);
    const requestId = requireUuid(body.requestId);
    // The evidence must live on our own storage - an off-platform URL is not
    // proof of anything and cannot be audited later.
    const refundSlipUrl = requireOwnedBlobUrl(body.refundSlipUrl, ['refund-slips/', 'payment-slips/']);
    const note = boundedText(body.note, 500) || '';

    const supabase = supabaseAdmin();

    const { data: existing, error: readError } = await supabase
      .from('contract_action_requests')
      .select(REFUND_COLUMNS)
      .eq('request_id', requestId)
      .single();
    if (readError || !existing) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอ', code: 'REQUEST_NOT_FOUND' },
        { status: 404, headers: NO_STORE },
      );
    }

    // The same lock key every other contract-action route uses, so settling a
    // refund cannot interleave with a create or verify-slip on that contract.
    releaseLock = await acquireFinancialLock(`contract-action-contract:${(existing as any).contract_id}`);

    const { data: locked, error: lockedError } = await supabase
      .from('contract_action_requests')
      .select('refund_status, refund_amount, refund_reference')
      .eq('request_id', requestId)
      .single();
    if (lockedError || !locked) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอ', code: 'REQUEST_NOT_FOUND' },
        { status: 404, headers: NO_STORE },
      );
    }

    if (locked.refund_status === 'PAID') {
      return NextResponse.json(
        { success: true, alreadyPaid: true, reference: locked.refund_reference },
        { headers: NO_STORE },
      );
    }
    if (locked.refund_status !== 'PENDING') {
      return NextResponse.json(
        {
          error: locked.refund_status === 'CANCELLED'
            ? 'การคืนเงินนี้ถูกยกเลิกแล้ว'
            : 'คำขอนี้ไม่มีรายการคืนเงินค้างอยู่',
          code: 'REFUND_NOT_APPLICABLE',
        },
        { status: 409, headers: NO_STORE },
      );
    }

    const nowIso = new Date().toISOString();
    const { data: settled, error: settleError } = await supabase
      .from('contract_action_requests')
      .update({
        refund_status: 'PAID',
        refund_slip_url: refundSlipUrl,
        refund_paid_at: nowIso,
        refund_paid_by: operatorId || 'INTERNAL',
        updated_at: nowIso,
      })
      .eq('request_id', requestId)
      .eq('refund_status', 'PENDING')
      .select('request_id')
      .maybeSingle();
    if (settleError) throw settleError;
    if (!settled) {
      return NextResponse.json(
        { error: 'สถานะการคืนเงินถูกเปลี่ยนแล้ว กรุณารีเฟรช', code: 'REFUND_STATE_CONFLICT' },
        { status: 409, headers: NO_STORE },
      );
    }

    const refundAmount = Number(locked.refund_amount || 0);

    await logContractAction(
      (existing as any).contract_id,
      'REFUND_PAID',
      'COMPLETED',
      'ADMIN',
      operatorId,
      {
        actionRequestId: requestId,
        amount: refundAmount,
        slipUrl: refundSlipUrl,
        description: `คืนเงินผู้จำนำ ${refundAmount.toLocaleString()} บาท (${locked.refund_reference})`,
        metadata: { refundReference: locked.refund_reference, note },
      },
    ).catch(() => {});

    // A failed push must not undo a completed transfer.
    const contract = relationOne<any>((existing as any).contract);
    const pawner = relationOne<any>(contract?.pawners);
    const destination = formatRefundDestination({
      bankName: (existing as any).refund_bank_name,
      accountNo: (existing as any).refund_bank_account_no,
    });
    await pushLineTextMessage({
      to: pawner?.line_id,
      text: [
        'คืนเงินเรียบร้อยแล้ว',
        '',
        `จำนวน: ${refundAmount.toLocaleString()} บาท`,
        ...(destination ? [`โอนเข้าบัญชี: ${destination}`] : []),
        `วันที่โอน: ${new Date(nowIso).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        '',
        `หากยังไม่เห็นยอดเข้าบัญชี กรุณาติดต่อ ${SUPPORT_PHONE}`,
      ].join('\n'),
      retryKey: lineRetryKeyFromMaterial(`refund-paid:${requestId}`),
    }).catch(() => {
      console.error('[contract-action:refund] pawner notification delayed');
    });

    return NextResponse.json(
      { success: true, reference: locked.refund_reference, amount: refundAmount },
      { headers: NO_STORE },
    );
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[contract-action:refund] settle failed');
    return sanitizedServerError();
  } finally {
    await releaseLock?.();
  }
}

export async function PATCH(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const operatorId = await requireAdminOrInternal(request);
    const body = await readBoundedJsonObject(request, 16 * 1024);
    const requestId = requireUuid(body.requestId);
    const cancelReason = boundedText(body.reason, 500) || '';
    if (!cancelReason) {
      return NextResponse.json(
        { error: 'กรุณาระบุเหตุผลที่ยกเลิกการคืนเงิน', code: 'REFUND_CANCEL_REASON_REQUIRED' },
        { status: 400, headers: NO_STORE },
      );
    }

    const supabase = supabaseAdmin();
    const { data: existing, error: readError } = await supabase
      .from('contract_action_requests')
      .select('contract_id, refund_status, refund_amount, refund_reference')
      .eq('request_id', requestId)
      .single();
    if (readError || !existing) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอ', code: 'REQUEST_NOT_FOUND' },
        { status: 404, headers: NO_STORE },
      );
    }

    releaseLock = await acquireFinancialLock(`contract-action-contract:${existing.contract_id}`);

    const nowIso = new Date().toISOString();
    const { data: cancelled, error: cancelError } = await supabase
      .from('contract_action_requests')
      .update({
        refund_status: 'CANCELLED',
        refund_cancelled_at: nowIso,
        refund_cancel_reason: cancelReason,
        updated_at: nowIso,
      })
      .eq('request_id', requestId)
      .eq('refund_status', 'PENDING')
      .select('request_id')
      .maybeSingle();
    if (cancelError) throw cancelError;
    if (!cancelled) {
      return NextResponse.json(
        { error: 'ไม่มีรายการคืนเงินที่รอดำเนินการ', code: 'REFUND_NOT_APPLICABLE' },
        { status: 409, headers: NO_STORE },
      );
    }

    await logContractAction(
      existing.contract_id,
      'REFUND_CANCELLED',
      'COMPLETED',
      'ADMIN',
      operatorId,
      {
        actionRequestId: requestId,
        amount: Number(existing.refund_amount || 0),
        description: `ยกเลิกรายการคืนเงิน (${existing.refund_reference}): ${cancelReason}`,
        metadata: { refundReference: existing.refund_reference },
      },
    ).catch(() => {});

    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[contract-action:refund] cancel failed');
    return sanitizedServerError();
  } finally {
    await releaseLock?.();
  }
}
