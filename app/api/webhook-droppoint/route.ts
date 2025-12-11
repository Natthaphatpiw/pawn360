import { NextRequest, NextResponse } from 'next/server';
import { Client, WebhookEvent, FlexMessage, MessageEvent, TextEventMessage } from '@line/bot-sdk';
import { supabaseAdmin } from '@/lib/supabase/client';

// Drop Point LINE OA credentials - Channel ID = 2008650799
const dropPointLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT || 'ji1K2C80ufvt/XsJZ5HiuP/vJxZaNy4th02C+/p6WdazVlWps/KdKTn3OHhH6B5fsJD5Exjio8tFjPPg80BIGS27t52Z2d9zm47/pOWxwqi3iJGOS7N8BDtJGH7Vsn78xnBOBSr3z4QAEn9n11WO5wdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET_DROPPOINT || '9f5767cfe8ecb9c068c6f25502eee416'
});

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
          text: 'กรุณาลงทะเบียนเพื่อเริ่มรับสินค้าจำนำ',
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
            uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT || '2008651088-Ajw69zLb'}`
          },
          style: 'primary',
          color: '#365314'
        }]
      }
    }
  } as FlexMessage;

  try {
    await dropPointLineClient.pushMessage(userId, welcomeMessage);
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
      text: `กรุณาลงทะเบียนที่ลิงก์นี้:\nhttps://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT || '2008651088-Ajw69zLb'}`
    };
    await dropPointLineClient.replyMessage(event.replyToken, registerMessage);
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
    const verifyLink = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT || '2008651088-Ajw69zLb'}/droppoint-verify?contractId=${contractId}`;

    const message = {
      type: 'text' as const,
      text: `กรุณาตรวจสอบสินค้าที่ลิงก์นี้:\n${verifyLink}`
    };

    await dropPointLineClient.replyMessage(event.replyToken, message);
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
    // Use the new API endpoint for payment verification
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/redemptions/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        redemptionId,
        action: 'amount_correct',
      }),
    });

    if (!response.ok) {
      console.error('Failed to verify payment');
      return;
    }

    // Reply to Drop Point with delivery instructions
    const supabase = supabaseAdmin();
    const { data: redemption } = await supabase
      .from('redemption_requests')
      .select(`
        *,
        contract:contract_id (
          drop_points:drop_point_id (*),
          pawners:customer_id (*)
        )
      `)
      .eq('redemption_id', redemptionId)
      .single();

    if (redemption) {
      const pawner = redemption.contract?.pawners;
      let deliveryInstructions = '';

      if (redemption.delivery_method === 'SELF_PICKUP') {
        deliveryInstructions = `ลูกค้าจะมารับของเอง\n\nข้อมูลลูกค้า:\nชื่อ: ${pawner?.firstname} ${pawner?.lastname}\nโทร: ${pawner?.phone_number}\n\nกรุณาเตรียมของไว้ให้พร้อม`;
      } else if (redemption.delivery_method === 'SELF_ARRANGE') {
        deliveryInstructions = `ลูกค้าจะเรียกบริการขนส่งมารับของเอง\n\nกรุณาเตรียมของรอ`;
      } else if (redemption.delivery_method === 'PLATFORM_ARRANGE') {
        deliveryInstructions = `กรุณาเรียกบริการขนส่งไปส่งที่:\n\n${redemption.delivery_address_full}\n\nเบอร์ติดต่อ: ${redemption.delivery_contact_phone}\n${redemption.delivery_notes ? `หมายเหตุ: ${redemption.delivery_notes}` : ''}`;
      }

      await dropPointLineClient.replyMessage(replyToken, {
        type: 'text',
        text: `ยืนยันยอดถูกต้องเรียบร้อย\n\n${deliveryInstructions}`
      });
    }

    console.log(`Redemption ${redemptionId} amount verified by drop point`);

  } catch (error) {
    console.error('Error handling redemption amount correct:', error);
  }
}

// Handle when Drop Point says the redemption amount is incorrect
async function handleRedemptionAmountIncorrect(redemptionId: string, dropPointLineId: string, replyToken: string) {
  try {
    // Get redemption details to determine the difference
    const supabase = supabaseAdmin();
    const { data: redemption } = await supabase
      .from('redemption_requests')
      .select('*')
      .eq('redemption_id', redemptionId)
      .single();

    if (!redemption) {
      console.error('Redemption not found');
      return;
    }

    // For now, we'll ask the drop point to specify the amount difference
    // In a real implementation, you might want to have a form for this
    const dropPointInstructions = `กรุณาระบุจำนวนเงินที่ผิด:\n\nตัวอย่าง:\n- หากขาด 500 บาท: ตอบ "ขาด 500"\n- หากเกิน 1000 บาท: ตอบ "เกิน 1000"\n\nหรือติดต่อฝ่ายสนับสนุนที่ 062-6092941 เพื่อขอความช่วยเหลือ`;

    await dropPointLineClient.replyMessage(replyToken, {
      type: 'text',
      text: dropPointInstructions
    });

    console.log(`Redemption ${redemptionId} amount mismatch reported by drop point`);

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
    const instructionsMessage = `ขอบคุณที่ยืนยันการได้รับสินค้า\n\nกรุณาส่งรูปภาพการได้รับสินค้าคืนมาที่ไลน์นี้ เพื่อยืนยันการเสร็จสิ้นการไถ่ถอน\n\n${process.env.NEXT_PUBLIC_BASE_URL || 'https://pawn360.vercel.app'}/contracts/${redemption.contract_id}/redeem/receipt?redemptionId=${redemptionId}`;

    await dropPointLineClient.replyMessage(replyToken, {
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
