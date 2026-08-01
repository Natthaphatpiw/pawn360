import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifyPaymentSlip } from '@/lib/services/slip-verification';
import { Client, FlexMessage } from '@line/bot-sdk';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import { acquireTransactionLock, transactionLockErrorResponse } from '@/lib/security/transaction-lock';
import { paymentEvidenceWasUsed } from '@/lib/security/payment-evidence';
import {
  boundedText,
  fingerprintOwnedBlob,
  finiteNumber,
  readBoundedJsonObject,
  requireOwnedBlobUrl,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

// Pawner LINE OA client
const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  let releaseSlipLock: (() => Promise<void>) | null = null;
  let paymentReservation: {
    supabase: ReturnType<typeof supabaseAdmin>;
    contractId: string;
    investorId: string;
    previousStatus: string | null;
  } | null = null;

  try {
    const body = await readBoundedJsonObject(request) as any;
    const { contractId, investorLineId, amount, paymentSlipUrl } = body;

    const safeContractId = requireUuid(contractId);
    const claimedLineId = boundedText(investorLineId, 128, true) || '';
    const verifiedLineId = await requireLiffOwner(request, 'INVESTOR', claimedLineId);
    const submittedAmount = finiteNumber(amount, { min: 1, max: 100_000_000, required: true }) || 0;
    const safeSlipUrl = requireOwnedBlobUrl(paymentSlipUrl, ['investor-slips/']);
    releaseLock = await acquireTransactionLock('investor-payment', safeContractId, 300);

    const supabase = supabaseAdmin();

    // Get investor by LINE ID
    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('investor_id, firstname, lastname')
      .eq('line_id', verifiedLineId)
      .single();

    if (investorError || !investor) {
      return NextResponse.json(
        { error: 'Investor not found' },
        { status: 404 }
      );
    }

    // Get contract with related data
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        contract_status,
        funding_status,
        payment_status,
        payment_confirmed_at,
        updated_at,
        loan_principal_amount,
        items:item_id (brand, model),
        pawners:customer_id (line_id, firstname, lastname, bank_account_no, bank_account_name, promptpay_number)
      `)
      .eq('contract_id', safeContractId)
      .eq('investor_id', investor.investor_id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found or not owned by this investor' },
        { status: 404 }
      );
    }

    const isConfirmed = contract.contract_status === 'CONFIRMED' || Boolean(contract.payment_confirmed_at);
    if (['INVESTOR_PAID', 'COMPLETED'].includes(contract.payment_status) || isConfirmed) {
      return NextResponse.json({
        success: true,
        alreadySubmitted: true,
        message: 'Payment already submitted for this contract',
      });
    }
    const contractUpdatedAt = Date.parse(contract.updated_at || '');
    const processingIsStale = contract.payment_status === 'PROCESSING'
      && (
        !Number.isFinite(contractUpdatedAt)
        || Date.now() - contractUpdatedAt > 10 * 60 * 1_000
      );

    if (contract.funding_status && !['PENDING', 'FUNDED'].includes(contract.funding_status)) {
      return NextResponse.json(
        { error: 'Contract is not eligible for payment submission' },
        { status: 409 }
      );
    }

    const pawner = Array.isArray(contract.pawners) ? contract.pawners[0] : contract.pawners;
    const normalizedContract = { ...contract, pawners: pawner };

    const expectedAmount = Number(contract.loan_principal_amount || 0);

    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
      return NextResponse.json(
        { error: 'ไม่สามารถตรวจสอบยอดที่ต้องชำระได้ กรุณาติดต่อฝ่ายสนับสนุน' },
        { status: 409 }
      );
    }

    if (Math.round(submittedAmount * 100) !== Math.round(expectedAmount * 100)) {
      return NextResponse.json(
        {
          error: `ยอดเงินต้องเท่ากับวงเงินสินเชื่อ ${expectedAmount.toLocaleString()} บาท`,
          expectedAmount,
        },
        { status: 400 }
      );
    }

    const { data: existingPayments, error: existingPaymentsError } = await supabase
      .from('payments')
      .select('payment_id, payment_status, transaction_ref, payment_slip_url')
      .eq('contract_id', safeContractId)
      .eq('payment_type', 'PRINCIPAL')
      .in('payment_status', ['PENDING', 'PROCESSING', 'COMPLETED'])
      .limit(1);

    if (existingPaymentsError) {
      console.error('Error checking existing payments');
      return NextResponse.json(
        { error: 'Failed to verify payment status' },
        { status: 500 }
      );
    }

    const existingPayment = existingPayments?.[0];
    if (existingPayment) {
      let repairQuery = supabase
        .from('contracts')
        .update({
          payment_status: 'INVESTOR_PAID',
          payment_slip_url: existingPayment.payment_slip_url,
          updated_at: new Date().toISOString(),
        })
        .eq('contract_id', safeContractId)
        .eq('investor_id', investor.investor_id);
      repairQuery = contract.payment_status === null
        ? repairQuery.is('payment_status', null)
        : repairQuery.eq('payment_status', contract.payment_status);
      const { data: repaired, error: repairError } = await repairQuery
        .select('contract_id')
        .maybeSingle();
      if (repairError || !repaired) {
        return sanitizedServerError('ตรวจสลิปสำเร็จแล้ว แต่ยังไม่สามารถปรับสถานะสัญญาได้ กรุณาลองใหม่');
      }
      return NextResponse.json({
        success: true,
        alreadySubmitted: true,
        paymentId: existingPayment.payment_id,
      });
    }

    if (contract.payment_status === 'PROCESSING' && !processingIsStale) {
      return NextResponse.json(
        { error: 'รายการกำลังถูกตรวจสอบ กรุณารอสักครู่แล้วลองใหม่' },
        { status: 409, headers: { 'Retry-After': '30' } },
      );
    }

    const slipFingerprint = `sha256:${await fingerprintOwnedBlob(safeSlipUrl)}`;
    releaseSlipLock = await acquireTransactionLock('payment-evidence', slipFingerprint.slice(7), 300);

    if (await paymentEvidenceWasUsed(supabase, slipFingerprint)) {
      return NextResponse.json(
        { error: 'สลิปนี้ถูกใช้กับรายการอื่นแล้ว กรุณาใช้สลิปใหม่' },
        { status: 409 },
      );
    }

    const expectedCurrentStatus = typeof contract.payment_status === 'string'
      ? contract.payment_status
      : null;
    const previousStatus = processingIsStale ? 'PENDING' : expectedCurrentStatus;
    let reservationQuery = supabase
      .from('contracts')
      .update({ payment_status: 'PROCESSING', updated_at: new Date().toISOString() })
      .eq('contract_id', safeContractId)
      .eq('investor_id', investor.investor_id);
    reservationQuery = expectedCurrentStatus === null
      ? reservationQuery.is('payment_status', null)
      : reservationQuery.eq('payment_status', expectedCurrentStatus);
    const { data: reservedContract, error: reserveError } = await reservationQuery
      .select('contract_id')
      .maybeSingle();

    if (reserveError || !reservedContract) {
      return NextResponse.json(
        { error: 'รายการกำลังถูกดำเนินการ กรุณารอสักครู่แล้วตรวจสอบสถานะอีกครั้ง' },
        { status: 409, headers: { 'Retry-After': '10' } },
      );
    }
    paymentReservation = {
      supabase,
      contractId: safeContractId,
      investorId: investor.investor_id,
      previousStatus,
    };

    const verificationResult = await verifyPaymentSlip(safeSlipUrl, expectedAmount, {
      receiverAccountNo: pawner?.bank_account_no || null,
      receiverPromptpay: pawner?.promptpay_number || null,
      receiverName: pawner?.bank_account_name || `${pawner?.firstname || ''} ${pawner?.lastname || ''}`.trim() || null,
      useSlipOkLogCheck: false,
    });

    if (verificationResult.result !== 'MATCHED') {
      const { error: evidenceInsertError } = await supabase
        .from('payments')
        .insert({
          contract_id: safeContractId,
          payment_type: 'PRINCIPAL',
          amount: expectedAmount,
          payment_method: 'BANK_TRANSFER',
          payment_status: 'FAILED',
          paid_by_investor_id: investor.investor_id,
          payment_slip_url: safeSlipUrl,
          transaction_ref: slipFingerprint,
          metadata: {
            slipVerification: {
              result: verificationResult.result,
              detectedAmount: verificationResult.detectedAmount,
              provider: verificationResult.rawResponse?.provider || null,
            },
          },
        });
      await releasePaymentReservation(paymentReservation);
      paymentReservation = null;
      if (evidenceInsertError) {
        console.error('Error recording rejected payment evidence');
        return sanitizedServerError('ไม่สามารถบันทึกผลตรวจสลิปได้ กรุณาลองใหม่');
      }
      return NextResponse.json(
        {
          error: verificationResult.message,
          result: verificationResult.result,
          detectedAmount: verificationResult.detectedAmount,
        },
        { status: 400 }
      );
    }

    // Create payment record
    // payment_type: Valid values are PRINCIPAL, INTEREST, FULL_REPAYMENT, PARTIAL_REPAYMENT, LATE_FEE, EXTENSION_FEE
    // payment_status: Valid values are PENDING, PROCESSING, COMPLETED, FAILED, REFUNDED
    // Using 'PRINCIPAL' for investor loan disbursement to pawner
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        contract_id: safeContractId,
        payment_type: 'PRINCIPAL',
        amount: expectedAmount,
        payment_method: 'BANK_TRANSFER',
        payment_status: 'PENDING',
        paid_by_investor_id: investor.investor_id,
        payment_slip_url: safeSlipUrl,
        transaction_ref: slipFingerprint,
        metadata: {
          slipVerification: {
            result: verificationResult.result,
            detectedAmount: verificationResult.detectedAmount,
            provider: verificationResult.rawResponse?.provider || null,
          },
        },
      })
      .select('payment_id, amount')
      .single();

    if (paymentError) {
      await releasePaymentReservation(paymentReservation);
      paymentReservation = null;
      console.error('Error creating payment');
      if (paymentError.code === '23505') {
        return NextResponse.json(
          { error: 'สลิปนี้ถูกใช้แล้ว กรุณาตรวจสอบสถานะรายการ' },
          { status: 409 },
        );
      }
      return sanitizedServerError('ไม่สามารถบันทึกรายการชำระเงินได้ กรุณาลองใหม่');
    }

    // Update contract status
    const { data: finalizedContract, error: finalizeError } = await supabase
      .from('contracts')
      .update({
        payment_status: 'INVESTOR_PAID',
        payment_slip_url: safeSlipUrl,
        updated_at: new Date().toISOString()
      })
      .eq('contract_id', safeContractId)
      .eq('investor_id', investor.investor_id)
      .eq('payment_status', 'PROCESSING')
      .select('contract_id')
      .maybeSingle();

    if (finalizeError || !finalizedContract) {
      // Keep the verified payment and PROCESSING reservation. A retry with the
      // same evidence repairs the contract without paying the verification cost
      // again or asking the investor for an impossible second bank transfer.
      paymentReservation = null;
      return sanitizedServerError('ตรวจสลิปสำเร็จแล้ว แต่ยังไม่สามารถปรับสถานะสัญญาได้ กรุณาลองใหม่');
    }
    paymentReservation = null;

    // Send notification to pawner for confirmation
    if (pawner?.line_id) {
      const confirmationCard = createPaymentConfirmationCard(normalizedContract, payment, investor, safeSlipUrl);
      try {
        await pawnerLineClient.pushMessage(pawner.line_id, confirmationCard);
      } catch {
        console.error('Error sending payment confirmation');
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment submitted successfully',
      paymentId: payment.payment_id
    });

  } catch (error) {
    if (paymentReservation) {
      await releasePaymentReservation(paymentReservation);
    }
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error in investor payment');
    return sanitizedServerError('ไม่สามารถส่งหลักฐานการชำระเงินได้ กรุณาลองใหม่');
  } finally {
    if (releaseLock) await releaseLock();
    if (releaseSlipLock) await releaseSlipLock();
  }
}

async function releasePaymentReservation(
  reservation: {
    supabase: ReturnType<typeof supabaseAdmin>;
    contractId: string;
    investorId: string;
    previousStatus: string | null;
  },
) {
  await reservation.supabase
    .from('contracts')
    .update({
      payment_status: reservation.previousStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('contract_id', reservation.contractId)
    .eq('investor_id', reservation.investorId)
    .eq('payment_status', 'PROCESSING');
}

function createPaymentConfirmationCard(contract: any, payment: any, investor: any, slipUrl: string): FlexMessage {
  const itemName = [contract.items?.brand, contract.items?.model].filter(Boolean).join(' ').trim() || '-';
  const investorName = [investor.firstname, investor.lastname].filter(Boolean).join(' ').trim() || '-';

  return {
    type: 'flex',
    altText: 'ยืนยันการรับเงินจากนักลงทุน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'นักลงทุนโอนเงินแล้ว',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }, {
          type: 'text',
          text: 'กรุณาตรวจสอบและยืนยันการรับเงิน',
          size: 'sm',
          color: '#ffffff',
          align: 'center',
          margin: 'sm'
        }],
        backgroundColor: '#c2410c',
        paddingAll: 'lg'
      },
      hero: {
        type: 'image',
        url: slipUrl,
        size: 'full',
        aspectRatio: '20:20',
        aspectMode: 'cover'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'สินค้า:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: itemName, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'หมายเลขสัญญา:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: contract.contract_number, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              margin: 'lg',
              contents: [
                { type: 'text', text: 'ยอดที่โอน:', color: '#666666', size: 'md', flex: 2 },
                { type: 'text', text: `${payment.amount?.toLocaleString()} บาท`, color: '#1DB446', size: 'xl', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'text',
              text: `โอนโดย: ${investorName}`,
              size: 'xs',
              color: '#888888',
              margin: 'md'
            }
          ]
        }]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [{
          type: 'button',
          action: {
            type: 'postback',
            label: 'ยืนยันรับเงินแล้ว',
            data: `action=confirm_payment&contractId=${contract.contract_id}&paymentId=${payment.payment_id}`
          },
          style: 'primary',
          color: '#1DB446'
        }, {
          type: 'button',
          action: {
            type: 'postback',
            label: 'ยังไม่ได้รับเงิน',
            data: `action=reject_payment&contractId=${contract.contract_id}&paymentId=${payment.payment_id}`
          },
          style: 'secondary'
        }]
      }
    }
  };
}
