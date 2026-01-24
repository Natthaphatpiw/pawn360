import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client, FlexMessage } from '@line/bot-sdk';

// Pawner LINE OA client
const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contractId, investorLineId, amount, paymentSlipUrl } = body;

    if (!contractId || !investorLineId || !amount || !paymentSlipUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get investor by LINE ID
    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('investor_id, firstname, lastname')
      .eq('line_id', investorLineId)
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
        *,
        items:item_id (*),
        pawners:customer_id (*)
      `)
      .eq('contract_id', contractId)
      .eq('investor_id', investor.investor_id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found or not owned by this investor' },
        { status: 404 }
      );
    }

    const isConfirmed = contract.contract_status === 'CONFIRMED' || Boolean(contract.payment_confirmed_at);
    if (contract.payment_status === 'INVESTOR_PAID' || contract.payment_status === 'COMPLETED' || isConfirmed) {
      return NextResponse.json(
        { error: 'Payment already submitted for this contract' },
        { status: 409 }
      );
    }

    if (contract.funding_status && !['PENDING', 'FUNDED'].includes(contract.funding_status)) {
      return NextResponse.json(
        { error: 'Contract is not eligible for payment submission' },
        { status: 409 }
      );
    }

    const { data: existingPayments, error: existingPaymentsError } = await supabase
      .from('payments')
      .select('payment_id, payment_status')
      .eq('contract_id', contractId)
      .eq('payment_type', 'PRINCIPAL')
      .in('payment_status', ['PENDING', 'PROCESSING', 'COMPLETED'])
      .limit(1);

    if (existingPaymentsError) {
      console.error('Error checking existing payments:', existingPaymentsError);
      return NextResponse.json(
        { error: 'Failed to verify payment status' },
        { status: 500 }
      );
    }

    if (existingPayments && existingPayments.length > 0) {
      return NextResponse.json(
        { error: 'Payment already submitted for this contract' },
        { status: 409 }
      );
    }

    // Create payment record
    // payment_type: Valid values are PRINCIPAL, INTEREST, FULL_REPAYMENT, PARTIAL_REPAYMENT, LATE_FEE, EXTENSION_FEE
    // payment_status: Valid values are PENDING, PROCESSING, COMPLETED, FAILED, REFUNDED
    // Using 'PRINCIPAL' for investor loan disbursement to pawner
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        contract_id: contractId,
        payment_type: 'PRINCIPAL',
        amount: amount,
        payment_method: 'BANK_TRANSFER',
        payment_status: 'PENDING',
        paid_by_investor_id: investor.investor_id,
        payment_slip_url: paymentSlipUrl
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Error creating payment:', paymentError);
      return NextResponse.json(
        { error: 'Failed to create payment record' },
        { status: 500 }
      );
    }

    // Update contract status
    await supabase
      .from('contracts')
      .update({
        payment_status: 'INVESTOR_PAID',
        payment_slip_url: paymentSlipUrl,
        updated_at: new Date().toISOString()
      })
      .eq('contract_id', contractId);

    // Send notification to pawner for confirmation
    if (contract.pawners?.line_id) {
      const confirmationCard = createPaymentConfirmationCard(contract, payment, investor, paymentSlipUrl);
      try {
        await pawnerLineClient.pushMessage(contract.pawners.line_id, confirmationCard);
        console.log(`Sent payment confirmation request to pawner ${contract.pawners.line_id}`);
      } catch (msgError) {
        console.error('Error sending to pawner:', msgError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment submitted successfully',
      paymentId: payment.payment_id
    });

  } catch (error: any) {
    console.error('Error in investor payment:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function createPaymentConfirmationCard(contract: any, payment: any, investor: any, slipUrl: string): FlexMessage {
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
                { type: 'text', text: `${contract.items?.brand} ${contract.items?.model}`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
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
              text: `โอนโดย: ${investor.firstname} ${investor.lastname}`,
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
