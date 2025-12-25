import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client, FlexMessage } from '@line/bot-sdk';

// Drop Point LINE OA client
const dropPointLineClient = process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT ? new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT,
  channelSecret: process.env.LINE_CHANNEL_SECRET_DROPPOINT || ''
}) : null;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { redemptionId, slipUrl, pawnerLineId } = body;

    if (!redemptionId || !slipUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get redemption with contract details
    const { data: redemption, error: redemptionError } = await supabase
      .from('redemption_requests')
      .select(`
        *,
        contract:contract_id (
          contract_id,
          contract_number,
          loan_principal_amount,
          interest_amount,
          total_amount,
          items:item_id (
            item_id,
            brand,
            model,
            capacity,
            image_urls
          ),
          pawners:customer_id (
            customer_id,
            firstname,
            lastname,
            line_id,
            phone_number
          ),
          investors:investor_id (
            investor_id,
            firstname,
            lastname,
            line_id,
            bank_name,
            bank_account_no,
            bank_account_name
          ),
          drop_points:drop_point_id (
            drop_point_id,
            drop_point_name,
            phone_number,
            line_id
          )
        )
      `)
      .eq('redemption_id', redemptionId)
      .single();

    if (redemptionError || !redemption) {
      return NextResponse.json(
        { error: 'Redemption not found' },
        { status: 404 }
      );
    }

    // Update redemption with slip URL
    const { error: updateError } = await supabase
      .from('redemption_requests')
      .update({
        payment_slip_url: slipUrl,
        payment_slip_uploaded_at: new Date().toISOString(),
        request_status: 'SLIP_UPLOADED',
        updated_at: new Date().toISOString(),
      })
      .eq('redemption_id', redemptionId);

    if (updateError) {
      console.error('Error updating redemption:', updateError);
      return NextResponse.json(
        { error: 'Failed to update redemption' },
        { status: 500 }
      );
    }

    // Update contract redemption status
    await supabase
      .from('contracts')
      .update({
        redemption_status: 'IN_PROGRESS',
        updated_at: new Date().toISOString(),
      })
      .eq('contract_id', redemption.contract_id);

    // Send notification to Drop Point
    const dropPointLineId = redemption.contract?.drop_points?.line_id;
    if (dropPointLineId && dropPointLineClient) {
      try {
        const notificationCard = createDropPointRedemptionCard(redemption, slipUrl);
        await dropPointLineClient.pushMessage(dropPointLineId, notificationCard);
        console.log(`Sent redemption notification to drop point: ${dropPointLineId}`);
      } catch (msgError) {
        console.error('Error sending to drop point:', msgError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Slip uploaded successfully',
    });

  } catch (error: any) {
    console.error('Error uploading slip:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function createDropPointRedemptionCard(redemption: any, slipUrl: string): FlexMessage {
  const contract = redemption.contract;
  const item = contract?.items;
  const pawner = contract?.pawners;
  const investor = contract?.investors;

  const deliveryMethodText = {
    'SELF_PICKUP': 'ลูกค้ามารับเอง',
    'SELF_ARRANGE': 'ลูกค้าเรียกขนส่งเอง',
    'PLATFORM_ARRANGE': 'ให้ Pawnly เรียกขนส่ง',
  }[redemption.delivery_method as string] || redemption.delivery_method;

  return {
    type: 'flex',
    altText: 'มีคำขอไถ่ถอนใหม่',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'คำขอไถ่ถอนใหม่',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }, {
          type: 'text',
          text: 'กรุณาตรวจสอบยอดเงิน',
          size: 'sm',
          color: '#ffffff',
          align: 'center',
          margin: 'sm'
        }],
        backgroundColor: '#365314',
        paddingAll: 'lg'
      },
      hero: {
        type: 'image',
        url: slipUrl,
        size: 'full',
        aspectRatio: '1:1',
        aspectMode: 'cover'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'สินค้า:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: `${item?.brand || ''} ${item?.model || ''}`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'สัญญา:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: contract?.contract_number || '', color: '#333333', size: 'sm', flex: 5 }
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
              { type: 'text', text: 'ยอดที่ต้องจ่าย:', color: '#666666', size: 'md', flex: 3 },
              { type: 'text', text: `${redemption.total_amount?.toLocaleString()} บาท`, color: '#365314', size: 'xl', flex: 4, weight: 'bold' }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'การรับของ:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: deliveryMethodText, color: '#333333', size: 'sm', flex: 5 }
            ]
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
              { type: 'text', text: 'ข้อมูลผู้จำนำ:', color: '#666666', size: 'xs', margin: 'none' },
              { type: 'text', text: `${pawner?.firstname || ''} ${pawner?.lastname || ''}`, color: '#333333', size: 'sm', weight: 'bold', margin: 'sm' },
              { type: 'text', text: `โทร: ${pawner?.phone_number || '-'}`, color: '#666666', size: 'xs', margin: 'sm' }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            contents: [
              { type: 'text', text: 'โอนไปยัง (นักลงทุน):', color: '#666666', size: 'xs', margin: 'none' },
              { type: 'text', text: `${investor?.bank_name || ''} ${investor?.bank_account_no || ''}`, color: '#333333', size: 'sm', weight: 'bold', margin: 'sm' },
              { type: 'text', text: `ชื่อ: ${investor?.bank_account_name || investor?.firstname + ' ' + investor?.lastname}`, color: '#666666', size: 'xs', margin: 'sm' }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: {
              type: 'postback',
              label: 'ยอดครบถ้วนถูกต้อง',
              data: `action=redemption_amount_correct&redemptionId=${redemption.redemption_id}`
            },
            style: 'primary',
            color: '#365314'
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: 'ยอดไม่ถูกต้อง',
              data: `action=redemption_amount_incorrect&redemptionId=${redemption.redemption_id}`
            },
            style: 'secondary'
          }
        ]
      }
    }
  };
}
