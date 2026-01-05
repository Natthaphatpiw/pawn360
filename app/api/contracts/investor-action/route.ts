import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client, FlexMessage } from '@line/bot-sdk';

const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
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
      if (contract.investor_id) {
        if (contract.investor_id === investorId) {
          return NextResponse.json({
            success: true,
            message: 'Offer already accepted by this investor',
            alreadyAccepted: true
          });
        }
        return NextResponse.json(
          { error: 'Contract already assigned to another investor' },
          { status: 409 }
        );
      }

      if (contract.funding_status && contract.funding_status !== 'PENDING') {
        return NextResponse.json(
          { error: 'Contract is no longer available for funding' },
          { status: 409 }
        );
      }

      const allowedStatuses = ['PENDING', 'PENDING_SIGNATURE'];
      if (!allowedStatuses.includes(contract.contract_status)) {
        return NextResponse.json(
          { error: 'Contract is not available for acceptance' },
          { status: 409 }
        );
      }

      // Update contract with investor (guard against stale/closed contracts)
      const { data: updatedContracts, error: updateError } = await supabase
        .from('contracts')
        .update({
          investor_id: investorId,
          contract_status: 'ACTIVE',
          funding_status: 'FUNDED',
          funded_at: new Date().toISOString()
        })
        .eq('contract_id', contractId)
        .is('investor_id', null)
        .in('contract_status', ['PENDING', 'PENDING_SIGNATURE'])
        .eq('funding_status', 'PENDING')
        .select('contract_id');

      if (updateError) {
        console.error('Error updating contract:', updateError);
        return NextResponse.json(
          { error: 'Failed to accept offer' },
          { status: 500 }
        );
      }

      if (!updatedContracts || updatedContracts.length === 0) {
        return NextResponse.json(
          { error: 'Contract is no longer available for acceptance' },
          { status: 409 }
        );
      }

      // Update loan request
      const { error: loanRequestError } = await supabase
        .from('loan_requests')
        .update({ request_status: 'FUNDED' })
        .eq('request_id', contract.loan_request_id);

      if (loanRequestError) {
        console.error('Error updating loan request:', loanRequestError);
      }

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
    altText: 'มีนักลงทุนสนใจสินค้าของคุณ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'มีนักลงทุนสนใจ',
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
        backgroundColor: '#C0562F',
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
                { type: 'text', text: `${contract.loan_principal_amount.toLocaleString()} บาท`, color: '#C0562F', size: 'lg', flex: 5, weight: 'bold' }
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
                { type: 'text', text: `${contract.total_amount.toLocaleString()} บาท`, color: '#9A3412', size: 'md', flex: 5, weight: 'bold' }
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
          color: '#C0562F'
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
