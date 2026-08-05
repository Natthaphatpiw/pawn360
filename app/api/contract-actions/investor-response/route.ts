import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { logContractAction } from '@/lib/services/slip-verification';
import { requireContractParty } from '@/lib/security/contract-access';
import { lineRetryKeyFromMaterial, pushLineTextMessage } from '@/lib/line/push-text';
import { sendAdminMessage } from '@/lib/line/admin-client';
import {
  REFUND_REJECTED_INCREASE_REASON,
  REFUND_SLA_BUSINESS_DAYS,
  SUPPORT_PHONE,
  buildRefundReference,
  collectedAmountFor,
  formatRefundDestination,
  wasPaidByPawner,
} from '@/lib/services/action-refund';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  boundedText,
  readBoundedJsonObject,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const normalizeRelation = <T,>(value: T | T[] | null | undefined): T | null => (
  Array.isArray(value) ? value[0] || null : value || null
);

/**
 * The refund destination, frozen onto the request at rejection time so a later
 * edit to the pawners row cannot redirect money that is already owed. The
 * request already carries the account the investor would have paid the increase
 * into; the pawner profile is the fallback for older rows.
 */
const resolveRefundDestination = (actionRequest: any, pawner: any) => ({
  refund_bank_name: actionRequest.pawner_bank_name || pawner?.bank_name || null,
  refund_bank_account_no: actionRequest.pawner_bank_account_no || pawner?.bank_account_no || null,
  refund_bank_account_name:
    actionRequest.pawner_bank_account_name || pawner?.bank_account_name || null,
});

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request, 16 * 1024);
    const requestId = requireUuid(body.requestId);
    const action = boundedText(body.action, 16, true) || '';
    const normalizedReason = boundedText(body.reason, 500) || '';

    if (action !== 'REJECT') {
      return NextResponse.json(
        { error: 'รายการไม่ถูกต้อง', code: 'INVALID_ACTION' },
        { status: 400 }
      );
    }

    if (!normalizedReason) {
      return NextResponse.json(
        { error: 'กรุณาระบุเหตุผลที่ปฏิเสธคำขอ' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get action request
    const { data: actionRequest, error: requestError } = await supabase
      .from('contract_action_requests')
      .select(`
        *,
        contract:contract_id (
          *,
          items:item_id (*),
          pawners:customer_id (*),
          investors:investor_id (*)
        )
      `)
      .eq('request_id', requestId)
      .single();

    if (requestError || !actionRequest) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอ', code: 'REQUEST_NOT_FOUND' },
        { status: 404 }
      );
    }

    const contract = actionRequest.contract;
    const pawner = normalizeRelation<any>(contract?.pawners);
    const authenticatedLineId = await requireContractParty(request, contract, 'INVESTOR');
    releaseLock = await acquireFinancialLock(`contract-action-contract:${actionRequest.contract_id}`);

    // Re-read the payment evidence under the lock too: a slip verifying
    // concurrently must not be missed when deciding whether money is owed back.
    const { data: lockedActionState, error: lockedActionError } = await supabase
      .from('contract_action_requests')
      .select('request_status, slip_verification_result, slip_url, total_amount, interest_for_period, refund_status')
      .eq('request_id', requestId)
      .single();
    if (lockedActionError || !lockedActionState) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอ', code: 'REQUEST_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    actionRequest.request_status = lockedActionState.request_status;
    Object.assign(actionRequest, {
      slip_verification_result: lockedActionState.slip_verification_result,
      slip_url: lockedActionState.slip_url,
      total_amount: lockedActionState.total_amount,
      interest_for_period: lockedActionState.interest_for_period,
    });

    // PENDING_INVESTOR_APPROVAL is reachable only from verify-slip on a MATCHED
    // slip, so a rejection is nearly always a rejection of money already taken.
    const collectedAmount = collectedAmountFor(actionRequest);
    const refundOwed = wasPaidByPawner(actionRequest);
    const refundReference = buildRefundReference(requestId);
    const refundDestination = resolveRefundDestination(actionRequest, pawner);
    const refundDestinationLabel = formatRefundDestination({
      bankName: refundDestination.refund_bank_name,
      accountNo: refundDestination.refund_bank_account_no,
    });

    if (action === 'REJECT') {
      if (actionRequest.request_status === 'INVESTOR_REJECTED') {
        // A row rejected before refunds existed still owes the money. Record
        // the obligation now; the null guard makes the retry a no-op.
        if (refundOwed && lockedActionState.refund_status == null) {
          await supabase
            .from('contract_action_requests')
            .update({
              refund_status: 'PENDING',
              refund_amount: collectedAmount,
              refund_reason: REFUND_REJECTED_INCREASE_REASON,
              refund_reference: refundReference,
              refund_due_at: new Date().toISOString(),
              ...refundDestination,
              updated_at: new Date().toISOString(),
            })
            .eq('request_id', requestId)
            .eq('request_status', 'INVESTOR_REJECTED')
            .is('refund_status', null);
        }
        return NextResponse.json({
          success: true,
          alreadyProcessed: true,
          message: 'คำขอนี้ถูกปฏิเสธเรียบร้อยแล้ว',
        });
      }
      if (!['PENDING_INVESTOR_APPROVAL', 'AWAITING_INVESTOR_APPROVAL'].includes(actionRequest.request_status)) {
        return NextResponse.json(
          { error: 'คำขอนี้ไม่ได้อยู่ในสถานะที่สามารถปฏิเสธได้' },
          { status: 409 }
        );
      }

      // The obligation is written in the SAME guarded update as the rejection,
      // so a rejection can never land without the refund that must follow it.
      // refund_status is deliberately not a request_status value: the request
      // really is finished and rejected, and putting a refund-pending request
      // into ACTIVE_REQUEST_STATUSES would lock the pawner out of every other
      // contract action until a human finished a bank transfer.
      const { data: updatedRequest, error: updateError } = await supabase
        .from('contract_action_requests')
        .update({
          request_status: 'INVESTOR_REJECTED',
          investor_rejection_reason: normalizedReason,
          investor_rejected_at: new Date().toISOString(),
          refund_status: refundOwed ? 'PENDING' : 'NOT_REQUIRED',
          refund_amount: refundOwed ? collectedAmount : null,
          refund_reason: refundOwed ? REFUND_REJECTED_INCREASE_REASON : null,
          refund_reference: refundOwed ? refundReference : null,
          refund_due_at: refundOwed ? new Date().toISOString() : null,
          ...(refundOwed ? refundDestination : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('request_id', requestId)
        .in('request_status', ['PENDING_INVESTOR_APPROVAL', 'AWAITING_INVESTOR_APPROVAL'])
        .select('request_id')
        .maybeSingle();

      if (updateError) {
        throw updateError;
      }
      if (!updatedRequest) {
        return NextResponse.json(
          { error: 'สถานะคำขอถูกเปลี่ยนแล้ว กรุณารีเฟรชหน้า', code: 'STATE_CONFLICT' },
          { status: 409 }
        );
      }

      // The penalty portion of this payment marked a penalty_payments row
      // VERIFIED with paid_through_date = today. Refunding it means the pawner
      // did not pay it after all, so the ledger must not keep saying they did.
      // A failure here is a one-day leak; a missing refund record is a lost
      // liability, so this never aborts the rejection.
      if (refundOwed && actionRequest.slip_url) {
        const { error: penaltyReversalError } = await supabase
          .from('penalty_payments')
          .update({
            status: 'CANCELLED',
            paid_through_date: null,
            updated_at: new Date().toISOString(),
          })
          .eq('contract_id', actionRequest.contract_id)
          .eq('slip_url', actionRequest.slip_url)
          .eq('status', 'VERIFIED');
        if (penaltyReversalError) {
          console.error('[contract-action:investor-response] penalty reversal failed');
        }
      }

      await logContractAction(
        actionRequest.contract_id,
        'INVESTOR_REJECTED',
        'COMPLETED',
        'INVESTOR',
        authenticatedLineId,
        {
          actionRequestId: requestId,
          rejectionReason: normalizedReason,
          description: `Investor rejected principal increase request. Reason: ${normalizedReason}`,
          metadata: { actionType: 'PRINCIPAL_INCREASE' },
        }
      );

      // A separate log line, because the refund is a separate obligation with
      // its own lifecycle - finance closes it, not the investor.
      if (refundOwed) {
        await logContractAction(
          actionRequest.contract_id,
          'REFUND_DUE',
          'PENDING',
          'SYSTEM',
          null,
          {
            actionRequestId: requestId,
            amount: collectedAmount,
            description: `ต้องคืนเงินผู้จำนำ ${collectedAmount.toLocaleString()} บาท (${refundReference})`,
            metadata: {
              actionType: 'PRINCIPAL_INCREASE',
              refundReference,
              slipUrl: actionRequest.slip_url,
              missingBankDetails: !refundDestination.refund_bank_account_no,
            },
          },
        ).catch(() => {});
      }

      // The pawner has already paid by this point - that payment is what moved
      // the request to PENDING_INVESTOR_APPROVAL. Saying only "rejected" left
      // them with the money gone and no idea what became of it, so the amount,
      // the destination, who is sending it and by when are all named. The
      // wording credits a person, because a person is what moves the money.
      await pushLineTextMessage({
        to: pawner?.line_id,
        text: [
          'คำขอเพิ่มเงินต้นถูกปฏิเสธ',
          '',
          `จำนวนที่ขอ: ${Number(actionRequest.increase_amount || 0).toLocaleString()} บาท`,
          `เหตุผล: ${normalizedReason}`,
          ...(refundOwed
            ? [
              '',
              `บริษัทจะคืนเงินที่คุณชำระไว้ ${collectedAmount.toLocaleString()} บาท เต็มจำนวน`,
              ...(refundDestinationLabel ? [`โอนเข้าบัญชี: ${refundDestinationLabel}`] : []),
              `เจ้าหน้าที่จะดำเนินการโอนคืนภายใน ${REFUND_SLA_BUSINESS_DAYS} วันทำการ`,
              'ดูสถานะการคืนเงินได้ที่หน้าคำขอ',
            ]
            : []),
          '',
          `สอบถามเพิ่มเติม โทร ${SUPPORT_PHONE}`,
        ].join('\n'),
        retryKey: lineRetryKeyFromMaterial(`refund-due:${requestId}`),
      }).catch(() => {
        console.error('[contract-action:investor-response] seller notification delayed');
      });

      // Without this the obligation is recorded in a table and never becomes
      // anyone's task.
      if (refundOwed) {
        await sendAdminMessage({
          type: 'text',
          text: [
            'ต้องคืนเงินผู้จำนำ (นักลงทุนปฏิเสธคำขอเพิ่มเงินต้น)',
            '',
            `สัญญา: ${contract?.contract_number || actionRequest.contract_id}`,
            `อ้างอิง: ${refundReference}`,
            `จำนวน: ${collectedAmount.toLocaleString()} บาท`,
            refundDestinationLabel
              ? `โอนเข้าบัญชี: ${refundDestinationLabel}`
              : 'ยังไม่มีบัญชีปลายทาง - ต้องติดต่อผู้จำนำ',
            ...(refundDestination.refund_bank_account_name
              ? [`ชื่อบัญชี: ${refundDestination.refund_bank_account_name}`]
              : []),
            '',
            `กำหนด: ภายใน ${REFUND_SLA_BUSINESS_DAYS} วันทำการ`,
          ].join('\n'),
        }).catch(() => {
          console.error('[contract-action:investor-response] admin refund alert delayed');
        });
      }

      return NextResponse.json({
        success: true,
        message: 'ปฏิเสธคำขอเรียบร้อยแล้ว',
        refund: refundOwed
          ? { status: 'PENDING', amount: collectedAmount, reference: refundReference }
          : { status: 'NOT_REQUIRED' },
      });
    }

    return NextResponse.json(
      { error: 'รายการไม่ถูกต้อง', code: 'INVALID_ACTION' },
      { status: 400 }
    );

  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[contract-action:investor-response] failed');
    return sanitizedServerError();
  } finally {
    await releaseLock?.();
  }
}
