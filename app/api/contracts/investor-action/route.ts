import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client, FlexMessage } from '@line/bot-sdk';

const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || 'vkhbKJj/xMWX9RWJUPOfr6cfNa5N+jJhp7AX1vpK4poDpkCF4dy/3cPGy4+rmATi0KE9tD/ewmtYLd7nv+0651xY5L7Guy8LGvL1vhc9yuXWFy9wuGPvDQFGfWeva5WFPv2go4BrpP1j+ux63XjsEwdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || 'ed704b15d57c8b84f09ebc3492f9339c'
});

const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'UeHWta6KPHXAUZCZFxJsgpVpF04yulZP+z3w7F/PO4Uzd2U0Rxl1VhuC4wSFIcPGZGNeYXkr6xSq1Ziz36RIgaM0O8xSk8+gJcYlmPBa1ONycwtKnkXk3UTohvHUgTvvA58l/1G9SiPerwDSZs3rewdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '8937117af202d6550b7ab212fdc54291'
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, contractId, lineId } = body; // Changed from investorId to lineId

    if (!action || !contractId || !lineId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get investor ID from LINE ID
    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('investor_id')
      .eq('line_id', lineId)
      .single();

    if (investorError || !investor) {
      return NextResponse.json(
        { error: 'Investor not found' },
        { status: 404 }
      );
    }

    const investorId = investor.investor_id;

    // Get contract details
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        *,
        items:item_id (*),
        pawners:customer_id (*),
        drop_points:drop_point_id (*)
      `)
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    if (action === 'accept') {
      // Update contract with investor
      await supabase
        .from('contracts')
        .update({
          investor_id: investorId,
          contract_status: 'ACTIVE',
          funding_status: 'FUNDED',
          funded_at: new Date().toISOString()
        })
        .eq('contract_id', contractId);

      // Update loan request
      await supabase
        .from('loan_requests')
        .update({ request_status: 'FUNDED' })
        .eq('request_id', contract.loan_request_id);

      // Send confirmation message to pawner
      const confirmationCard = createAcceptedCard(contract);
      try {
        await pawnerLineClient.pushMessage(contract.pawners.line_id, confirmationCard);
        console.log(`Sent confirmation to pawner ${contract.pawners.line_id}`);
      } catch (msgError) {
        console.error('Failed to send confirmation to pawner:', msgError);
      }

      return NextResponse.json({
        success: true,
        message: 'Offer accepted successfully'
      });

    } else if (action === 'decline') {
      // For decline, we don't update the contract
      // The contract remains pending for other investors
      return NextResponse.json({
        success: true,
        message: 'Offer declined'
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Error in investor action:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function createAcceptedCard(contract: any) {
  const dueDate = new Date(contract.contract_end_date);
  const dueDateString = dueDate.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const card = {
    type: 'flex',
    altText: 'มีนักลงทุนสนใจสินค้าของคุณ!',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: '🎉 มีนักลงทุนสนใจ!',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }, {
          type: 'text',
          text: 'สินค้าของคุณมีผู้สนใจปล่อยเงินจำนำ',
          size: 'sm',
          color: '#ffffff',
          align: 'center',
          margin: 'sm'
        }],
        backgroundColor: '#1DB446',
        paddingAll: 'lg'
      },
      hero: {
        type: 'image',
        url: contract.items?.image_urls?.[0] || 'https://via.placeholder.com/300x200?text=No+Image',
        size: 'full',
        aspectRatio: '20:13',
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
                { type: 'text', text: contract.items.brand + ' ' + contract.items.model, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
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
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'วันครบกำหนด:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: dueDateString, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ระยะเวลา:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.contract_duration_days} วัน`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
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
                { type: 'text', text: 'วงเงินจำนำ:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.loan_principal_amount.toLocaleString()} บาท`, color: '#1DB446', size: 'lg', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ดอกเบี้ย:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.interest_amount.toLocaleString()} บาท`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ยอดชำระคืน:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.total_amount.toLocaleString()} บาท`, color: '#E91E63', size: 'md', flex: 5, weight: 'bold' }
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
            type: 'postback',
            label: 'ยืนยันการจำนำ',
            data: `action=confirm_pawn&contractId=${contract.contract_id}`
          },
          style: 'primary',
          color: '#1DB446'
        }, {
          type: 'button',
          action: {
            type: 'uri',
            label: 'นำทางไป Drop Point',
            uri: contract.drop_points?.google_maps_link || 'https://maps.google.com'
          },
          style: 'secondary'
        }]
      }
    }
  };

  return card as FlexMessage;
}
