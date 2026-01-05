import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifyPaymentSlip, saveSlipVerification, logContractAction } from '@/lib/services/slip-verification';
import { Client } from '@line/bot-sdk';

// Pawner LINE OA client
const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

const round2 = (value: number) => Math.round(value * 100) / 100;

const buildContractNumber = () => (
  `CTR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
);

const buildRenewedContractRecord = (params: {
  contract: any;
  principalAmount: number;
  interestAmount: number;
  contractStartDate: Date;
  contractEndDate: Date;
  durationDays: number;
  signedContractUrl?: string | null;
}) => {
  const platformFeeRate = params.contract.platform_fee_rate ?? 0.10;
  const platformFeeAmount = round2(params.interestAmount * platformFeeRate);
  const originalContractId = params.contract.original_contract_id || params.contract.contract_id;

  return {
    contract_number: buildContractNumber(),
    customer_id: params.contract.customer_id,
    investor_id: params.contract.investor_id,
    drop_point_id: params.contract.drop_point_id,
    item_id: params.contract.item_id,
    loan_request_id: params.contract.loan_request_id,
    loan_offer_id: params.contract.loan_offer_id,
    contract_start_date: params.contractStartDate.toISOString(),
    contract_end_date: params.contractEndDate.toISOString(),
    contract_duration_days: params.durationDays,
    loan_principal_amount: params.principalAmount,
    interest_rate: params.contract.interest_rate,
    interest_amount: params.interestAmount,
    total_amount: round2(params.principalAmount + params.interestAmount),
    platform_fee_rate: platformFeeRate,
    platform_fee_amount: platformFeeAmount,
    amount_paid: 0,
    interest_paid: 0,
    principal_paid: 0,
    contract_status: 'CONFIRMED',
    funding_status: params.contract.funding_status || 'FUNDED',
    parent_contract_id: params.contract.contract_id,
    original_contract_id: originalContractId,
    contract_file_url: params.contract.contract_file_url,
    signed_contract_url: params.signedContractUrl || params.contract.signed_contract_url,
    item_delivery_status: params.contract.item_delivery_status,
    item_received_at: params.contract.item_received_at,
    item_verified_at: params.contract.item_verified_at,
    payment_slip_url: params.contract.payment_slip_url,
    payment_confirmed_at: params.contract.payment_confirmed_at,
    payment_status: params.contract.payment_status,
    original_principal_amount: params.principalAmount,
    current_principal_amount: params.principalAmount,
    total_interest_paid: 0,
    total_principal_reduced: 0,
    total_principal_increased: 0,
    extension_count: 0,
    redemption_status: 'NONE',
    funded_at: params.contract.funded_at,
    disbursed_at: params.contract.disbursed_at,
  };
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, slipUrl, investorLineId } = body;

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

    // Check if request is still active and available
    const validStatuses = ['AWAITING_INVESTOR_APPROVAL', 'INVESTOR_APPROVED', 'AWAITING_INVESTOR_PAYMENT', 'INVESTOR_SLIP_REJECTED', 'PENDING_INVESTOR_APPROVAL'];
    if (!validStatuses.includes(actionRequest.request_status)) {
      if (actionRequest.request_status === 'INVESTOR_TRANSFERRED' || actionRequest.request_status === 'COMPLETED') {
        return NextResponse.json(
          { error: 'คำขอนี้ได้รับการดำเนินการแล้ว', alreadyProcessed: true },
          { status: 400 }
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

    // Verify slip with AI
    const expectedAmount = actionRequest.increase_amount;
    const verificationResult = await verifyPaymentSlip(slipUrl, expectedAmount);

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
      investor_slip_attempt_count: attemptCount,
    };

    const contract = actionRequest.contract;
    const pawner = contract?.pawners;

    // Handle verification result
    if (verificationResult.result === 'MATCHED' || verificationResult.result === 'OVERPAID') {
      const now = new Date();
      const msPerDay = 1000 * 60 * 60 * 24;
      const actionCreatedAt = actionRequest.created_at ? new Date(actionRequest.created_at) : now;
      const contractEndDate = new Date(contract.contract_end_date);

      const principalAmount = Number(actionRequest.principal_after_increase || contract.current_principal_amount || contract.loan_principal_amount || 0);
      const interestFirstPart = Number(actionRequest.interest_for_period || actionRequest.interest_accrued || 0);
      let interestRemaining = Number(actionRequest.new_interest_for_remaining_increase || 0);
      if (!interestRemaining && actionRequest.daily_interest_rate && actionRequest.days_remaining) {
        interestRemaining = round2(principalAmount * Number(actionRequest.daily_interest_rate) * Number(actionRequest.days_remaining));
      }
      const totalPaidNow = Number(actionRequest.total_amount || 0);
      const paidInterestNow = totalPaidNow > 0;
      const interestAmount = paidInterestNow ? interestRemaining : round2(interestFirstPart + interestRemaining);
      const durationDays = Number(actionRequest.days_remaining || Math.max(0, Math.ceil((contractEndDate.getTime() - actionCreatedAt.getTime()) / msPerDay)));

      const { data: newContract, error: newContractError } = await supabase
        .from('contracts')
        .insert(buildRenewedContractRecord({
          contract,
          principalAmount,
          interestAmount,
          contractStartDate: actionCreatedAt,
          contractEndDate,
          durationDays,
          signedContractUrl: actionRequest.pawner_signature_url || contract.signed_contract_url,
        }))
        .select()
        .single();

      if (newContractError || !newContract) {
        console.error('Error creating renewed contract:', newContractError);
        return NextResponse.json(
          { error: 'Failed to create renewed contract' },
          { status: 500 }
        );
      }

      await supabase
        .from('contracts')
        .update({
          contract_status: 'COMPLETED',
          completed_at: now.toISOString(),
          last_action_date: now.toISOString(),
          last_action_type: actionRequest.request_type,
        })
        .eq('contract_id', contract.contract_id);

      updateData.request_status = 'COMPLETED';
      updateData.completed_at = now.toISOString();
      updateData.updated_at = now.toISOString();

      await supabase
        .from('contract_action_requests')
        .update(updateData)
        .eq('request_id', requestId);

      // Log success
      await logContractAction(
        actionRequest.contract_id,
        'SLIP_VERIFIED',
        'COMPLETED',
        'INVESTOR',
        investorLineId,
        {
          actionRequestId: requestId,
          slipUrl,
          slipAmountDetected: verificationResult.detectedAmount,
          description: `Investor slip verified. Detected: ${verificationResult.detectedAmount}, Expected: ${expectedAmount}`,
        }
      );

      await logContractAction(
        actionRequest.contract_id,
        actionRequest.request_type,
        'COMPLETED',
        'SYSTEM',
        null,
        {
          actionRequestId: requestId,
          amount: totalPaidNow,
          principalBefore: contract.current_principal_amount || contract.loan_principal_amount,
          principalAfter: principalAmount,
          contractEndDateBefore: contract.contract_end_date,
          contractEndDateAfter: contractEndDate.toISOString(),
          description: 'Principal increase completed after investor transfer',
          metadata: {
            newContractId: newContract.contract_id,
            newContractNumber: newContract.contract_number,
          },
        }
      );

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
          `สัญญาเดิม ${contract.contract_number} ถูกปิด และสร้างสัญญาใหม่เลขที่ ${newContract.contract_number}`,
        ];

        try {
          await pawnerLineClient.pushMessage(pawner.line_id, {
            type: 'text',
            text: messageLines.join('\n\n')
          });
        } catch (err) {
          console.error('Error sending message to pawner:', err);
        }
      }

      return NextResponse.json({
        success: true,
        result: verificationResult.result,
        message: 'ตรวจสอบสลิปสำเร็จ และสร้างสัญญาใหม่เรียบร้อยแล้ว',
        detectedAmount: verificationResult.detectedAmount,
        newContractId: newContract.contract_id,
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

  } catch (error: any) {
    console.error('Error verifying investor slip:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
