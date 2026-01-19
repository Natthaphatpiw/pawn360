import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { logContractAction } from '@/lib/services/slip-verification';
import { Client, FlexMessage } from '@line/bot-sdk';

// Investor LINE OA client
const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
});

// สร้าง action request ใหม่
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      contractId,
      actionType,
      amount,
      reductionAmount,
      increaseAmount,
      pawnerLineId,
      termsAccepted,
      pawnerSignatureUrl,
      pawnerBankAccount,
    } = body;

    if (!contractId || !actionType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!termsAccepted) {
      return NextResponse.json(
        { error: 'กรุณายอมรับข้อตกลงและเงื่อนไข' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get contract details
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        *,
        items:item_id (*),
        pawners:customer_id (*),
        investors:investor_id (*)
      `)
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Verify pawner
    if (pawnerLineId && contract.pawners?.line_id !== pawnerLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Check for existing pending request
    const { data: existingRequest } = await supabase
      .from('contract_action_requests')
      .select('request_id')
      .eq('contract_id', contractId)
      .in('request_status', ['PENDING', 'AWAITING_PAYMENT', 'SLIP_UPLOADED', 'AWAITING_SIGNATURE', 'AWAITING_INVESTOR_APPROVAL', 'AWAITING_INVESTOR_PAYMENT', 'AWAITING_PAWNER_CONFIRM'])
      .single();

    if (existingRequest) {
      return NextResponse.json(
        { error: 'มีคำขอที่รอดำเนินการอยู่แล้ว กรุณารอจนกว่าจะเสร็จสิ้น' },
        { status: 400 }
      );
    }

    const round2 = (value: number) => Math.round(value * 100) / 100;
    const msPerDay = 1000 * 60 * 60 * 24;

    // Calculate details (count start date as day 1)
    const startDate = new Date(contract.contract_start_date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(contract.contract_end_date);
    endDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rawDaysInContract = Number(contract.contract_duration_days || 0)
      || Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay);
    const daysInContract = Math.max(1, rawDaysInContract);
    const rawDaysElapsed = Math.floor((today.getTime() - startDate.getTime()) / msPerDay) + 1;
    const daysElapsed = Math.min(daysInContract, Math.max(1, rawDaysElapsed));
    const daysRemaining = Math.max(0, daysInContract - daysElapsed);

    const rawRate = Number(contract.interest_rate || 0);
    const monthlyInterestRate = rawRate > 1 ? rawRate / 100 : rawRate;
    const feeRate = 0.01;
    const interestRateForAccrual = Math.max(0, monthlyInterestRate - feeRate);
    const dailyInterestRate = interestRateForAccrual / 30;
    const currentPrincipal = contract.current_principal_amount || contract.loan_principal_amount;
    const feeBase = contract.original_principal_amount || contract.loan_principal_amount || currentPrincipal;
    const feeAmount = round2(feeBase * feeRate * (daysInContract / 30));
    const interestAccrued = round2(currentPrincipal * dailyInterestRate * daysElapsed);
    const interestAccruedWithFee = round2(interestAccrued + feeAmount);

    let requestData: any = {
      contract_id: contractId,
      request_type: actionType,
      request_status: 'AWAITING_PAYMENT',
      principal_before: currentPrincipal,
      interest_rate: monthlyInterestRate,
      daily_interest_rate: dailyInterestRate,
      contract_start_date: contract.contract_start_date,
      contract_end_date_before: contract.contract_end_date,
      days_in_contract: daysInContract,
      days_elapsed: daysElapsed,
      days_remaining: daysRemaining,
      interest_accrued: interestAccrued,
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
    };

    switch (actionType) {
      case 'INTEREST_PAYMENT': {
        const interestToPay = interestAccruedWithFee;

        const newEndDate = new Date(today);
        newEndDate.setDate(newEndDate.getDate() + daysInContract);

        requestData = {
          ...requestData,
          interest_to_pay: interestToPay,
          total_amount: interestToPay,
          new_end_date: newEndDate.toISOString().split('T')[0],
        };
        break;
      }

      case 'PRINCIPAL_REDUCTION': {
        const reductionAmt = Number(reductionAmount ?? amount ?? 0);

        if (reductionAmt <= 0 || reductionAmt > currentPrincipal) {
          return NextResponse.json(
            { error: 'จำนวนเงินที่ต้องการลดไม่ถูกต้อง' },
            { status: 400 }
          );
        }

        const interestForPeriod = interestAccruedWithFee;
        const totalToPay = reductionAmt + interestForPeriod;
        const principalAfterReduction = currentPrincipal - reductionAmt;
        const newFeeAmount = round2(principalAfterReduction * feeRate * (daysInContract / 30));
        const newInterestForRemaining = round2(principalAfterReduction * dailyInterestRate * daysInContract + newFeeAmount);

        requestData = {
          ...requestData,
          reduction_amount: reductionAmt,
          interest_for_period: interestForPeriod,
          total_to_pay_reduction: totalToPay,
          total_amount: totalToPay,
          principal_after_reduction: principalAfterReduction,
          new_interest_for_remaining: newInterestForRemaining,
        };
        break;
      }

      case 'PRINCIPAL_INCREASE': {
        const increaseAmt = Number(increaseAmount ?? amount ?? 0);
        const itemValue = contract.items?.estimated_value || currentPrincipal * 1.5;
        const maxIncrease = Math.max(0, itemValue - currentPrincipal);

        if (increaseAmt <= 0 || increaseAmt > maxIncrease) {
          return NextResponse.json(
            { error: `จำนวนเงินที่ต้องการเพิ่มไม่ถูกต้อง สูงสุด ${maxIncrease.toLocaleString()} บาท` },
            { status: 400 }
          );
        }

        if (!pawnerSignatureUrl) {
          return NextResponse.json(
            { error: 'กรุณาเซ็นลายเซ็นเพื่อยืนยันคำขอ' },
            { status: 400 }
          );
        }

        if (!pawnerBankAccount?.bank_name || !pawnerBankAccount?.bank_account_no || !pawnerBankAccount?.bank_account_name) {
          return NextResponse.json(
            { error: 'กรุณากรอกข้อมูลบัญชีธนาคารให้ครบถ้วน' },
            { status: 400 }
          );
        }

        const { error: bankUpdateError } = await supabase
          .from('pawners')
          .update({
            bank_name: pawnerBankAccount.bank_name,
            bank_account_no: pawnerBankAccount.bank_account_no,
            bank_account_name: pawnerBankAccount.bank_account_name,
            updated_at: new Date().toISOString(),
          })
          .eq('customer_id', contract.customer_id);

        if (bankUpdateError) {
          console.error('Error updating pawner bank info:', bankUpdateError);
          return NextResponse.json(
            { error: 'ไม่สามารถบันทึกบัญชีธนาคารได้' },
            { status: 500 }
          );
        }

        const interestForPeriod = interestAccruedWithFee;
        const principalAfterIncrease = currentPrincipal + increaseAmt;
        const newFeeAmount = round2(principalAfterIncrease * feeRate * (daysInContract / 30));
        const newInterestForRemaining = round2(principalAfterIncrease * dailyInterestRate * daysInContract + newFeeAmount);
        const totalToPayNow = interestForPeriod;
        const nextStatus = 'AWAITING_PAYMENT';

        requestData = {
          ...requestData,
          request_status: nextStatus,
          increase_amount: increaseAmt,
          interest_for_period: interestForPeriod,
          principal_after_increase: principalAfterIncrease,
          new_interest_for_remaining_increase: newInterestForRemaining,
          total_amount: totalToPayNow,
          pawner_signature_url: pawnerSignatureUrl,
          pawner_bank_name: pawnerBankAccount.bank_name,
          pawner_bank_account_no: pawnerBankAccount.bank_account_no,
          pawner_bank_account_name: pawnerBankAccount.bank_account_name,
        };
        break;
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action type' },
          { status: 400 }
        );
    }

    // Create request
    const { data: actionRequest, error: createError } = await supabase
      .from('contract_action_requests')
      .insert(requestData)
      .select()
      .single();

    if (createError) {
      console.error('Error creating action request:', createError);
      return NextResponse.json(
        { error: 'Failed to create action request' },
        { status: 500 }
      );
    }

    // Log the action
    await logContractAction(
      contractId,
      actionType,
      'INITIATED',
      'PAWNER',
      pawnerLineId,
      {
        actionRequestId: actionRequest.request_id,
        amount: requestData.total_amount,
        principalBefore: currentPrincipal,
        description: `Pawner initiated ${actionType}`,
        metadata: {
          interestPaymentOption: 'PAY_NOW',
        },
      }
    );

    // Send notification to investor for PRINCIPAL_INCREASE
    if (actionType === 'PRINCIPAL_INCREASE' && contract.investors?.line_id && requestData.request_status === 'PENDING_INVESTOR_APPROVAL') {
      try {
        const approvalCard = createInvestorApprovalCard(actionRequest, contract);
        await investorLineClient.pushMessage(contract.investors.line_id, approvalCard);
      } catch (err) {
        console.error('Error sending message to investor:', err);
      }
    }

    return NextResponse.json({
      success: true,
      requestId: actionRequest.request_id,
      actionType,
      totalAmount: requestData.total_amount,
      message: 'สร้างคำขอสำเร็จ',
    });

  } catch (error: any) {
    console.error('Error creating action request:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function createInvestorApprovalCard(actionRequest: any, contract: any): FlexMessage {
  const item = contract?.items;
  const pawner = contract?.pawners;
  const increaseAmount = Number(actionRequest.increase_amount || 0);
  const newPrincipal = actionRequest.principal_after_increase;
  const rawInterestRate = Number(contract?.interest_rate || 0);
  const normalizedInterestRate = rawInterestRate > 1 ? rawInterestRate / 100 : rawInterestRate;
  const platformFeeRate = typeof contract?.platform_fee_rate === 'number'
    ? contract.platform_fee_rate
    : 0.5;
  const investorShare = Math.max(0, 1 - platformFeeRate);
  const additionalMonthlyInterest = Math.round(increaseAmount * normalizedInterestRate * investorShare * 100) / 100;
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
            text: `${item?.brand || ''} ${item?.model || ''}`,
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
                  { type: 'text', text: 'ผู้จำนำ:', color: '#666666', size: 'sm', flex: 2 },
                  { type: 'text', text: `${pawner?.firstname || ''} ${pawner?.lastname || ''}`, color: '#333333', size: 'sm', flex: 3, weight: 'bold' }
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
