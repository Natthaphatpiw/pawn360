import { NextRequest, NextResponse } from 'next/server';
import { Client, WebhookEvent, FlexMessage } from '@line/bot-sdk';
import { supabaseAdmin } from '@/lib/supabase/client';

// Pawner LINE OA credentials
// Channel ID = 2008216712
const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'UeHWta6KPHXAUZCZFxJsgpVpF04yulZP+z3w7F/PO4Uzd2U0Rxl1VhuC4wSFIcPGZGNeYXkr6xSq1Ziz36RIgaM0O8xSk8+gJcYlmPBa1ONycwtKnkXk3UTohvHUgTvvA58l/1G9SiPerwDSZs3rewdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '8937117af202d6550b7ab212fdc54291'
});

// Drop Point LINE OA client
const dropPointLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT || 'ji1K2C80ufvt/XsJZ5HiuP/vJxZaNy4th02C+/p6WdazVlWps/KdKTn3OHhH6B5fsJD5Exjio8tFjPPg80BIGS27t52Z2d9zm47/pOWxwqi3iJGOS7N8BDtJGH7Vsn78xnBOBSr3z4QAEn9n11WO5wdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET_DROPPOINT || '9f5767cfe8ecb9c068c6f25502eee416'
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const events: WebhookEvent[] = body.events;

    for (const event of events) {
      if (event.type === 'postback') {
        await handlePostback(event);
      } else if (event.type === 'message' && event.message.type === 'text') {
        await handleTextMessage(event);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Pawner Webhook error:', error);
    return NextResponse.json({ success: true }); // Always return 200 to LINE
  }
}

async function handlePostback(event: WebhookEvent & { type: 'postback' }) {
  const userId = event.source.userId;
  const data = new URLSearchParams(event.postback.data);
  const action = data.get('action');
  const contractId = data.get('contractId');

  if (!userId) return;

  const supabase = supabaseAdmin();

  console.log('Pawner postback:', { action, contractId, userId });

  // Handle confirm_pawn action from pawner
  if (action === 'confirm_pawn' && contractId) {
    try {
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
        console.error('Contract not found:', contractError);
        await pawnerLineClient.pushMessage(userId, {
          type: 'text',
          text: '❌ ไม่พบข้อมูลสัญญา กรุณาติดต่อเจ้าหน้าที่'
        });
        return;
      }

      // Update contract status to PAWNER_CONFIRMED
      await supabase
        .from('contracts')
        .update({
          item_delivery_status: 'PAWNER_CONFIRMED',
          updated_at: new Date().toISOString()
        })
        .eq('contract_id', contractId);

      // Calculate deadline (2 hours from now)
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + 2);
      const deadlineStr = deadline.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

      // Send confirmation to pawner
      const confirmMessage = {
        type: 'text' as const,
        text: `✅ รับทราบเรียบร้อย\n\nกรุณานำสินค้าไปส่งที่ Drop Point ภายใน 2 ชั่วโมง (ก่อน ${deadlineStr})\n\nไม่อย่างนั้นสัญญาจะถูกยกเลิก\n\n📍 ${contract.drop_points?.drop_point_name || 'Drop Point'}\n\n🗺️ Google Maps:\n${contract.drop_points?.google_map_url || 'ไม่มีข้อมูล'}`
      };

      await pawnerLineClient.pushMessage(userId, confirmMessage);

      // Send notification to Drop Point
      if (contract.drop_points?.line_id) {
        const dropPointNotification = createDropPointNotificationCard(contract);
        try {
          await dropPointLineClient.pushMessage(contract.drop_points.line_id, dropPointNotification);
          console.log(`Sent notification to drop point ${contract.drop_points.line_id}`);
        } catch (dpError) {
          console.error('Error sending to drop point:', dpError);
        }
      }

    } catch (error) {
      console.error('Error handling confirm_pawn:', error);
      await pawnerLineClient.pushMessage(userId, {
        type: 'text',
        text: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
      });
    }
  }

  // Handle confirm_payment (pawner confirms investor payment)
  if (action === 'confirm_payment' && contractId) {
    await handlePaymentConfirmation(contractId, userId, true);
  }

  // Handle reject_payment (pawner rejects investor payment)
  if (action === 'reject_payment' && contractId) {
    await handlePaymentConfirmation(contractId, userId, false);
  }
}

async function handlePaymentConfirmation(contractId: string, pawnerLineId: string, confirmed: boolean) {
  const supabase = supabaseAdmin();

  try {
    // Get contract with investor info
    const { data: contract, error } = await supabase
      .from('contracts')
      .select(`
        *,
        items:item_id (*),
        pawners:customer_id (*),
        investors:investor_id (*)
      `)
      .eq('contract_id', contractId)
      .single();

    if (error || !contract) {
      await pawnerLineClient.pushMessage(pawnerLineId, {
        type: 'text',
        text: '❌ ไม่พบข้อมูลสัญญา'
      });
      return;
    }

    if (confirmed) {
      // Update contract to COMPLETED
      await supabase
        .from('contracts')
        .update({
          payment_confirmed_at: new Date().toISOString(),
          contract_status: 'ACTIVE',
          updated_at: new Date().toISOString()
        })
        .eq('contract_id', contractId);

      // Send confirmation to pawner
      await pawnerLineClient.pushMessage(pawnerLineId, {
        type: 'text',
        text: `✅ ยืนยันการรับเงินเรียบร้อยแล้ว\n\nหมายเลขสัญญา: ${contract.contract_number}\nวงเงิน: ${contract.loan_principal_amount?.toLocaleString()} บาท\n\nขอบคุณที่ใช้บริการ Pawn360`
      });

      // Send notification to investor
      if (contract.investors?.line_id) {
        const investorLineClient = new Client({
          channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || 'vkhbKJj/xMWX9RWJUPOfr6cfNa5N+jJhp7AX1vpK4poDpkCF4dy/3cPGy4+rmATi0KE9tD/ewmtYLd7nv+0651xY5L7Guy8LGvL1vhc9yuXWFy9wuGPvDQFGfWeva5WFPv2go4BrpP1j+ux63XjsEwdB04t89/1O/w1cDnyilFU=',
          channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || 'ed704b15d57c8b84f09ebc3492f9339c'
        });

        const successCard = createContractSuccessCard(contract);
        await investorLineClient.pushMessage(contract.investors.line_id, successCard);
      }

    } else {
      // Payment rejected - notify investor
      await pawnerLineClient.pushMessage(pawnerLineId, {
        type: 'text',
        text: '⚠️ รายการถูกปฏิเสธ กรุณารอนักลงทุนตรวจสอบและส่งหลักฐานใหม่'
      });

      if (contract.investors?.line_id) {
        const investorLineClient = new Client({
          channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
          channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
        });

        await investorLineClient.pushMessage(contract.investors.line_id, {
          type: 'text',
          text: `❌ ผู้จำนำปฏิเสธหลักฐานการชำระเงิน\n\nหมายเลขสัญญา: ${contract.contract_number}\n\nกรุณาตรวจสอบและส่งหลักฐานใหม่`
        });
      }
    }

  } catch (error) {
    console.error('Error handling payment confirmation:', error);
  }
}

async function handleTextMessage(event: WebhookEvent & { type: 'message'; message: { type: 'text'; text: string } }) {
  // Simple text message handling if needed
  const userId = event.source.userId;
  const text = event.message.text.toLowerCase();

  if (!userId) return;

  if (text === 'สถานะ' || text === 'status') {
    // TODO: Implement status check
    await pawnerLineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: 'กรุณาระบุหมายเลขสัญญาที่ต้องการตรวจสอบ'
    });
  }
}

function createDropPointNotificationCard(contract: any): FlexMessage {
  return {
    type: 'flex',
    altText: 'มีสินค้าจะส่งมาที่สาขาของคุณ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: '📦 มีสินค้าจะส่งมา!',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }],
        backgroundColor: '#365314',
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
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ผู้ส่ง:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.pawners?.firstname} ${contract.pawners?.lastname}`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'มูลค่า:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.loan_principal_amount?.toLocaleString()} บาท`, color: '#1DB446', size: 'md', flex: 5, weight: 'bold' }
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
            label: 'ตรวจสอบสินค้า',
            uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT || '2008651088-Ajw69zLb'}?contractId=${contract.contract_id}`
          },
          style: 'primary',
          color: '#365314'
        }]
      }
    }
  };
}

function createContractSuccessCard(contract: any): FlexMessage {
  return {
    type: 'flex',
    altText: 'สัญญาจำนำสร้างเรียบร้อยแล้ว',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: '✅ สัญญาสร้างเรียบร้อย',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }],
        backgroundColor: '#1DB446',
        paddingAll: 'lg'
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
                { type: 'text', text: 'หมายเลขสัญญา:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: contract.contract_number, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
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
                { type: 'text', text: 'เงินต้น:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.loan_principal_amount?.toLocaleString()} บาท`, color: '#1DB446', size: 'md', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ดอกเบี้ยรับ:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.interest_amount?.toLocaleString()} บาท`, color: '#1E3A8A', size: 'md', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ครบกำหนด:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: new Date(contract.contract_end_date).toLocaleDateString('th-TH'), color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
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
            label: 'ดูรายละเอียด',
            uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_INVEST_DASHBOARD || '2008641671-wYKNjPkL'}`
          },
          style: 'primary',
          color: '#1E3A8A'
        }]
      }
    }
  };
}

export async function GET() {
  return NextResponse.json({ message: 'Pawner Webhook is active' });
}
