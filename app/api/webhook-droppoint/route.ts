import { NextRequest, NextResponse } from 'next/server';
import { Client, WebhookEvent, FlexMessage, MessageEvent, TextEventMessage } from '@line/bot-sdk';
import { supabaseAdmin } from '@/lib/supabase/client';

// Drop Point LINE OA credentials - Channel ID = 2008650799
function getDropPointLineClient() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT;
  const secret = process.env.LINE_CHANNEL_SECRET_DROPPOINT;
  if (!token) return null;
  return new Client({ channelAccessToken: token, channelSecret: secret || '' });
}

// Pawner LINE OA client
const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

// Investor LINE OA client
const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
});

const dropPointRegisterLiffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT
  || process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_REGISTER
  || '2008651088-Ajw69zLb';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const events: WebhookEvent[] = body.events;

    for (const event of events) {
      if (event.type === 'follow') {
        // New follower - send welcome message
        await handleFollow(event);
      } else if (event.type === 'message' && event.message.type === 'text') {
        // Handle text messages
        await handleTextMessage(event as MessageEvent & { message: TextEventMessage });
      } else if (event.type === 'postback') {
        // Handle postback actions
        await handlePostback(event);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Drop Point Webhook error:', error);
    return NextResponse.json({ success: true }); // Always return 200 to LINE
  }
}

async function handleFollow(event: WebhookEvent & { type: 'follow' }) {
  const userId = event.source.userId;
  if (!userId) return;

  const welcomeMessage = {
    type: 'flex' as const,
    altText: 'ยินดีต้อนรับสู่ Pawn360 Drop Point',
    contents: {
      type: 'bubble' as const,
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'ยินดีต้อนรับ! 🏪',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }],
        backgroundColor: '#365314',
        paddingAll: 'lg'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'ขอบคุณที่เข้าร่วมเป็น Drop Point กับ Pawn360',
          wrap: true,
          color: '#333333',
          size: 'sm'
        }, {
          type: 'text',
          text: 'กรุณาลงทะเบียนเพื่อเริ่มรับสินทรัพย์ที่ขอสินเชื่อ',
          wrap: true,
          color: '#666666',
          size: 'xs',
          margin: 'md'
        }]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button',
          action: {
            type: 'uri',
            label: 'ลงทะเบียน Drop Point',
            uri: `https://liff.line.me/${dropPointRegisterLiffId}`
          },
          style: 'primary',
          color: '#365314'
        }]
      }
    }
  } as FlexMessage;

  try {
    const dpClient = getDropPointLineClient();
    if (!dpClient) throw new Error('DropPoint LINE client not configured');
    await dpClient.pushMessage(userId, welcomeMessage);
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
}

async function handleTextMessage(event: MessageEvent & { message: TextEventMessage }) {
  const userId = event.source.userId;
  const text = event.message.text.toLowerCase();
  if (!userId) return;

  // Simple command handling
  if (text === 'ลงทะเบียน' || text === 'register') {
    const registerMessage = {
      type: 'text' as const,
      text: `กรุณาลงทะเบียนที่ลิงก์นี้:\nhttps://liff.line.me/${dropPointRegisterLiffId}`
    };
    const dpClient = getDropPointLineClient();
    if (!dpClient) throw new Error('DropPoint LINE client not configured');
    await dpClient.replyMessage(event.replyToken, registerMessage);
  }
}

async function handlePostback(event: WebhookEvent & { type: 'postback' }) {
  const userId = event.source.userId;
  const data = new URLSearchParams(event.postback.data);
  const action = data.get('action');
  const contractId = data.get('contractId');
  const redemptionId = data.get('redemptionId');

  if (!userId) return;

  const supabase = supabaseAdmin();

  if (action === 'verify_item' && contractId) {
    // Send verification page link
    const verifyLink = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_LIST || '2008651088-6wNs8Yrr'}?contractId=${contractId}`;

    const message = {
      type: 'text' as const,
      text: `กรุณาตรวจสอบสินค้าที่ลิงก์นี้:\n${verifyLink}`
    };

    const dpClient = getDropPointLineClient();
    if (!dpClient) throw new Error('DropPoint LINE client not configured');
    await dpClient.replyMessage(event.replyToken, message);
  }

  // ==================== REDEMPTION AMOUNT VERIFICATION ====================

  // Drop Point confirms amount is correct
  if (action === 'redemption_amount_correct' && redemptionId) {
    await handleRedemptionAmountCorrect(redemptionId, userId, event.replyToken);
  }

  // Drop Point says amount is incorrect
  if (action === 'redemption_amount_incorrect' && redemptionId) {
    await handleRedemptionAmountIncorrect(redemptionId, userId, event.replyToken);
  }

  // Pawner confirms item received
  if (action === 'pawner_confirm_received' && redemptionId) {
    await handlePawnerConfirmReceived(redemptionId, userId, event.replyToken);
  }
}

// Handle when Drop Point confirms the redemption amount is correct
async function handleRedemptionAmountCorrect(redemptionId: string, dropPointLineId: string, replyToken: string) {
  try {
    const supabase = supabaseAdmin();
    const { data: redemption } = await supabase
      .from('redemption_requests')
      .select(`
        *,
        contract:contract_id (
          contract_id,
          contract_number,
          items:item_id (
            brand,
            model
          ),
          drop_points:drop_point_id (*),
          pawners:customer_id (*),
          investors:investor_id (*)
        )
      `)
      .eq('redemption_id', redemptionId)
      .single();

    if (!redemption) {
      console.error('Redemption not found for verification');
      return;
    }

    if (redemption.request_status !== 'SLIP_UPLOADED') {
      const dpClient = getDropPointLineClient();
      if (!dpClient) throw new Error('DropPoint LINE client not configured');
      await dpClient.replyMessage(replyToken, {
        type: 'text',
        text: 'รายการนี้ถูกยืนยันยอดไปแล้ว'
      });
      return;
    }

    const pawner = redemption.contract?.pawners;
    const investor = redemption.contract?.investors;
    const dropPoint = redemption.contract?.drop_points;

    const nowIso = new Date().toISOString();

    // Update redemption status to AMOUNT_VERIFIED (guard against duplicate postbacks)
    const { data: updatedRows, error: verifyUpdateError } = await supabase
      .from('redemption_requests')
      .update({
        request_status: 'AMOUNT_VERIFIED',
        verified_by_line_id: dropPointLineId,
        verified_by_drop_point_id: dropPoint?.drop_point_id,
        verified_at: nowIso,
        updated_at: nowIso,
      })
      .eq('redemption_id', redemptionId)
      .eq('request_status', 'SLIP_UPLOADED')
      .select('redemption_id');

    if (verifyUpdateError) {
      console.error('Error verifying redemption amount:', verifyUpdateError);
      return;
    }

    if (!updatedRows || updatedRows.length === 0) {
      const dpClient = getDropPointLineClient();
      if (!dpClient) throw new Error('DropPoint LINE client not configured');
      await dpClient.replyMessage(replyToken, {
        type: 'text',
        text: 'รายการนี้ถูกตรวจสอบไปแล้ว'
      });
      return;
    }

    await supabase
      .from('contracts')
      .update({
        redemption_status: 'IN_PROGRESS',
        updated_at: nowIso,
      })
      .eq('contract_id', redemption.contract_id);

    // Send message to pawner based on delivery method
    if (pawner?.line_id) {
      let pawnerMessage = '';
      if (redemption.delivery_method === 'SELF_PICKUP') {
        pawnerMessage = `ยอดเงินถูกต้องแล้ว\n\nสินค้า: ${redemption.contract?.items?.brand} ${redemption.contract?.items?.model}\n\nกรุณามารับสินค้าที่ ${dropPoint?.drop_point_name || 'จุดรับฝาก'}\nเบอร์ติดต่อ: ${dropPoint?.phone_number || 'ไม่ระบุ'}\n\nโปรดแสดงหลักฐานการโอนเงินให้เจ้าหน้าที่`;
      } else {
        pawnerMessage = `ยอดเงินถูกต้องแล้ว\n\nสินค้า: ${redemption.contract?.items?.brand} ${redemption.contract?.items?.model}\n\nทาง ${dropPoint?.drop_point_name || 'จุดรับฝาก'} กำลังเตรียมการส่งสินค้าให้คุณ\nหากต้องการสอบถามเพิ่มเติม โทร: ${dropPoint?.phone_number || 'ไม่ระบุ'}`;
      }

      try {
        await pawnerLineClient.pushMessage(pawner.line_id, {
          type: 'text',
          text: pawnerMessage
        });
      } catch (msgError) {
        console.error('Error sending to pawner:', msgError);
      }
    }

    // Send message to investor about payment received
    if (investor?.line_id) {
      const investorMessage = `รับชำระเงินเรียบร้อย\n\nสัญญา: ${redemption.contract?.contract_number}\nจำนวนเงิน: ${redemption.total_amount?.toLocaleString()} บาท\n\nอยู่ระหว่างส่งคืนสินค้าให้ผู้ขอสินเชื่อ`;

      try {
        await investorLineClient.pushMessage(investor.line_id, {
          type: 'text',
          text: investorMessage
        });
      } catch (msgError) {
        console.error('Error sending to investor:', msgError);
      }
    }

    const { data: storageBox, error: storageBoxError } = await supabase
      .from('drop_point_storage_boxes')
      .select('box_code')
      .eq('contract_id', redemption.contract_id)
      .order('last_updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (storageBoxError && storageBoxError.code !== 'PGRST205') {
      console.error('Error fetching storage box for return card:', storageBoxError);
    }

    const dpClient = getDropPointLineClient();
    if (!dpClient) throw new Error('DropPoint LINE client not configured');
    const returnCard = createDropPointReturnConfirmCard({
      ...redemption,
      storage_box_code: storageBox?.box_code || null,
    });
    await dpClient.replyMessage(replyToken, returnCard);

    console.log(`Redemption ${redemptionId} amount verified by drop point`);

  } catch (error) {
    console.error('Error handling redemption amount correct:', error);
  }
}

function createDropPointReturnConfirmCard(redemption: any): FlexMessage {
  const item = redemption.contract?.items;
  const pawner = redemption.contract?.pawners;
  const dropPoint = redemption.contract?.drop_points;
  const storageBoxCode = redemption.storage_box_code || null;
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_RETURN || '2008651088-fsjSpdo9';
  const detailUrl = `https://liff.line.me/${liffId}?redemptionId=${redemption.redemption_id}`;

  return {
    type: 'flex',
    altText: 'รอส่งคืนสินค้า',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'ยืนยันยอดเรียบร้อย',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }, {
          type: 'text',
          text: 'กดเมื่อมีผู้มารับสินค้าแล้วเท่านั้น',
          size: 'sm',
          color: '#ffffff',
          align: 'center',
          margin: 'sm'
        }],
        backgroundColor: '#365314',
        paddingAll: 'lg'
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
              { type: 'text', text: 'ลูกค้า:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: `${pawner?.firstname || ''} ${pawner?.lastname || ''}`, color: '#333333', size: 'sm', flex: 5 }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'เบอร์ติดต่อ:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: pawner?.phone_number || '-', color: '#333333', size: 'sm', flex: 5 }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'จุดรับฝาก:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: dropPoint?.drop_point_name || '-', color: '#333333', size: 'sm', flex: 5 }
            ]
          },
          ...(storageBoxCode ? [{
            type: 'box' as const,
            layout: 'baseline' as const,
            spacing: 'sm' as const,
            margin: 'md' as const,
            contents: [
              { type: 'text' as const, text: 'กล่อง:', color: '#666666', size: 'sm' as const, flex: 2 },
              { type: 'text' as const, text: storageBoxCode, color: '#365314', size: 'sm' as const, flex: 5, weight: 'bold' as const }
            ]
          }] : [])
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
            label: 'ยืนยันการส่งคืน',
            uri: detailUrl
          },
          style: 'primary',
          color: '#365314'
        }]
      }
    }
  };
}

// Handle when Drop Point says the redemption amount is incorrect
async function handleRedemptionAmountIncorrect(redemptionId: string, dropPointLineId: string, replyToken: string) {
  try {
    // Get redemption details
    const supabase = supabaseAdmin();
    const { data: redemption } = await supabase
      .from('redemption_requests')
      .select(`
        *,
        contract:contract_id (
          pawners:customer_id (*),
          drop_points:drop_point_id (*)
        )
      `)
      .eq('redemption_id', redemptionId)
      .single();

    if (!redemption) {
      console.error('Redemption not found');
      return;
    }

    if (redemption.request_status !== 'SLIP_UPLOADED') {
      const dpClient = getDropPointLineClient();
      if (!dpClient) throw new Error('DropPoint LINE client not configured');
      await dpClient.replyMessage(replyToken, {
        type: 'text',
        text: 'รายการนี้ถูกตรวจสอบไปแล้ว'
      });
      return;
    }

    const pawner = redemption.contract?.pawners;
    const dropPoint = redemption.contract?.drop_points;

    // Update redemption status to CANCELLED
    const nowIso = new Date().toISOString();
    const { data: cancelledRows, error: cancelError } = await supabase
      .from('redemption_requests')
      .update({
        request_status: 'CANCELLED',
        verified_at: nowIso,
        verified_by_line_id: dropPointLineId,
        verified_by_drop_point_id: dropPoint?.drop_point_id,
        verification_notes: 'Amount verification failed',
        updated_at: nowIso,
      })
      .eq('redemption_id', redemptionId)
      .eq('request_status', 'SLIP_UPLOADED')
      .select('redemption_id');

    if (cancelError) {
      console.error('Error cancelling redemption:', cancelError);
      return;
    }

    if (!cancelledRows || cancelledRows.length === 0) {
      const dpClient = getDropPointLineClient();
      if (!dpClient) throw new Error('DropPoint LINE client not configured');
      await dpClient.replyMessage(replyToken, {
        type: 'text',
        text: 'รายการนี้ถูกตรวจสอบไปแล้ว'
      });
      return;
    }

    // Reset contract redemption status to allow a new request
    await supabase
      .from('contracts')
      .update({
        redemption_status: 'NONE',
        updated_at: nowIso,
      })
      .eq('contract_id', redemption.contract_id);

    // Send message to pawner about cancellation
    if (pawner?.line_id) {
      const pawnerMessage = `ยอดเงินที่โอนไม่ถูกต้อง\n\nสัญญา: ${redemption.contract?.contract_number}\n\nการไถ่ถอนถูกยกเลิกตามข้อกำหนดและข้อสัญญาของ Pawnly\n\nหากต้องการดำเนินการต่อหรือมีข้อสงสัย สามารถติดต่อฝ่ายสนับสนุนได้ที่ 062-6092941`;

      try {
        await pawnerLineClient.pushMessage(pawner.line_id, {
          type: 'text',
          text: pawnerMessage
        });
      } catch (msgError) {
        console.error('Error sending to pawner:', msgError);
      }
    }

    // Reply to drop point
    const dpClient = getDropPointLineClient();
    if (!dpClient) throw new Error('DropPoint LINE client not configured');
    await dpClient.replyMessage(replyToken, {
      type: 'text',
      text: `การไถ่ถอนถูกยกเลิกเนื่องจากยอดเงินไม่ถูกต้อง\n\nบันทึก log เรียบร้อยแล้ว`
    });

    console.log(`Redemption ${redemptionId} cancelled due to amount mismatch`);

  } catch (error) {
    console.error('Error handling redemption amount incorrect:', error);
  }
}

// Handle when Pawner confirms item received
async function handlePawnerConfirmReceived(redemptionId: string, pawnerLineId: string, replyToken: string) {
  const supabase = supabaseAdmin();

  try {
    // Get redemption details
    const { data: redemption, error } = await supabase
      .from('redemption_requests')
      .select(`
        *,
        contract:contract_id (
          contract_number,
          items:item_id (brand, model),
          pawners:customer_id (firstname, lastname)
        )
      `)
      .eq('redemption_id', redemptionId)
      .single();

    if (error || !redemption) {
      console.error('Redemption not found:', error);
      return;
    }

    // Reply to pawner with instructions to upload receipt photos
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://pawnly.io';
    const instructionsMessage = `ขอบคุณที่ยืนยันการได้รับสินค้า\n\nกรุณาส่งรูปภาพการได้รับสินค้าคืนมาที่ไลน์นี้ เพื่อยืนยันการเสร็จสิ้นการไถ่ถอน\n\n${baseUrl}/contracts/${redemption.contract_id}/redeem/receipt?redemptionId=${redemptionId}`;

    const dpClient = getDropPointLineClient();
    if (!dpClient) throw new Error('DropPoint LINE client not configured');
    await dpClient.replyMessage(replyToken, {
      type: 'text',
      text: instructionsMessage
    });

    console.log(`Pawner ${pawnerLineId} confirmed receipt for redemption ${redemptionId}`);

  } catch (error) {
    console.error('Error handling pawner confirm received:', error);
  }
}

// Create card for Pawner when item is ready
function createPawnerItemReadyCard(redemption: any): FlexMessage {
  const contract = redemption.contract;
  const item = contract?.items;
  const dropPoint = contract?.drop_points;

  const deliveryMethodText = {
    'SELF_PICKUP': 'รับของด้วยตัวเอง',
    'SELF_ARRANGE': 'เรียกขนส่งเอง',
    'PLATFORM_ARRANGE': 'Pawnly จัดส่งให้',
  }[redemption.delivery_method as string] || redemption.delivery_method;

  return {
    type: 'flex',
    altText: 'สินค้าพร้อมส่งมอบ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'ยืนยันยอดเรียบร้อย',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }, {
          type: 'text',
          text: 'สินค้าพร้อมส่งมอบ',
          size: 'sm',
          color: '#ffffff',
          align: 'center',
          margin: 'sm'
        }],
        backgroundColor: '#B85C38',
        paddingAll: 'lg'
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
              { type: 'text', text: 'วิธีรับของ:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: deliveryMethodText, color: '#B85C38', size: 'sm', flex: 5, weight: 'bold' }
            ]
          },
          ...(redemption.delivery_method === 'SELF_PICKUP' ? [{
            type: 'box' as const,
            layout: 'vertical' as const,
            margin: 'lg' as const,
            contents: [
              { type: 'text' as const, text: 'รับของที่:', color: '#666666', size: 'xs' as const },
              { type: 'text' as const, text: dropPoint?.drop_point_name || '', color: '#333333', size: 'sm' as const, weight: 'bold' as const, margin: 'sm' as const },
              { type: 'text' as const, text: `โทร: ${dropPoint?.phone_number || ''}`, color: '#666666', size: 'xs' as const, margin: 'sm' as const }
            ]
          }] : []),
          ...(redemption.delivery_method !== 'SELF_PICKUP' ? [{
            type: 'box' as const,
            layout: 'vertical' as const,
            margin: 'lg' as const,
            contents: [
              { type: 'text' as const, text: 'จัดส่งไปที่:', color: '#666666', size: 'xs' as const },
              { type: 'text' as const, text: redemption.delivery_address_full || '', color: '#333333', size: 'sm' as const, wrap: true, margin: 'sm' as const }
            ]
          }] : [])
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [{
          type: 'button',
          action: {
            type: 'postback',
            label: 'ยืนยันได้รับของแล้ว',
            data: `action=pawner_confirm_received&redemptionId=${redemption.redemption_id}`
          },
          style: 'primary',
          color: '#B85C38'
        }]
      }
    }
  };
}

// Verify LINE signature
export async function GET() {
  return NextResponse.json({ message: 'Drop Point Webhook is active' });
}
