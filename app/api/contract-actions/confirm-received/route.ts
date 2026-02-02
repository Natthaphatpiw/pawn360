import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { logContractAction } from '@/lib/services/slip-verification';
import { refreshInvestorTierAndTotals } from '@/lib/services/investor-tier';
import { Client } from '@line/bot-sdk';

// Investor LINE OA client
const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
});

const round2 = (value: number) => Math.round(value * 100) / 100;
const msPerDay = 1000 * 60 * 60 * 24;

const toUtcDateOnly = (value: string | Date) => {
  const source = new Date(value);
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
};

const addUtcDays = (value: Date, days: number) => {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

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
  const platformFeeRate = params.contract.platform_fee_rate ?? 0.01;
  const platformFeeAmount = round2(params.principalAmount * platformFeeRate * (params.durationDays / 30));
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
    total_amount: round2(params.principalAmount + params.interestAmount + platformFeeAmount),
    platform_fee_rate: platformFeeRate,
    platform_fee_amount: platformFeeAmount,
    investor_rate: params.contract.investor_rate,
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
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json(
        { error: 'Missing request ID' },
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

    // Check if already completed (idempotency)
    if (actionRequest.request_status === 'COMPLETED') {
      return NextResponse.json({
        success: true,
        message: 'ยืนยันรับเงินเรียบร้อยแล้ว',
        alreadyCompleted: true,
        newPrincipal: actionRequest.principal_after_increase,
      });
    }

    if (actionRequest.request_status !== 'INVESTOR_TRANSFERRED') {
      if (actionRequest.request_status === 'AWAITING_INVESTOR_PAYMENT' || actionRequest.request_status === 'INVESTOR_APPROVED') {
        return NextResponse.json(
          { error: 'กรุณารอนักลงทุนโอนเงินก่อน' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'สถานะคำขอไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' },
        { status: 400 }
      );
    }

    const contract = actionRequest.contract;
    const investor = contract?.investors;
    const now = new Date();
    const contractEndDate = toUtcDateOnly(contract.contract_end_date);
    const contractStartDateOriginal = toUtcDateOnly(contract.contract_start_date);
    const rawRate = Number(contract.interest_rate || 0);
    const monthlyInterestRate = rawRate > 1 ? rawRate / 100 : rawRate;
    const rawDurationDays = Number(contract.contract_duration_days || 0)
      || Math.ceil((contractEndDate.getTime() - contractStartDateOriginal.getTime()) / msPerDay);
    const durationDays = Math.max(1, rawDurationDays);
    const principalAmount = Number(actionRequest.principal_after_increase || contract.current_principal_amount || contract.loan_principal_amount || 0);
    const contractStartDate = new Date(contractEndDate);
    const contractEndDateNew = addUtcDays(contractStartDate, durationDays);
    const interestAmount = round2(principalAmount * monthlyInterestRate * (durationDays / 30));

    const { data: newContract, error: newContractError } = await supabase
      .from('contracts')
      .insert(buildRenewedContractRecord({
        contract,
        principalAmount,
        interestAmount,
        contractStartDate,
        contractEndDate: contractEndDateNew,
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

    // Update action request
    await supabase
      .from('contract_action_requests')
      .update({
        request_status: 'COMPLETED',
        completed_at: now.toISOString(),
        pawner_confirmed_at: now.toISOString(),
      })
      .eq('request_id', requestId);

    if (contract?.investor_id) {
      try {
        await refreshInvestorTierAndTotals(contract.investor_id);
      } catch (refreshError) {
        console.error('Error refreshing investor totals:', refreshError);
      }
    }

    // Log completion
    await logContractAction(
      actionRequest.contract_id,
      'PRINCIPAL_INCREASE',
      'COMPLETED',
      'PAWNER',
      null,
      {
        actionRequestId: requestId,
        principalBefore: contract?.current_principal_amount || contract?.principal_amount,
        principalAfter: principalAmount,
        amount: actionRequest.increase_amount,
        description: `Principal increased from ${contract?.current_principal_amount || contract?.principal_amount} to ${principalAmount}`,
        metadata: {
          newContractId: newContract.contract_id,
          newContractNumber: newContract.contract_number,
          completionSource: 'PAWNER_CONFIRM_RECEIVED',
        },
      }
    );

    // Notify investor
    if (investor?.line_id) {
      try {
        await investorLineClient.pushMessage(investor.line_id, {
          type: 'text',
          text: `ผู้จำนำยืนยันรับเงินแล้ว\n\nสัญญาเดิม: ${contract?.contract_number}\nสัญญาใหม่: ${newContract.contract_number}\nเงินต้นใหม่: ${principalAmount?.toLocaleString()} บาท\nเพิ่มขึ้น: ${actionRequest.increase_amount?.toLocaleString()} บาท\n\nดอกเบี้ยในสัญญาใหม่: ${interestAmount.toLocaleString()} บาท`
        });
      } catch (err) {
        console.error('Error sending message to investor:', err);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Principal increase completed',
      newContract,
    });

  } catch (error: any) {
    console.error('Error confirming received:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
