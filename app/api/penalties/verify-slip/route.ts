import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { getCompanyBankAccount, verifyPaymentSlip } from '@/lib/services/slip-verification';
import { toDateString } from '@/lib/services/penalty';
import { Client } from '@line/bot-sdk';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import { acquireTransactionLock, transactionLockErrorResponse } from '@/lib/security/transaction-lock';
import { paymentEvidenceWasUsed } from '@/lib/security/payment-evidence';
import {
  boundedText,
  fingerprintOwnedBlob,
  readBoundedJsonObject,
  requireOwnedBlobUrl,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
});

async function persistPenaltyUpdate(
  supabase: ReturnType<typeof supabaseAdmin>,
  penaltyId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('penalty_payments')
    .update(payload)
    .eq('penalty_id', penaltyId)
    .in('status', ['PENDING', 'SLIP_UPLOADED', 'REJECTED'])
    .select('penalty_id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  let releaseEvidenceLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request) as any;
    const penaltyId = requireUuid(body?.penaltyId);
    const slipUrl = requireOwnedBlobUrl(body?.slipUrl, ['pawn-items/', 'penalty-slips/']);
    const pawnerLineId = boundedText(body?.pawnerLineId, 128, true) || '';
    const verifiedLineId = await requireLiffOwner(request, 'PAWNER', pawnerLineId);

    releaseLock = await acquireTransactionLock('penalty-verify', penaltyId, 300);

    const supabase = supabaseAdmin();
    const { data: payment, error: paymentError } = await supabase
      .from('penalty_payments')
      .select(`
        *,
        contract:contract_id (
          contract_id,
          contract_number,
          customer_id,
          investor_id,
          pawners:customer_id (
            line_id
          ),
          investors:investor_id (
            line_id
          )
        )
      `)
      .eq('penalty_id', penaltyId)
      .single();

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: 'Penalty payment not found' },
        { status: 404 }
      );
    }

    const contract = payment.contract;
    const pawner = Array.isArray(contract?.pawners) ? contract.pawners[0] : contract?.pawners;
    const investor = Array.isArray(contract?.investors) ? contract.investors[0] : contract?.investors;

    if (!pawner?.line_id || pawner.line_id !== verifiedLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    if (payment.status === 'VERIFIED') {
      return NextResponse.json({
        success: true,
        alreadyVerified: true,
        message: 'Penalty already verified',
      });
    }

    const slipFingerprint = `sha256:${await fingerprintOwnedBlob(slipUrl)}`;
    releaseEvidenceLock = await acquireTransactionLock('payment-evidence', slipFingerprint.slice(7), 300);

    if (await paymentEvidenceWasUsed(supabase, slipFingerprint)) {
      return NextResponse.json(
        { error: 'สลิปนี้ถูกใช้แล้ว กรุณาใช้สลิปใหม่' },
        { status: 409 },
      );
    }

    if (!['PENDING', 'SLIP_UPLOADED', 'REJECTED'].includes(payment.status)) {
      return NextResponse.json(
        { error: 'Penalty payment is no longer valid' },
        { status: 400 }
      );
    }

    const attemptCount = (payment.slip_attempt_count || 0) + 1;
    if (attemptCount > 2) {
      const updated = await persistPenaltyUpdate(supabase, penaltyId, {
        status: 'REJECTED_FINAL',
        updated_at: new Date().toISOString(),
      });
      if (!updated) {
        return NextResponse.json(
          { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: 'เกินจำนวนครั้งที่อนุญาต กรุณาติดต่อฝ่าย Support' },
        { status: 400 }
      );
    }

    const expectedAmount = Number(payment.penalty_amount || 0);
    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
      return NextResponse.json(
        { error: 'ไม่สามารถตรวจสอบยอดค่าปรับได้ กรุณาติดต่อฝ่ายสนับสนุน' },
        { status: 409 },
      );
    }
    const companyBank = await getCompanyBankAccount();
    const verificationResult = await verifyPaymentSlip(slipUrl, expectedAmount, {
      receiverAccountNo: companyBank.account_number || companyBank.bank_account_no || null,
      receiverPromptpay: companyBank.promptpay_number || null,
      receiverName: companyBank.account_name || companyBank.bank_account_name || null,
      useSlipOkLogCheck: true,
    });

    const updateData: any = {
      slip_url: slipUrl,
      slip_uploaded_at: new Date().toISOString(),
      slip_amount_detected: verificationResult.detectedAmount,
      slip_verification_result: verificationResult.result,
      slip_verification_details: {
        provider: verificationResult.rawResponse?.provider || null,
        fingerprint: slipFingerprint,
      },
      slip_attempt_count: attemptCount,
      updated_at: new Date().toISOString(),
    };

    if (verificationResult.result === 'MATCHED') {
      updateData.status = 'VERIFIED';
      updateData.verified_at = new Date().toISOString();
      updateData.paid_through_date = toDateString(new Date());

      const updated = await persistPenaltyUpdate(supabase, penaltyId, updateData);
      if (!updated) {
        return NextResponse.json(
          { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
          { status: 409 },
        );
      }

      if (investor?.line_id) {
        try {
          await investorLineClient.pushMessage(investor.line_id, {
            type: 'text',
            text: `ผู้ขอสินเชื่อได้ชำระค่าปรับแล้ว\nสัญญาเลขที่ ${contract?.contract_number || ''}`.trim(),
          });
        } catch {
          console.error('Error sending penalty notification to investor');
        }
      }

      return NextResponse.json({
        success: true,
        result: verificationResult.result,
        message: 'ตรวจสอบสลิปค่าปรับสำเร็จ',
        detectedAmount: verificationResult.detectedAmount,
      });
    }

    if (verificationResult.result === 'UNDERPAID') {
      if (attemptCount >= 2) {
        updateData.status = 'REJECTED_FINAL';
      } else {
        updateData.status = 'REJECTED';
      }

      const updated = await persistPenaltyUpdate(supabase, penaltyId, updateData);
      if (!updated) {
        return NextResponse.json(
          { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
          { status: 409 },
        );
      }

      if (attemptCount >= 2) {
        return NextResponse.json({
          success: false,
          result: 'VOIDED',
          message: 'การดำเนินการเป็นโมฆะเนื่องจากโอนเงินไม่ครบจำนวน 2 ครั้ง',
          supportPhone: '0626092941',
        });
      }

      return NextResponse.json({
        success: false,
        result: 'UNDERPAID',
        message: `ยอดเงินที่โอนขาดไป ${Math.abs(verificationResult.difference || 0).toLocaleString()} บาท`,
        detectedAmount: verificationResult.detectedAmount,
        expectedAmount,
        attemptCount,
        remainingAttempts: 2 - attemptCount,
        supportPhone: '0626092941',
      });
    }

    if (attemptCount >= 2) {
      updateData.status = 'REJECTED_FINAL';

      const updated = await persistPenaltyUpdate(supabase, penaltyId, updateData);
      if (!updated) {
        return NextResponse.json(
          { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
          { status: 409 },
        );
      }

      return NextResponse.json({
        success: false,
        result: 'VOIDED',
        message: 'การดำเนินการเป็นโมฆะเนื่องจากไม่สามารถตรวจสอบสลิปได้',
        supportPhone: '0626092941',
      });
    }

    updateData.status = 'REJECTED';
    const updated = await persistPenaltyUpdate(supabase, penaltyId, updateData);
    if (!updated) {
      return NextResponse.json(
        { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: false,
      result: verificationResult.result,
      message: verificationResult.message,
      attemptCount,
      remainingAttempts: 2 - attemptCount,
    });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error verifying penalty slip');
    return sanitizedServerError('ไม่สามารถตรวจสอบสลิปได้ กรุณาลองใหม่');
  } finally {
    if (releaseLock) await releaseLock();
    if (releaseEvidenceLock) await releaseEvidenceLock();
  }
}
