import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { logContractAction } from '@/lib/services/slip-verification';
import { Client, FlexMessage } from '@line/bot-sdk';

// LINE clients
const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
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
  const platformFeeRate = params.contract.platform_fee_rate ?? 0.5;
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
    const { requestId, signatureUrl, pawnerLineId } = body;

    if (!requestId) {
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

    const contract = actionRequest.contract;
    const pawner = contract?.pawners;
    const investor = contract?.investors;

    // Check if already completed (idempotency)
    if (actionRequest.request_status === 'COMPLETED') {
      return NextResponse.json({
        success: true,
        message: 'ดำเนินการสำเร็จแล้ว',
        alreadyCompleted: true,
        actionType: actionRequest.request_type,
      });
    }

    // For PRINCIPAL_INCREASE, this is called after investor payment verification
    // For others, this is called after slip verification and signing
    if (actionRequest.request_type === 'PRINCIPAL_INCREASE') {
      // Check if investor has approved and paid
      const validStatuses = ['INVESTOR_SLIP_VERIFIED', 'AWAITING_PAWNER_CONFIRM', 'INVESTOR_TRANSFERRED'];
      if (!validStatuses.includes(actionRequest.request_status)) {
        return NextResponse.json(
          { error: 'คำขอยังไม่พร้อมดำเนินการ กรุณารอการอนุมัติจากนักลงทุน' },
          { status: 400 }
        );
      }
    } else {
      // For INTEREST_PAYMENT and PRINCIPAL_REDUCTION
      const validStatuses = ['SLIP_VERIFIED', 'AWAITING_SIGNATURE'];
      if (!validStatuses.includes(actionRequest.request_status)) {
        if (actionRequest.request_status === 'SLIP_REJECTED' || actionRequest.request_status === 'SLIP_REJECTED_FINAL') {
          return NextResponse.json(
            { error: 'สลิปถูกปฏิเสธ กรุณาอัปโหลดสลิปใหม่' },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: 'คำขอยังไม่พร้อมดำเนินการ กรุณาอัปโหลดสลิปก่อน' },
          { status: 400 }
        );
      }
    }

    // Update signature if provided
    if (signatureUrl) {
      await supabase
        .from('contract_action_requests')
        .update({
          signature_url: signatureUrl,
          signed_at: new Date().toISOString(),
        })
        .eq('request_id', requestId);
    }

    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const actionCreatedAt = actionRequest.created_at ? new Date(actionRequest.created_at) : now;
    const contractEndDate = new Date(contract.contract_end_date);
    let newContractPayload: {
      principalAmount: number;
      interestAmount: number;
      contractStartDate: Date;
      contractEndDate: Date;
      durationDays: number;
      signedContractUrl?: string | null;
    } | null = null;
    let notificationMessage = '';

    switch (actionRequest.request_type) {
      case 'INTEREST_PAYMENT': {
        const principalAmount = Number(contract.current_principal_amount || contract.loan_principal_amount || 0);
        const interestAmount = Number(contract.interest_amount || actionRequest.interest_to_pay || 0);
        const contractStartDate = new Date(contract.contract_end_date);
        const originalStartDate = new Date(contract.contract_start_date);
        const originalDurationDays = Math.max(0, Math.ceil((contractEndDate.getTime() - originalStartDate.getTime()) / msPerDay));
        const durationDays = originalDurationDays || Number(contract.contract_duration_days || 0);
        const contractEndDateNew = new Date(contractStartDate);
        contractEndDateNew.setDate(contractEndDateNew.getDate() + durationDays);

        newContractPayload = {
          principalAmount,
          interestAmount,
          contractStartDate,
          contractEndDate: contractEndDateNew,
          durationDays,
          signedContractUrl: signatureUrl || actionRequest.signature_url || contract.signed_contract_url,
        };

        notificationMessage = `ต่อดอกเบี้ยเรียบร้อย\n\nสัญญาเดิม: ${contract.contract_number}\nสัญญาใหม่: (กำลังสร้าง)\nดอกเบี้ยที่ชำระ: ${Number(actionRequest.interest_to_pay || 0).toLocaleString()} บาท\nเริ่มสัญญาใหม่: ${contractStartDate.toLocaleDateString('th-TH')}\nครบกำหนดใหม่: ${contractEndDateNew.toLocaleDateString('th-TH')}`;
        break;
      }

      case 'PRINCIPAL_REDUCTION': {
        const principalAmount = Number(actionRequest.principal_after_reduction || contract.current_principal_amount || contract.loan_principal_amount || 0);
        const dailyRate = Number(actionRequest.daily_interest_rate || 0) || Number(contract.interest_rate || 0) / 30;
        const remainingDays = Math.max(0, Math.ceil((contractEndDate.getTime() - actionCreatedAt.getTime()) / msPerDay));
        const interestRemaining = round2(principalAmount * dailyRate * remainingDays);
        const interestAmount = interestRemaining;
        const durationDays = remainingDays;

        newContractPayload = {
          principalAmount,
          interestAmount,
          contractStartDate: actionCreatedAt,
          contractEndDate,
          durationDays,
          signedContractUrl: signatureUrl || actionRequest.signature_url || contract.signed_contract_url,
        };

        notificationMessage = `ลดเงินต้นเรียบร้อย\n\nสัญญาเดิม: ${contract.contract_number}\nสัญญาใหม่: (กำลังสร้าง)\nเงินต้นใหม่: ${principalAmount.toLocaleString()} บาท\nดอกเบี้ยในสัญญาใหม่: ${interestAmount.toLocaleString()} บาท`;
        break;
      }

      case 'PRINCIPAL_INCREASE': {
        const principalAmount = Number(actionRequest.principal_after_increase || contract.current_principal_amount || contract.loan_principal_amount || 0);
        const dailyRate = Number(actionRequest.daily_interest_rate || 0) || Number(contract.interest_rate || 0) / 30;
        const remainingDays = Math.max(0, Math.ceil((contractEndDate.getTime() - actionCreatedAt.getTime()) / msPerDay));
        const interestRemaining = round2(principalAmount * dailyRate * remainingDays);
        const interestAmount = interestRemaining;
        const durationDays = remainingDays;

        newContractPayload = {
          principalAmount,
          interestAmount,
          contractStartDate: actionCreatedAt,
          contractEndDate,
          durationDays,
          signedContractUrl: actionRequest.pawner_signature_url || signatureUrl || contract.signed_contract_url,
        };

        notificationMessage = `เพิ่มเงินต้นเรียบร้อย\n\nสัญญาเดิม: ${contract.contract_number}\nสัญญาใหม่: (กำลังสร้าง)\nเงินต้นใหม่: ${principalAmount.toLocaleString()} บาท\nดอกเบี้ยในสัญญาใหม่: ${interestAmount.toLocaleString()} บาท`;
        break;
      }
    }

    if (!newContractPayload) {
      return NextResponse.json(
        { error: 'Invalid action type' },
        { status: 400 }
      );
    }

    const { data: newContract, error: newContractError } = await supabase
      .from('contracts')
      .insert(buildRenewedContractRecord({ contract, ...newContractPayload }))
      .select()
      .single();

    if (newContractError || !newContract) {
      console.error('Error creating renewed contract:', newContractError);
      return NextResponse.json(
        { error: 'Failed to create renewed contract' },
        { status: 500 }
      );
    }

    const resolvedMessage = notificationMessage.replace('(กำลังสร้าง)', newContract.contract_number);

    // Close old contract
    await supabase
      .from('contracts')
      .update({
        contract_status: 'COMPLETED',
        completed_at: now.toISOString(),
        last_action_date: now.toISOString(),
        last_action_type: actionRequest.request_type,
        updated_at: now.toISOString(),
      })
      .eq('contract_id', actionRequest.contract_id);

    // Mark request as completed
    await supabase
      .from('contract_action_requests')
      .update({
        request_status: 'COMPLETED',
        completed_at: now.toISOString(),
      })
      .eq('request_id', requestId);

    // Log completion
    await logContractAction(
      actionRequest.contract_id,
      actionRequest.request_type,
      'COMPLETED',
      'PAWNER',
      pawnerLineId,
      {
        actionRequestId: requestId,
        amount: actionRequest.total_amount,
        principalBefore: contract.current_principal_amount || contract.loan_principal_amount,
        principalAfter: newContractPayload.principalAmount,
        contractEndDateBefore: contract.contract_end_date,
        contractEndDateAfter: newContractPayload.contractEndDate.toISOString(),
        description: `${actionRequest.request_type} completed successfully`,
        metadata: {
          newContractId: newContract.contract_id,
          newContractNumber: newContract.contract_number,
        },
      }
    );

    // Send notifications
    // To Pawner
    if (pawner?.line_id) {
      try {
        await pawnerLineClient.pushMessage(pawner.line_id, {
          type: 'text',
          text: resolvedMessage
        });
      } catch (err) {
        console.error('Error sending to pawner:', err);
      }
    }

    // To Investor
    if (investor?.line_id) {
      try {
        await investorLineClient.pushMessage(investor.line_id, {
          type: 'text',
          text: resolvedMessage
        });
      } catch (err) {
        console.error('Error sending to investor:', err);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'ดำเนินการสำเร็จ',
      actionType: actionRequest.request_type,
      newContract,
    });

  } catch (error: any) {
    console.error('Error completing action:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
