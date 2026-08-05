import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { getCompanyBankAccount, saveSlipVerification, verifyPaymentSlip } from '@/lib/services/slip-verification';
import { getPenaltyRequirement, markPenaltyPaymentVerified, roundCurrency } from '@/lib/services/penalty';
import { Client, FlexMessage } from '@line/bot-sdk';
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

// Drop Point LINE OA client
const dropPointLineClient = process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT ? new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT,
  channelSecret: process.env.LINE_CHANNEL_SECRET_DROPPOINT || ''
}) : null;

const getDropPointReturnUrl = (redemptionId: string) => {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_RETURN || '2008651088-fsjSpdo9';
  return `https://liff.line.me/${liffId}?redemptionId=${encodeURIComponent(redemptionId)}`;
};

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  let releaseEvidenceLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request) as any;
    const { redemptionId, slipUrl, pawnerLineId } = body;

    const safeRedemptionId = requireUuid(redemptionId);
    const safeSlipUrl = requireOwnedBlobUrl(slipUrl, ['pawn-items/', 'redemption-slips/']);
    const claimedLineId = boundedText(pawnerLineId, 128, true) || '';
    const verifiedLineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);
    releaseLock = await acquireTransactionLock('redemption-slip', safeRedemptionId, 300);

    const supabase = supabaseAdmin();

    // Get redemption with contract details
    const { data: redemption, error: redemptionError } = await supabase
      .from('redemption_requests')
      .select(`
        *,
        contract:contract_id (
          contract_id,
          contract_number,
          contract_start_date,
          contract_end_date,
          contract_status,
          redemption_status,
          customer_id,
          investor_id,
          loan_principal_amount,
          interest_amount,
          total_amount,
          items:item_id (
            item_id,
            brand,
            model,
            capacity,
            image_urls
          ),
          pawners:customer_id (
            customer_id,
            firstname,
            lastname,
            line_id,
            phone_number
          ),
          investors:investor_id (
            investor_id,
            firstname,
            lastname,
            line_id,
            bank_name,
            bank_account_no,
            bank_account_name
          ),
          drop_points:drop_point_id (
            drop_point_id,
            drop_point_name,
            phone_number,
            line_id
          )
        )
      `)
      .eq('redemption_id', safeRedemptionId)
      .single();

    if (redemptionError || !redemption) {
      return NextResponse.json(
        { error: 'Redemption not found' },
        { status: 404 }
      );
    }

    const contract = Array.isArray(redemption.contract) ? redemption.contract[0] : redemption.contract;
    const pawner = Array.isArray(contract?.pawners) ? contract.pawners[0] : contract?.pawners;

    if (!pawner?.line_id || pawner.line_id !== verifiedLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    if (!contract || !['ACTIVE', 'CONFIRMED'].includes(contract.contract_status)) {
      return NextResponse.json(
        { error: 'สัญญาไม่อยู่ในสถานะที่ชำระเงินไถ่ถอนได้' },
        { status: 409 },
      );
    }

    if (redemption.request_status === 'AMOUNT_VERIFIED') {
      if (contract.redemption_status !== 'IN_PROGRESS') {
        const { data: repairedContract, error: repairError } = await supabase
          .from('contracts')
          .update({
            redemption_status: 'IN_PROGRESS',
            updated_at: new Date().toISOString(),
          })
          .eq('contract_id', redemption.contract_id)
          .in('contract_status', ['ACTIVE', 'CONFIRMED'])
          .select('contract_id')
          .maybeSingle();
        if (repairError || !repairedContract) {
          return sanitizedServerError('ชำระเงินสำเร็จแล้ว แต่ยังไม่สามารถปรับสถานะสัญญาได้ กรุณาลองใหม่');
        }
      }
      return NextResponse.json({ success: true, alreadyVerified: true, result: 'MATCHED' });
    }

    const slipFingerprint = `sha256:${await fingerprintOwnedBlob(safeSlipUrl)}`;
    releaseEvidenceLock = await acquireTransactionLock('payment-evidence', slipFingerprint.slice(7), 300);

    if (await paymentEvidenceWasUsed(supabase, slipFingerprint)) {
      return NextResponse.json(
        { error: 'สลิปนี้ถูกใช้แล้ว กรุณาใช้สลิปใหม่' },
        { status: 409 },
      );
    }
    if (!['PENDING', 'AMOUNT_MISMATCH'].includes(redemption.request_status)) {
      return NextResponse.json(
        { error: 'สถานะรายการไม่สามารถส่งสลิปได้' },
        { status: 409 },
      );
    }

    const penaltyRequirement = await getPenaltyRequirement(supabase, contract);
    const baseAmount = Number(redemption.principal_amount || 0)
      + Number(redemption.interest_amount || 0)
      + Number(redemption.delivery_fee || 0);
    const penaltyAmount = penaltyRequirement.required ? Number(penaltyRequirement.penaltyAmount || 0) : 0;
    const overdueInterestAmount = penaltyRequirement.required ? Number(penaltyRequirement.overdueInterestAmount || 0) : 0;
    const expectedAmount = roundCurrency(baseAmount + penaltyAmount + overdueInterestAmount);
    if (
      !Number.isFinite(baseAmount)
      || baseAmount <= 0
      || !Number.isFinite(penaltyAmount)
      || penaltyAmount < 0
      || !Number.isFinite(overdueInterestAmount)
      || overdueInterestAmount < 0
      || !Number.isFinite(expectedAmount)
      || expectedAmount <= 0
    ) {
      return NextResponse.json(
        { error: 'ไม่สามารถตรวจสอบยอดไถ่ถอนได้ กรุณาติดต่อฝ่ายสนับสนุน' },
        { status: 409 },
      );
    }

    // The overdue penalty accrues daily, so recomputing the payoff here can
    // exceed what the pawner was quoted. The previous code silently re-priced
    // the request upward and then verified the slip against the NEW number with
    // zero tolerance - so a pawner who transferred exactly the amount they were
    // shown was told their payment did not match, with no explanation.
    //
    // The quote the pawner acted on is honoured while it is still fresh. Once
    // it has gone stale the request is re-priced, but the pawner is told the
    // new total explicitly instead of failing an amount comparison they cannot
    // see.
    const quotedAmount = roundCurrency(Number(redemption.total_amount || 0));
    const quoteAgeMs = Date.now() - new Date(redemption.created_at || Date.now()).getTime();
    const parsedQuoteValidMs = Number(process.env.REDEMPTION_QUOTE_VALID_MS);
    const quoteValidMs = Number.isFinite(parsedQuoteValidMs) && parsedQuoteValidMs > 0
      ? parsedQuoteValidMs
      : 24 * 60 * 60 * 1000;
    const quoteIsFresh = quoteAgeMs <= quoteValidMs;

    let amountToVerify = expectedAmount;
    if (quotedAmount > 0 && expectedAmount !== quotedAmount) {
      if (quoteIsFresh && quotedAmount >= expectedAmount) {
        // Quote at or above the current payoff - accept what they were told.
        amountToVerify = quotedAmount;
      } else if (quoteIsFresh) {
        // Still fresh but the payoff has grown. Honour the quote rather than
        // penalising the pawner for our timing.
        amountToVerify = quotedAmount;
      } else {
        const { data: amountUpdated, error: amountUpdateError } = await supabase
          .from('redemption_requests')
          .update({
            total_amount: expectedAmount,
            updated_at: new Date().toISOString(),
          })
          .eq('redemption_id', safeRedemptionId)
          .in('request_status', ['PENDING', 'AMOUNT_MISMATCH'])
          .select('redemption_id')
          .maybeSingle();
        if (amountUpdateError) {
          return sanitizedServerError('ไม่สามารถปรับยอดไถ่ถอนให้เป็นปัจจุบันได้ กรุณาลองใหม่');
        }
        if (!amountUpdated) {
          return NextResponse.json(
            { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
            { status: 409 },
          );
        }
        return NextResponse.json(
          {
            error: `ยอดไถ่ถอนมีการเปลี่ยนแปลงเป็น ${expectedAmount.toLocaleString()} บาท (เดิม ${quotedAmount.toLocaleString()} บาท) เนื่องจากค่าปรับรายวัน กรุณาตรวจสอบยอดใหม่ก่อนโอน`,
            code: 'REDEMPTION_QUOTE_EXPIRED',
            previousAmount: quotedAmount,
            currentAmount: expectedAmount,
          },
          { status: 409 },
        );
      }
    }

    const companyBank = await getCompanyBankAccount();
    const verificationResult = await verifyPaymentSlip(safeSlipUrl, amountToVerify, {
      receiverAccountNo: companyBank.account_number || companyBank.bank_account_no || null,
      receiverPromptpay: companyBank.promptpay_number || null,
      receiverName: companyBank.account_name || companyBank.bank_account_name || null,
      useSlipOkLogCheck: true,
    });

    const { count: previousAttempts, error: attemptsError } = await supabase
      .from('slip_verifications')
      .select('verification_id', { count: 'exact', head: true })
      .eq('redemption_id', safeRedemptionId);
    if (attemptsError) {
      return sanitizedServerError('ไม่สามารถตรวจสอบประวัติการส่งสลิปได้ กรุณาลองใหม่');
    }

    const savedVerification = await saveSlipVerification(
      null,
      safeRedemptionId,
      safeSlipUrl,
      amountToVerify,
      {
        ...verificationResult,
        rawResponse: {
          provider: verificationResult.rawResponse?.provider || null,
          // The fingerprint is what marks a slip as spent, and it used to be
          // written on EVERY attempt - so a slip rejected for any reason could
          // never be submitted again, even though it evidenced a real transfer
          // the pawner had actually made. Only an accepted slip has paid for
          // anything, so only an accepted slip is burned. The row is still
          // written either way, so the audit trail keeps every attempt.
          ...(verificationResult.result === 'MATCHED' ? { fingerprint: slipFingerprint } : {}),
        },
      },
      (previousAttempts || 0) + 1,
    );
    if (!savedVerification) {
      return sanitizedServerError('ไม่สามารถบันทึกผลตรวจสลิปได้ กรุณาลองใหม่');
    }

    const baseUpdateData: any = {
      payment_slip_url: safeSlipUrl,
      payment_slip_uploaded_at: new Date().toISOString(),
      actual_amount_received: verificationResult.detectedAmount,
      amount_difference: verificationResult.difference,
      mismatch_type: verificationResult.result === 'UNDERPAID'
        ? 'UNDERPAID'
        : (verificationResult.result === 'OVERPAID' ? 'OVERPAID' : null),
      verification_notes: verificationResult.message,
      updated_at: new Date().toISOString(),
    };

    if (verificationResult.result !== 'MATCHED') {
      const { data: mismatchUpdated, error: mismatchUpdateError } = await supabase
        .from('redemption_requests')
        .update({
          ...baseUpdateData,
          request_status: 'PENDING',
        })
        .eq('redemption_id', safeRedemptionId)
        .in('request_status', ['PENDING', 'AMOUNT_MISMATCH'])
        .select('redemption_id')
        .maybeSingle();

      if (mismatchUpdateError) {
        return sanitizedServerError('ไม่สามารถบันทึกผลตรวจสลิปได้ กรุณาลองใหม่');
      }
      if (!mismatchUpdated) {
        return NextResponse.json(
          { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          error: verificationResult.message,
          result: verificationResult.result,
          detectedAmount: verificationResult.detectedAmount,
          expectedAmount: amountToVerify,
        },
        { status: 400 }
      );
    }

    // Update redemption after successful slip verification
    const { data: updatedRedemption, error: updateError } = await supabase
      .from('redemption_requests')
      .update({
        ...baseUpdateData,
        request_status: 'AMOUNT_VERIFIED',
        verified_at: new Date().toISOString(),
      })
      .eq('redemption_id', safeRedemptionId)
      .in('request_status', ['PENDING', 'AMOUNT_MISMATCH'])
      .select('redemption_id')
      .maybeSingle();

    if (updateError || !updatedRedemption) {
      console.error('Error updating redemption');
      return NextResponse.json(
        { error: 'สถานะรายการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่' },
        { status: 409 }
      );
    }

    // Update contract redemption status
    const { data: updatedContract, error: contractUpdateError } = await supabase
      .from('contracts')
      .update({
        redemption_status: 'IN_PROGRESS',
        updated_at: new Date().toISOString(),
      })
      .eq('contract_id', redemption.contract_id)
      .in('contract_status', ['ACTIVE', 'CONFIRMED'])
      .select('contract_id')
      .maybeSingle();

    if (contractUpdateError || !updatedContract) {
      return sanitizedServerError('ชำระเงินสำเร็จแล้ว แต่ยังไม่สามารถปรับสถานะสัญญาได้ กรุณาลองใหม่');
    }

    if (penaltyRequirement.required) {
      await markPenaltyPaymentVerified(supabase, contract, penaltyRequirement, {
        slipUrl: safeSlipUrl,
        detectedAmount: verificationResult.detectedAmount,
        verificationResult: verificationResult.result,
        verificationDetails: {
          provider: verificationResult.rawResponse?.provider || null,
          fingerprint: slipFingerprint,
        },
        attemptCount: (previousAttempts || 0) + 1,
      });
    }

    // Send notification to Drop Point
    const dropPoint = Array.isArray(contract.drop_points) ? contract.drop_points[0] : contract.drop_points;
    const dropPointLineId = dropPoint?.line_id;
    if (dropPointLineId && dropPointLineClient) {
      try {
        const { data: storageBox, error: storageBoxError } = await supabase
          .from('drop_point_storage_boxes')
          .select('box_code')
          .eq('contract_id', redemption.contract_id)
          .order('last_updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (storageBoxError && storageBoxError.code !== 'PGRST205') {
          console.error('Error fetching storage box for redemption card');
        }

        const { data: bagAssignment, error: bagAssignmentError } = await supabase
          .from('drop_point_bag_assignments')
          .select('bag_number')
          .eq('contract_id', redemption.contract_id)
          .order('assigned_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (bagAssignmentError) {
          console.error('Error fetching bag assignment for redemption card');
        }

        const notificationCard = createDropPointRedemptionCard(redemption, getDropPointReturnUrl(safeRedemptionId));
        const bagOrBoxCode = bagAssignment?.bag_number || storageBox?.box_code || null;
        if (storageBox?.box_code && bagAssignment?.bag_number && bagAssignment.bag_number !== storageBox.box_code) {
          (notificationCard.contents as any).body.contents.splice(3, 0, {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'กล่อง:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: storageBox.box_code, color: '#365314', size: 'sm', flex: 5, weight: 'bold' }
            ]
          });
        }
        if (bagOrBoxCode) {
          (notificationCard.contents as any).body.contents.splice(2, 0, {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'หมายเลขถุง:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: bagOrBoxCode, color: '#365314', size: 'sm', flex: 5, weight: 'bold' }
            ]
          });
        }
        await dropPointLineClient.pushMessage(dropPointLineId, notificationCard);
      } catch {
        console.error('Error sending redemption notification to drop point');
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Slip uploaded successfully',
      result: verificationResult.result,
    });

  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error uploading redemption slip');
    return sanitizedServerError('ไม่สามารถตรวจสอบสลิปได้ กรุณาลองใหม่');
  } finally {
    if (releaseLock) await releaseLock();
    if (releaseEvidenceLock) await releaseEvidenceLock();
  }
}

function createDropPointRedemptionCard(redemption: any, returnUrl: string): FlexMessage {
  const contract = redemption.contract;
  const item = contract?.items;
  const pawner = contract?.pawners;

  const deliveryMethodText = {
    'SELF_PICKUP': 'ลูกค้ามารับเอง',
    'SELF_ARRANGE': 'ลูกค้าเรียกขนส่งเอง',
    'PLATFORM_ARRANGE': 'ให้ Astly เรียกขนส่ง',
    'DROPPOINT_SELF_PICKUP': 'ลูกค้ารับเองที่ Drop Point',
    'DROPPOINT_SELF_RIDER': 'ลูกค้าเรียกไรเดอร์เอง',
    'CENTRAL_SCHEDULE_7D': 'นัดรับที่ Drop Point ภายใน 7 วัน',
    'CENTRAL_SELF_PICKUP_TODAY': 'ลูกค้ารับเองที่คลังกลาง Astly วันนี้',
    'DROPPOINT_NEXT_DAY_PICKUP': 'รับวันถัดไปที่ Drop Point',
  }[redemption.delivery_method as string] || redemption.delivery_method;

  return {
    type: 'flex',
    altText: 'มีคำขอไถ่ถอนใหม่',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'คำขอไถ่ถอนใหม่',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }, {
          type: 'text',
          text: 'ระบบตรวจสอบสลิปเรียบร้อยแล้ว',
          size: 'sm',
          color: '#ffffff',
          align: 'center',
          margin: 'sm'
        }],
        backgroundColor: '#365314',
        paddingAll: 'lg'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'สินค้า:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: `${[item?.brand, item?.model].filter(Boolean).join(' ') || '-'}`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'สัญญา:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: contract?.contract_number || '', color: '#333333', size: 'sm', flex: 5 }
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
            margin: 'md',
            contents: [
              { type: 'text', text: 'การรับของ:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: deliveryMethodText, color: '#333333', size: 'sm', flex: 5 }
            ]
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            contents: [
              { type: 'text', text: 'ข้อมูลผู้ขอสินเชื่อ:', color: '#666666', size: 'xs', margin: 'none' },
              { type: 'text', text: `${[pawner?.firstname, pawner?.lastname].filter(Boolean).join(' ') || '-'}`, color: '#333333', size: 'sm', weight: 'bold', margin: 'sm' },
              { type: 'text', text: `โทร: ${pawner?.phone_number || '-'}`, color: '#666666', size: 'xs', margin: 'sm' }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'เปิดรายการส่งคืน',
              uri: returnUrl,
            },
            style: 'primary',
            color: '#365314'
          }
        ]
      }
    }
  };
}
