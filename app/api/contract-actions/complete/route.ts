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

    // For PRINCIPAL_INCREASE, this is called after investor payment verification
    // For others, this is called after slip verification and signing
    if (actionRequest.request_type === 'PRINCIPAL_INCREASE') {
      // Check if investor has approved and paid
      if (actionRequest.request_status !== 'INVESTOR_SLIP_VERIFIED' && actionRequest.request_status !== 'AWAITING_PAWNER_CONFIRM') {
        return NextResponse.json(
          { error: 'Request is not ready for completion' },
          { status: 400 }
        );
      }
    } else {
      // For INTEREST_PAYMENT and PRINCIPAL_REDUCTION
      if (actionRequest.request_status !== 'SLIP_VERIFIED' && actionRequest.request_status !== 'AWAITING_SIGNATURE') {
        return NextResponse.json(
          { error: 'Request is not ready for completion' },
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

    // Update contract based on action type
    let contractUpdate: any = {
      last_action_date: new Date().toISOString(),
      last_action_type: actionRequest.request_type,
      updated_at: new Date().toISOString(),
    };

    let notificationMessage = '';

    switch (actionRequest.request_type) {
      case 'INTEREST_PAYMENT': {
        // ต่อดอกเบี้ย - ขยายวันครบกำหนด
        contractUpdate.contract_end_date = actionRequest.new_end_date;
        contractUpdate.extension_count = (contract.extension_count || 0) + 1;
        contractUpdate.total_interest_paid = (contract.total_interest_paid || 0) + actionRequest.interest_to_pay;

        notificationMessage = `สัญญาหมายเลข ${contract.contract_number} ได้รับการต่อดอกเบี้ยเรียบร้อยแล้ว\n\nสินค้า: ${contract.items?.brand} ${contract.items?.model}\nดอกเบี้ยที่ชำระ: ${actionRequest.interest_to_pay?.toLocaleString()} บาท\nขยายสัญญาถึง: ${new Date(actionRequest.new_end_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`;
        break;
      }

      case 'PRINCIPAL_REDUCTION': {
        // ลดเงินต้น
        const principalBefore = contract.current_principal_amount || contract.loan_principal_amount;
        const principalAfter = actionRequest.principal_after_reduction;

        contractUpdate.current_principal_amount = principalAfter;
        contractUpdate.loan_principal_amount = principalAfter;
        contractUpdate.total_principal_reduced = (contract.total_principal_reduced || 0) + actionRequest.reduction_amount;
        contractUpdate.total_interest_paid = (contract.total_interest_paid || 0) + actionRequest.interest_for_period;

        // Recalculate interest amount for remaining period
        const dailyRate = actionRequest.daily_interest_rate;
        const daysRemaining = actionRequest.days_remaining;
        contractUpdate.interest_amount = Math.round(principalAfter * dailyRate * daysRemaining * 100) / 100;

        notificationMessage = `สัญญาหมายเลข ${contract.contract_number} ได้ลดเงินต้นเรียบร้อยแล้ว\n\nสินค้า: ${contract.items?.brand} ${contract.items?.model}\nเงินต้นเดิม: ${principalBefore.toLocaleString()} บาท\nลดเงินต้น: ${actionRequest.reduction_amount?.toLocaleString()} บาท\nเงินต้นใหม่: ${principalAfter.toLocaleString()} บาท\nดอกเบี้ยที่ชำระ: ${actionRequest.interest_for_period?.toLocaleString()} บาท`;
        break;
      }

      case 'PRINCIPAL_INCREASE': {
        // เพิ่มเงินต้น
        const principalBefore = contract.current_principal_amount || contract.loan_principal_amount;
        const principalAfter = actionRequest.principal_after_increase;

        contractUpdate.current_principal_amount = principalAfter;
        contractUpdate.loan_principal_amount = principalAfter;
        contractUpdate.total_principal_increased = (contract.total_principal_increased || 0) + actionRequest.increase_amount;

        // Recalculate interest amount for remaining period
        const dailyRate = actionRequest.daily_interest_rate;
        const daysRemaining = actionRequest.days_remaining;
        contractUpdate.interest_amount = Math.round(principalAfter * dailyRate * daysRemaining * 100) / 100;

        notificationMessage = `สัญญาหมายเลข ${contract.contract_number} ได้เพิ่มเงินต้นเรียบร้อยแล้ว\n\nสินค้า: ${contract.items?.brand} ${contract.items?.model}\nเงินต้นเดิม: ${principalBefore.toLocaleString()} บาท\nเพิ่มเงินต้น: ${actionRequest.increase_amount?.toLocaleString()} บาท\nเงินต้นใหม่: ${principalAfter.toLocaleString()} บาท`;
        break;
      }
    }

    // Update contract
    await supabase
      .from('contracts')
      .update(contractUpdate)
      .eq('contract_id', actionRequest.contract_id);

    // Mark request as completed
    await supabase
      .from('contract_action_requests')
      .update({
        request_status: 'COMPLETED',
        completed_at: new Date().toISOString(),
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
        principalAfter: contractUpdate.current_principal_amount,
        contractEndDateBefore: contract.contract_end_date,
        contractEndDateAfter: contractUpdate.contract_end_date,
        description: `${actionRequest.request_type} completed successfully`,
      }
    );

    // Send notifications
    // To Pawner
    if (pawner?.line_id) {
      try {
        await pawnerLineClient.pushMessage(pawner.line_id, {
          type: 'text',
          text: notificationMessage
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
          text: notificationMessage
        });
      } catch (err) {
        console.error('Error sending to investor:', err);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'ดำเนินการสำเร็จ',
      actionType: actionRequest.request_type,
      contractUpdate,
    });

  } catch (error: any) {
    console.error('Error completing action:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
