import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { uploadSignatureToS3 } from '@/lib/aws/s3';
import { Client, FlexMessage } from '@line/bot-sdk';

const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || 'vkhbKJj/xMWX9RWJUPOfr6cfNa5N+jJhp7AX1vpK4poDpkCF4dy/3cPGy4+rmATi0KE9tD/ewmtYLd7nv+0651xY5L7Guy8LGvL1vhc9yuXWFy9wuGPvDQFGfWeva5WFPv2go4BrpP1j+ux63XjsEwdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || 'ed704b15d57c8b84f09ebc3492f9339c'
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      loanRequestId,
      itemId,
      accepted,
      signature,
      lineId
    } = body;

    if (!loanRequestId || !itemId || !accepted || !signature || !lineId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // 1. Get loan request and item data
    const { data: loanRequest, error: loanRequestError } = await supabase
      .from('loan_requests')
      .select(`
        *,
        items:item_id (*),
        pawners:customer_id (*),
        drop_points:drop_point_id (*)
      `)
      .eq('request_id', loanRequestId)
      .single();

    if (loanRequestError || !loanRequest) {
      return NextResponse.json(
        { error: 'Loan request not found' },
        { status: 404 }
      );
    }

    // 2. Upload signature to S3
    const contractId = `CTR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    let signedContractUrl = null;

    try {
      signedContractUrl = await uploadSignatureToS3(contractId, signature);
      console.log('Signature uploaded to S3:', signedContractUrl);
    } catch (s3Error) {
      console.error('Failed to upload signature to S3:', s3Error);
      // Continue without signature URL for now
    }

    // 3. Create contract record
    const contractStartDate = new Date();
    const contractEndDate = new Date();
    contractEndDate.setDate(contractStartDate.getDate() + loanRequest.requested_duration_days);

    const interestRate = 0.03; // 3% per month
    const interestAmount = loanRequest.requested_amount * interestRate;
    const platformFeeAmount = interestAmount * 0.1; // 10% of interest
    const totalAmount = loanRequest.requested_amount + interestAmount;

    const contractRecord = {
      contract_id: contractId,
      contract_number: contractId,
      customer_id: loanRequest.customer_id,
      investor_id: null, // Will be assigned when investor accepts
      drop_point_id: loanRequest.drop_point_id,
      item_id: loanRequest.item_id,
      loan_request_id: loanRequest.request_id,
      contract_start_date: contractStartDate.toISOString(),
      contract_end_date: contractEndDate.toISOString(),
      contract_duration_days: loanRequest.requested_duration_days,
      loan_principal_amount: loanRequest.requested_amount,
      interest_rate: interestRate,
      interest_amount: interestAmount,
      total_amount: totalAmount,
      platform_fee_rate: 0.1,
      platform_fee_amount: platformFeeAmount,
      contract_status: 'PENDING_SIGNATURE',
      funding_status: 'PENDING',
      signed_contract_url: signedContractUrl,
    };

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert(contractRecord)
      .select()
      .single();

    if (contractError || !contract) {
      console.error('Error creating contract:', contractError);
      return NextResponse.json(
        { error: 'Failed to create contract' },
        { status: 500 }
      );
    }

    // 4. Update item status
    await supabase
      .from('items')
      .update({ item_status: 'IN_CONTRACT' })
      .eq('item_id', itemId);

    // 5. Update loan request status
    await supabase
      .from('loan_requests')
      .update({ request_status: 'OFFER_ACCEPTED' })
      .eq('request_id', loanRequestId);

    // 6. Send LINE offer cards to all active investors
    try {
      const { data: investors } = await supabase
        .from('investors')
        .select('investor_id, line_id, firstname, lastname')
        .eq('is_active', true)
        .eq('is_blocked', false);

      if (investors && investors.length > 0) {
        const offerCard = createPawnOfferCard(contract, loanRequest);

        for (const investor of investors) {
          try {
            await investorLineClient.pushMessage(investor.line_id, offerCard);
            console.log(`Sent offer card to investor ${investor.line_id}`);
          } catch (msgError) {
            console.error(`Failed to send offer to investor ${investor.line_id}:`, msgError);
          }
        }
      }
    } catch (investorError) {
      console.error('Error sending offers to investors:', investorError);
      // Don't fail the contract creation if messaging fails
    }

    return NextResponse.json({
      success: true,
      contractId: contract.contract_id,
      message: 'Contract created successfully and offers sent to investors',
    });

  } catch (error: any) {
    console.error('Error in contract creation:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function createPawnOfferCard(contract: any, loanRequest: any) {
  const card = {
    type: 'flex' as const,
    altText: 'ข้อเสนอจำนำ',
    contents: {
      type: 'bubble' as const,
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'ข้อเสนอจำนำ',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
        }],
        backgroundColor: '#C0562F',
        paddingAll: 'lg',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'image',
          url: loanRequest.items?.image_urls?.[0] || 'https://via.placeholder.com/300x300?text=No+Image',
          size: 'full',
          aspectRatio: '1:1',
          aspectMode: 'cover',
        }, {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'วงเงิน:', color: '#666666', size: 'sm', flex: 0 },
                { type: 'text', text: `${contract.loan_principal_amount.toLocaleString()} บาท`, color: '#1DB446', size: 'md', weight: 'bold', flex: 0, align: 'end' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ระยะเวลา:', color: '#666666', size: 'sm', flex: 0 },
                { type: 'text', text: `${contract.contract_duration_days} วัน`, color: '#666666', size: 'md', weight: 'bold', flex: 0, align: 'end' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ดอกเบี้ย:', color: '#666666', size: 'sm', flex: 0 },
                { type: 'text', text: `${contract.interest_amount.toLocaleString()} บาท`, color: '#666666', size: 'md', weight: 'bold', flex: 0, align: 'end' }
              ]
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              margin: 'md',
              contents: [
                { type: 'text', text: 'ยอดสุทธิ:', color: '#666666', size: 'sm', flex: 0 },
                { type: 'text', text: `${contract.total_amount.toLocaleString()} บาท`, color: '#E91E63', size: 'xl', weight: 'bold', flex: 0, align: 'end' }
              ]
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
            type: 'uri',
            label: 'ดูข้อเสนอ',
            uri: `https://liff.line.me/2008641671-O4zZnvW9/offer-detail?contractId=${contract.contract_id}`
          },
          style: 'primary',
          color: '#1DB446'
        }, {
          type: 'button',
          action: {
            type: 'postback',
            label: 'ปฏิเสธ',
            data: `action=decline_offer&contractId=${contract.contract_id}`
          },
          style: 'secondary',
          color: '#E91E63'
        }]
      }
    }
  };

  return card as FlexMessage;
}