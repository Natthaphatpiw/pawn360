import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client, FlexMessage } from '@line/bot-sdk';

const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || 'vkhbKJj/xMWX9RWJUPOfr6cfNa5N+jJhp7AX1vpK4poDpkCF4dy/3cPGy4+rmATi0KE9tD/ewmtYLd7nv+0651xY5L7Guy8LGvL1vhc9yuXWFy9wuGPvDQFGfWeva5WFPv2go4BrpP1j+ux63XjsEwdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || 'ed704b15d57c8b84f09ebc3492f9339c'
});

const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
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
    altText: 'ข้อเสนอของคุณได้รับการตอบรับแล้ว',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'ข้อเสนอของคุณได้รับการตอบรับแล้ว',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }],
        backgroundColor: '#0A4215',
        paddingAll: 'lg'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{
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
                { type: 'text', text: 'วันที่ทำรายการ:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: new Date().toLocaleDateString('th-TH'), color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
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
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ดอกเบี้ย:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.interest_rate * 100}% | ${contract.interest_amount.toLocaleString()} บาท`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'มูลค่า:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.loan_principal_amount.toLocaleString()} บาท`, color: '#E91E63', size: 'md', flex: 5, weight: 'bold' }
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
            label: 'นำทางไป drop point',
            uri: contract.drop_points?.google_maps_link || '#'
          },
          style: 'primary',
          color: '#0A4215'
        }]
      }
    }
  };

  return card as FlexMessage;
}
