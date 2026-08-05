import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { logContractAction } from '@/lib/services/slip-verification';
import { Client } from '@line/bot-sdk';
import { requireContractParty } from '@/lib/security/contract-access';
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

const getPawnerLineClient = () => {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) return null;

  return new Client({
    channelAccessToken,
    channelSecret: process.env.LINE_CHANNEL_SECRET || ''
  });
};

const normalizeRelation = <T,>(value: T | T[] | null | undefined): T | null => (
  Array.isArray(value) ? value[0] || null : value || null
);

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

    const { data: lockedActionState, error: lockedActionError } = await supabase
      .from('contract_action_requests')
      .select('request_status')
      .eq('request_id', requestId)
      .single();
    if (lockedActionError || !lockedActionState) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอ', code: 'REQUEST_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    actionRequest.request_status = lockedActionState.request_status;

    if (action === 'REJECT') {
      if (actionRequest.request_status === 'INVESTOR_REJECTED') {
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

      // A verified payment sitting against a rejected request is an unresolved
      // obligation, not a closed matter. Record it on the request and in the
      // action log so it is discoverable, rather than leaving the money with no
      // trace of why it is here.
      const paidInterestAmount = ['SLIP_VERIFIED', 'PENDING_INVESTOR_APPROVAL', 'AWAITING_INVESTOR_APPROVAL']
        .includes(actionRequest.request_status)
        ? Number(actionRequest.interest_to_pay || 0)
        : 0;

      // Update request status
      const { data: updatedRequest, error: updateError } = await supabase
        .from('contract_action_requests')
        .update({
          request_status: 'INVESTOR_REJECTED',
          investor_rejection_reason: normalizedReason,
          investor_rejected_at: new Date().toISOString(),
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

      // Log rejection
      await logContractAction(
        actionRequest.contract_id,
        'INVESTOR_REJECTED',
        'COMPLETED',
        'INVESTOR',
        authenticatedLineId,
        {
          actionRequestId: requestId,
          rejectionReason: normalizedReason,
          // Surfaces the unresolved obligation in the audit trail so a rejected
          // request that already took money is findable by finance.
          ...(paidInterestAmount > 0
            ? { description: `ผู้จำนำชำระแล้ว ${paidInterestAmount} บาท ก่อนถูกปฏิเสธ - รอดำเนินการคืนเงินหรือปรับปรุงสัญญา` }
            : {}),
          description: `Investor rejected principal increase request. Reason: ${normalizedReason}`,
          metadata: {
            actionType: 'PRINCIPAL_INCREASE',
          },
        }
      );

      // Notify pawner
      if (pawner?.line_id) {
        try {
          const pawnerLineClient = getPawnerLineClient();
          if (!pawnerLineClient) {
            throw new Error('Seller LINE OA is not configured');
          }

          await pawnerLineClient.pushMessage(pawner.line_id, {
            type: 'text',
            // The pawner has usually ALREADY paid the accrued interest by this
            // point - that is what moves the request to PENDING_INVESTOR_APPROVAL.
            // Saying only "rejected" left them with money gone and no idea what
            // became of it, so the message names the payment explicitly.
            text: [
              'คำขอเพิ่มเงินต้นถูกปฏิเสธ',
              '',
              `จำนวนที่ขอ: ${actionRequest.increase_amount?.toLocaleString()} บาท`,
              `เหตุผล: ${normalizedReason}`,
              ...(paidInterestAmount > 0
                ? [
                  '',
                  `เงินที่คุณชำระไว้แล้ว ${paidInterestAmount.toLocaleString()} บาท ยังอยู่ในระบบและไม่ได้สูญหาย`,
                  'เจ้าหน้าที่จะติดต่อกลับเพื่อดำเนินการต่อ',
                ]
                : []),
              '',
              'หากมีข้อสงสัย กรุณาติดต่อฝ่ายสนับสนุน',
            ].join('\n')
          });
        } catch {
          console.error('[contract-action:investor-response] seller notification delayed');
        }
      }

      return NextResponse.json({
        success: true,
        message: 'ปฏิเสธคำขอเรียบร้อยแล้ว',
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
