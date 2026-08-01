import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifyPaymentSlip, saveSlipVerification, logContractAction } from '@/lib/services/slip-verification';
import { lineRetryKeyFromMaterial, pushLineTextMessage } from '@/lib/line/push-text';
import { requireContractParty } from '@/lib/security/contract-access';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  readBoundedJsonObject,
  requireOwnedBlobUrl,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const normalizeRelation = <T,>(value: T | T[] | null | undefined): T | null => (
  Array.isArray(value) ? value[0] || null : value || null
);

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request, 32 * 1024);
    const requestId = requireUuid(body.requestId);
    const slipUrl = requireOwnedBlobUrl(body.slipUrl, [
      'investor-slips/',
      'uploads/investor/',
    ]);

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
    const authenticatedLineId = await requireContractParty(request, contract, 'INVESTOR');
    releaseLock = await acquireFinancialLock(`contract-action-contract:${actionRequest.contract_id}`, 300);

    const { data: lockedActionState, error: lockedActionError } = await supabase
      .from('contract_action_requests')
      .select('request_status, investor_slip_attempt_count')
      .eq('request_id', requestId)
      .single();
    if (lockedActionError || !lockedActionState) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอ', code: 'REQUEST_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    actionRequest.request_status = lockedActionState.request_status;
    actionRequest.investor_slip_attempt_count = lockedActionState.investor_slip_attempt_count;

    // Check if request is still active and available
    const validStatuses = ['AWAITING_INVESTOR_APPROVAL', 'INVESTOR_APPROVED', 'AWAITING_INVESTOR_PAYMENT', 'INVESTOR_SLIP_REJECTED', 'PENDING_INVESTOR_APPROVAL'];
    if (!validStatuses.includes(actionRequest.request_status)) {
      if (actionRequest.request_status === 'INVESTOR_TRANSFERRED' || actionRequest.request_status === 'COMPLETED') {
        return NextResponse.json(
          {
            success: true,
            message: 'คำขอนี้ได้รับการดำเนินการแล้ว',
            alreadyProcessed: true,
          },
          { status: 200 }
        );
      }
      if (actionRequest.request_status === 'INVESTOR_SLIP_REJECTED_FINAL' || actionRequest.request_status === 'VOIDED') {
        return NextResponse.json(
          { error: 'คำขอนี้ถูกยกเลิกแล้ว กรุณาติดต่อฝ่าย Support โทร 0626092941' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'คำขอนี้ไม่สามารถดำเนินการได้ สถานะไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    // Check attempt count (investor side)
    const attemptCount = (actionRequest.investor_slip_attempt_count || 0) + 1;

    if (attemptCount > 2) {
      return NextResponse.json(
        { error: 'เกินจำนวนครั้งที่อนุญาต กรุณาติดต่อฝ่าย Support ที่เบอร์ 062-6092941' },
        { status: 400 }
      );
    }

    const pawner = normalizeRelation<any>(contract?.pawners);

    // Verify slip before applying the principal increase
    const expectedAmount = actionRequest.increase_amount;
    const verificationResult = await verifyPaymentSlip(slipUrl, expectedAmount, {
      receiverAccountNo: actionRequest.pawner_bank_account_no || pawner?.bank_account_no || null,
      receiverPromptpay: pawner?.promptpay_number || null,
      receiverName: actionRequest.pawner_bank_account_name || pawner?.bank_account_name || null,
      useSlipOkLogCheck: false,
    });

    // Save verification result
    await saveSlipVerification(
      requestId,
      null,
      slipUrl,
      expectedAmount,
      verificationResult,
      attemptCount
    );

    // Update action request
    const updateData: any = {
      investor_slip_url: slipUrl,
      investor_slip_uploaded_at: new Date().toISOString(),
      investor_slip_amount_detected: verificationResult.detectedAmount,
      investor_slip_verification_result: verificationResult.result,
      investor_slip_verification_details: verificationResult.rawResponse,
      investor_slip_attempt_count: attemptCount,
    };

    // Handle verification result
    if (verificationResult.result === 'MATCHED') {
      const now = new Date();
      // Verification proves the investor transfer, but it does not prove that
      // the seller received the funds. Keep the old contract active until the
      // seller confirms receipt in /confirm-received.
      updateData.request_status = 'INVESTOR_TRANSFERRED';
      updateData.updated_at = now.toISOString();

      const { data: transitionedRequests, error: transitionError } = await supabase
        .from('contract_action_requests')
        .update(updateData)
        .eq('request_id', requestId)
        .in('request_status', validStatuses)
        .select('request_id');
      if (transitionError) throw transitionError;
      if (!transitionedRequests?.length) {
        return NextResponse.json(
          { error: 'สถานะคำขอมีการเปลี่ยนแปลง กรุณาตรวจสอบใหม่', code: 'ACTION_STATE_CONFLICT' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        );
      }

      await logContractAction(
        actionRequest.contract_id,
        'SLIP_VERIFIED',
        'INVESTOR_TRANSFERRED',
        'INVESTOR',
        authenticatedLineId,
        {
          actionRequestId: requestId,
          slipUrl,
          slipAmountDetected: verificationResult.detectedAmount,
          description: `Investor slip verified. Detected: ${verificationResult.detectedAmount}, Expected: ${expectedAmount}`,
        }
      ).catch(() => {});

      if (pawner?.line_id) {
        const bankName = actionRequest.pawner_bank_name || pawner.bank_name || '';
        const bankAccountNo = actionRequest.pawner_bank_account_no || pawner.bank_account_no || '';
        const bankAccountName = actionRequest.pawner_bank_account_name || pawner.bank_account_name || '';
        const increaseAmount = Number(actionRequest.increase_amount || 0);
        const requestTime = actionRequest.created_at ? new Date(actionRequest.created_at) : now;
        const requestTimeText = requestTime.toLocaleString('th-TH');

        const messageLines = [
          `คำขอเพิ่มเงินต้นเมื่อ ${requestTimeText} ได้รับการอนุมัติแล้ว`,
          `นักลงทุนโอนเงิน ${increaseAmount.toLocaleString()} บาท ไปที่บัญชี ${bankName} ${bankAccountNo} ${bankAccountName} ของคุณแล้ว`,
          `กรุณาตรวจสอบยอดเงินจริง แล้วเข้าเมนู Transactions เพื่อยืนยันการรับเงิน สัญญาเดิม ${contract.contract_number} จะยังไม่ถูกปิดจนกว่าจะยืนยัน`,
        ];
        await pushLineTextMessage({
          channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
          to: pawner.line_id,
          text: messageLines.join('\n\n'),
          retryKey: lineRetryKeyFromMaterial(`principal-increase:transferred:${requestId}`),
        }).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        result: verificationResult.result,
        status: 'INVESTOR_TRANSFERRED',
        message: 'ตรวจสอบสลิปสำเร็จ รอผู้ขายยืนยันการรับเงิน',
        detectedAmount: verificationResult.detectedAmount,
      });

    } else if (verificationResult.result === 'UNDERPAID') {
      // Underpaid
      if (attemptCount >= 2) {
        // Second attempt failed - void the request
        updateData.request_status = 'INVESTOR_SLIP_REJECTED_FINAL';
        updateData.voided_at = new Date().toISOString();
        updateData.void_reason = 'นักลงทุนโอนเงินไม่ครบจำนวน 2 ครั้ง';

        await supabase
          .from('contract_action_requests')
          .update(updateData)
          .eq('request_id', requestId);

        return NextResponse.json({
          success: false,
          result: 'VOIDED',
          message: 'การดำเนินการเป็นโมฆะเนื่องจากโอนเงินไม่ครบจำนวน 2 ครั้ง',
          supportPhone: '0626092941',
        });
      }

      // First attempt failed - allow retry
      updateData.request_status = 'INVESTOR_SLIP_REJECTED';

      await supabase
        .from('contract_action_requests')
        .update(updateData)
        .eq('request_id', requestId);

      return NextResponse.json({
        success: false,
        result: 'UNDERPAID',
        message: `ยอดโอนเงินไม่ตรงกับยอดที่ต้องโอน\n\nกรุณาโอนใหม่เต็มจำนวน ${expectedAmount.toLocaleString()} บาท\n\nหากมีปัญหา กรุณาติดต่อฝ่าย Support โทร 0626092941`,
        detectedAmount: verificationResult.detectedAmount,
        expectedAmount,
        attemptCount,
        remainingAttempts: 2 - attemptCount,
        supportPhone: '0626092941',
      });

    } else {
      // Unreadable or Invalid
      if (attemptCount >= 2) {
        updateData.request_status = 'INVESTOR_SLIP_REJECTED_FINAL';
        updateData.voided_at = new Date().toISOString();
        updateData.void_reason = 'ไม่สามารถอ่านสลิปได้ 2 ครั้ง';

        await supabase
          .from('contract_action_requests')
          .update(updateData)
          .eq('request_id', requestId);

        return NextResponse.json({
          success: false,
          result: 'VOIDED',
          message: 'การดำเนินการเป็นโมฆะเนื่องจากไม่สามารถตรวจสอบสลิปได้',
          supportPhone: '0626092941',
        });
      }

      updateData.request_status = 'INVESTOR_SLIP_REJECTED';

      await supabase
        .from('contract_action_requests')
        .update(updateData)
        .eq('request_id', requestId);

      return NextResponse.json({
        success: false,
        result: verificationResult.result,
        message: verificationResult.message,
        attemptCount,
        remainingAttempts: 2 - attemptCount,
      });
    }

  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[contract-action:investor-verify-slip] failed');
    return sanitizedServerError('ไม่สามารถตรวจสอบสลิปได้ชั่วคราว กรุณาลองใหม่');
  } finally {
    await releaseLock?.();
  }
}
