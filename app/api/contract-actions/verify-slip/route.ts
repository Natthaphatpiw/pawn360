import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { pushLineMessageWithRetry } from '@/lib/line/push-with-retry';
import { verifyPaymentSlip, saveSlipVerification, logContractAction, getCompanyBankAccount } from '@/lib/services/slip-verification';
import {
  getFrozenLateChargeBreakdown,
  markPenaltyPaymentVerified,
  normalizeDate,
  roundCurrency,
  type PenaltyRequirement,
} from '@/lib/services/penalty';
import { Client, FlexMessage } from '@line/bot-sdk';

const createLineClient = (channelAccessToken?: string, channelSecret?: string) => {
  if (!channelAccessToken) return null;

  return new Client({
    channelAccessToken,
    channelSecret: channelSecret || ''
  });
};

const normalizeRelation = <T,>(value: T | T[] | null | undefined): T | null => (
  Array.isArray(value) ? value[0] || null : value || null
);

const resolveContractInvestor = async (supabase: any, contract: any) => {
  const relatedInvestor = normalizeRelation<any>(contract?.investors);
  if (relatedInvestor?.line_id || !contract?.investor_id) {
    return relatedInvestor;
  }

  const { data: investor, error } = await supabase
    .from('investors')
    .select('investor_id, line_id')
    .eq('investor_id', contract.investor_id)
    .maybeSingle();

  if (error) {
    console.error('Error resolving contract investor:', error);
    return relatedInvestor;
  }

  return investor;
};

const getFrozenPenaltyRequirement = (
  actionRequest: any,
  contract: any,
  baseAmount: number,
): PenaltyRequirement => {
  const breakdown = getFrozenLateChargeBreakdown(actionRequest, contract, baseAmount);
  const contractStartDate = normalizeDate(contract.contract_start_date);
  const contractEndDate = normalizeDate(contract.contract_end_date);

  return {
    required: breakdown.totalLateChargeAmount > 0,
    daysOverdue: breakdown.daysOverdue,
    penaltyAmount: breakdown.penaltyAmount,
    overdueInterestAmount: breakdown.overdueInterestAmount,
    totalLateChargeAmount: breakdown.totalLateChargeAmount,
    today: breakdown.requestDate,
    contractStartDate,
    contractEndDate,
    paidThroughDate: null,
  };
};

const updateActionRequest = async (
  supabase: any,
  requestId: string,
  updateData: Record<string, unknown>,
) => {
  const { error } = await supabase
    .from('contract_action_requests')
    .update(updateData)
    .eq('request_id', requestId);

  if (error) {
    throw error;
  }
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, slipUrl, pawnerLineId } = body;

    if (!requestId || !slipUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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
        { error: 'Request not found' },
        { status: 404 }
      );
    }

    // Check if request is in a valid state for slip verification
    const validStatuses = ['AWAITING_PAYMENT', 'SLIP_REJECTED'];
    if (!validStatuses.includes(actionRequest.request_status)) {
      if (actionRequest.request_status === 'SLIP_VERIFIED' || actionRequest.request_status === 'COMPLETED') {
        return NextResponse.json(
          { error: 'คำขอนี้ได้รับการยืนยันแล้ว', alreadyVerified: true },
          { status: 400 }
        );
      }
      if (actionRequest.request_status === 'SLIP_REJECTED_FINAL' || actionRequest.request_status === 'VOIDED') {
        return NextResponse.json(
          { error: 'คำขอนี้ถูกยกเลิกแล้ว กรุณาติดต่อฝ่าย Support โทร 0626092941' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'สถานะคำขอไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' },
        { status: 400 }
      );
    }

    // Check attempt count
    const attemptCount = (actionRequest.slip_attempt_count || 0) + 1;

    if (attemptCount > 2) {
      return NextResponse.json(
        { error: 'เกินจำนวนครั้งที่อนุญาต กรุณาติดต่อฝ่าย Support' },
        { status: 400 }
      );
    }

    const contract = actionRequest.contract;
    const pawner = normalizeRelation<any>(contract?.pawners);
    const investor = await resolveContractInvestor(supabase, contract);

    if (
      actionRequest.request_type === 'PRINCIPAL_INCREASE'
      && (!contract?.investor_id || !investor?.line_id)
    ) {
      return NextResponse.json(
        { error: 'ไม่พบ Buyer เจ้าของสัญญาหรือ LINE ID สำหรับรับคำขอ กรุณาติดต่อฝ่ายสนับสนุน' },
        { status: 409 }
      );
    }

    if (pawnerLineId && pawner?.line_id !== pawnerLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const baseAmount = getBaseAmountForActionRequest(actionRequest);
    const persistedTotalAmount = Number(actionRequest.total_amount || 0);
    const expectedAmount = roundCurrency(
      persistedTotalAmount > 0 ? persistedTotalAmount : baseAmount
    );
    const penaltyRequirement = getFrozenPenaltyRequirement(actionRequest, contract, baseAmount);

    const companyBank = await getCompanyBankAccount();

    // Verify slip with SlipOK (falls back to legacy OCR until SlipOK env is configured)
    const verificationResult = await verifyPaymentSlip(slipUrl, expectedAmount, {
      receiverAccountNo: companyBank.account_number || companyBank.bank_account_no || null,
      receiverPromptpay: companyBank.promptpay_number || null,
      receiverName: companyBank.account_name || companyBank.bank_account_name || null,
      useSlipOkLogCheck: true,
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
      slip_url: slipUrl,
      slip_uploaded_at: new Date().toISOString(),
      slip_amount_detected: verificationResult.detectedAmount,
      slip_verification_result: verificationResult.result,
      slip_verification_details: verificationResult.rawResponse,
      slip_attempt_count: attemptCount,
    };

    // Handle verification result
    if (verificationResult.result === 'MATCHED') {
      // Success - proceed to next step
      const isPrincipalIncrease = actionRequest.request_type === 'PRINCIPAL_INCREASE';
      updateData.request_status = isPrincipalIncrease ? 'PENDING_INVESTOR_APPROVAL' : 'SLIP_VERIFIED';

      await updateActionRequest(supabase, requestId, updateData);

      await logContractAction(
        actionRequest.contract_id,
        'SLIP_VERIFIED',
        'COMPLETED',
        'PAWNER',
        pawnerLineId,
        {
          actionRequestId: requestId,
          slipUrl,
          slipAmountDetected: verificationResult.detectedAmount,
          slipVerificationResult: verificationResult.result,
          description: `Slip verified successfully. Detected: ${verificationResult.detectedAmount}, Expected: ${expectedAmount}`,
        }
      );

      if (penaltyRequirement.required) {
        await markPenaltyPaymentVerified(supabase, contract, penaltyRequirement, {
          slipUrl,
          detectedAmount: verificationResult.detectedAmount,
          verificationResult: verificationResult.result,
          verificationDetails: verificationResult.rawResponse,
          attemptCount,
        });
      }

      let buyerNotificationSent = false;
      if (isPrincipalIncrease && investor?.line_id) {
        try {
          const investorLineClient = createLineClient(
            process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST,
            process.env.LINE_CHANNEL_SECRET_INVEST
          );
          if (!investorLineClient) {
            throw new Error('Buyer LINE OA is not configured');
          }

          const approvalCard = createInvestorApprovalCard(actionRequest, contract);
          await pushLineMessageWithRetry(investorLineClient, investor.line_id, approvalCard);
          buyerNotificationSent = true;
          await logContractAction(
            actionRequest.contract_id,
            'NOTIFICATION_SENT',
            'COMPLETED',
            'SYSTEM',
            null,
            {
              actionRequestId: requestId,
              description: 'Sent investor approval notification after interest payment slip verified',
              metadata: {
                requestStatus: updateData.request_status,
              },
            }
          );
        } catch (err) {
          console.error('Error sending approval notification to buyer:', err);
          await logContractAction(
            actionRequest.contract_id,
            'ERROR_OCCURRED',
            'FAILED',
            'SYSTEM',
            null,
            {
              actionRequestId: requestId,
              description: 'Failed to send principal increase approval notification to contract owner',
              errorMessage: err instanceof Error ? err.message : 'Unknown LINE notification error',
            }
          );
        }
      }

      return NextResponse.json({
        success: true,
        result: verificationResult.result,
        message: 'ตรวจสอบสลิปสำเร็จ',
        nextStep: isPrincipalIncrease ? 'WAIT_INVESTOR_APPROVAL' : 'SIGN_CONTRACT',
        detectedAmount: verificationResult.detectedAmount,
        expectedAmount,
        buyerNotificationSent,
      });

    } else if (verificationResult.result === 'UNDERPAID') {
      // Underpaid
      if (attemptCount >= 2) {
        // Second attempt failed - void the request
        updateData.request_status = 'SLIP_REJECTED_FINAL';
        updateData.voided_at = new Date().toISOString();
        updateData.void_reason = 'โอนเงินไม่ครบจำนวน 2 ครั้ง';

        await updateActionRequest(supabase, requestId, updateData);

        // Log voided
        await logContractAction(
          actionRequest.contract_id,
          'SLIP_REJECTED',
          'FAILED',
          'SYSTEM',
          null,
          {
            actionRequestId: requestId,
            slipUrl,
            slipAmountDetected: verificationResult.detectedAmount,
            slipVerificationResult: 'SLIP_REJECTED_FINAL',
            description: `Request voided after 2 failed attempts. Detected: ${verificationResult.detectedAmount}, Expected: ${expectedAmount}`,
          }
        );

        // Send notification to pawner
        if (pawner?.line_id) {
          try {
            const pawnerLineClient = createLineClient(
              process.env.LINE_CHANNEL_ACCESS_TOKEN,
              process.env.LINE_CHANNEL_SECRET
            );
            if (!pawnerLineClient) {
              throw new Error('Seller LINE OA is not configured');
            }

            await pawnerLineClient.pushMessage(pawner.line_id, {
              type: 'text',
              text: `การดำเนินการเป็นโมฆะ\n\nเนื่องจากคุณโอนเงินไม่ตรงตามจำนวนถึง 2 ครั้ง\n\nกรุณาติดต่อฝ่าย Support\nโทร: 0626092941\n\nแจ้งปัญหา: การ${getActionTypeName(actionRequest.request_type)}ไม่สำเร็จ\nหมายเลขสัญญา: ${contract?.contract_number}`
            });
          } catch (err) {
            console.error('Error sending message to pawner:', err);
          }
        }

        return NextResponse.json({
          success: false,
          result: 'VOIDED',
          message: 'การดำเนินการเป็นโมฆะเนื่องจากโอนเงินไม่ครบจำนวน 2 ครั้ง',
          supportPhone: '0626092941',
        });

      } else {
        // First attempt failed - allow retry
        updateData.request_status = 'SLIP_REJECTED';

        await updateActionRequest(supabase, requestId, updateData);

        // Log rejected
        await logContractAction(
          actionRequest.contract_id,
          'SLIP_REJECTED',
          'PENDING',
          'SYSTEM',
          null,
          {
            actionRequestId: requestId,
            slipUrl,
            slipAmountDetected: verificationResult.detectedAmount,
            slipVerificationResult: 'UNDERPAID',
            description: `Slip rejected (attempt ${attemptCount}). Detected: ${verificationResult.detectedAmount}, Expected: ${expectedAmount}`,
          }
        );

        const shortAmount = Math.abs(verificationResult.difference || 0);

        return NextResponse.json({
          success: false,
          result: 'UNDERPAID',
          message: `ยอดโอนเงินของคุณไม่ตรงกับยอดที่ต้องโอน\n\nกรุณาโอนใหม่เต็มจำนวน ${expectedAmount.toLocaleString()} บาท\n\nหากมีปัญหา กรุณาติดต่อฝ่าย Support โทร 0626092941`,
          shortAmount,
          detectedAmount: verificationResult.detectedAmount,
          expectedAmount,
          attemptCount,
          remainingAttempts: 2 - attemptCount,
          supportPhone: '0626092941',
          companyBank,
        });
      }

    } else {
      // Unreadable or Invalid
      if (attemptCount >= 2) {
        updateData.request_status = 'SLIP_REJECTED_FINAL';
        updateData.voided_at = new Date().toISOString();
        updateData.void_reason = 'ไม่สามารถอ่านสลิปได้ 2 ครั้ง';

        await updateActionRequest(supabase, requestId, updateData);

        return NextResponse.json({
          success: false,
          result: 'VOIDED',
          message: 'การดำเนินการเป็นโมฆะเนื่องจากไม่สามารถตรวจสอบสลิปได้',
          supportPhone: '0626092941',
        });
      }

      updateData.request_status = 'SLIP_REJECTED';

      await updateActionRequest(supabase, requestId, updateData);

      return NextResponse.json({
        success: false,
        result: verificationResult.result,
        message: verificationResult.message,
        attemptCount,
        remainingAttempts: 2 - attemptCount,
      });
    }

  } catch (error: any) {
    console.error('Error verifying slip:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function getActionTypeName(type: string): string {
  const names: Record<string, string> = {
    'INTEREST_PAYMENT': 'ต่อดอกเบี้ย',
    'PRINCIPAL_REDUCTION': 'ลดเงินต้น',
    'PRINCIPAL_INCREASE': 'เพิ่มเงินต้น',
  };
  return names[type] || type;
}

function getBaseAmountForActionRequest(actionRequest: any): number {
  switch (actionRequest.request_type) {
    case 'INTEREST_PAYMENT':
      return Number(actionRequest.interest_to_pay || 0);
    case 'PRINCIPAL_REDUCTION':
      return Number(actionRequest.total_to_pay_reduction || 0);
    case 'PRINCIPAL_INCREASE':
      return Number(actionRequest.interest_for_period || 0);
    default:
      return Number(actionRequest.total_amount || 0);
  }
}

function createInvestorApprovalCard(actionRequest: any, contract: any): FlexMessage {
  const item = contract?.items;
  const pawner = normalizeRelation<any>(contract?.pawners);
  const increaseAmount = Number(actionRequest.increase_amount || 0);
  const newPrincipal = actionRequest.principal_after_increase;
  const investorRate = Number(contract?.investor_rate || 0.015);
  const additionalMonthlyInterest = Math.round(increaseAmount * investorRate * 100) / 100;
  const formatAmount = (value: number) => (
    value % 1
      ? value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : value.toLocaleString('th-TH')
  );

  const investorLiffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_PRINCIPAL_INCREASE || '2008641671-ejsAmBXx';

  return {
    type: 'flex',
    altText: 'คำขอเพิ่มเงินต้น - รอการอนุมัติ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'คำขอเพิ่มเงินต้น',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }, {
          type: 'text',
          text: 'Principal Increase Request',
          size: 'xs',
          color: '#ffffff',
          align: 'center',
          margin: 'sm'
        }],
        backgroundColor: '#1E3A8A',
        paddingAll: 'lg'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `สัญญาเลขที่ ${contract?.contract_number}`,
            weight: 'bold',
            size: 'md',
            color: '#333333'
          },
          {
            type: 'text',
            text: `${[item?.brand, item?.model].filter(Boolean).join(' ') || '-'}`,
            size: 'sm',
            color: '#666666',
            margin: 'sm'
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
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  { type: 'text', text: 'ผู้ขอสินเชื่อ:', color: '#666666', size: 'sm', flex: 2 },
                  { type: 'text', text: `${[pawner?.firstname, pawner?.lastname].filter(Boolean).join(' ') || '-'}`, color: '#333333', size: 'sm', flex: 3, weight: 'bold' }
                ]
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                margin: 'md',
                contents: [
                  { type: 'text', text: 'ขอเพิ่ม:', color: '#666666', size: 'sm', flex: 2 },
                  { type: 'text', text: `${increaseAmount?.toLocaleString()} บาท`, color: '#22C55E', size: 'lg', flex: 3, weight: 'bold' }
                ]
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                margin: 'md',
                contents: [
                  { type: 'text', text: 'เงินต้นใหม่:', color: '#666666', size: 'sm', flex: 2 },
                  { type: 'text', text: `${newPrincipal?.toLocaleString()} บาท`, color: '#1E3A8A', size: 'sm', flex: 3, weight: 'bold' }
                ]
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                margin: 'md',
                contents: [
                  { type: 'text', text: 'ดอกเบี้ยเพิ่ม/เดือน:', color: '#666666', size: 'sm', flex: 2 },
                  { type: 'text', text: `+${formatAmount(additionalMonthlyInterest)} บาท`, color: '#22C55E', size: 'sm', flex: 3, weight: 'bold' }
                ]
              }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [{
          type: 'button',
          action: {
            type: 'uri',
            label: 'ดูรายละเอียดและอนุมัติ',
            uri: `https://liff.line.me/${investorLiffId}?requestId=${actionRequest.request_id}`
          },
          style: 'primary',
          color: '#1E3A8A'
        }]
      }
    }
  };
}
