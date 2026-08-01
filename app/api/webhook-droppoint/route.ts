import { NextRequest, NextResponse } from 'next/server';
import { Client, WebhookEvent, FlexMessage, MessageEvent, TextEventMessage } from '@line/bot-sdk';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifyLineSignatureWithSecret } from '@/lib/security/line';
import {
  claimWebhookEvent,
  completeWebhookClaim,
  readBoundedWebhookText,
  releaseWebhookClaim,
  webhookReplayErrorResponse,
} from '@/lib/security/webhook-replay';

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function formatAmount(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString('th-TH') : '-';
}

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
    const rawBody = await readBoundedWebhookText(request);
    const signature = request.headers.get('x-line-signature') || '';
    const channelSecret = process.env.LINE_CHANNEL_SECRET_DROPPOINT || '';

    if (!channelSecret) {
      console.error('[droppoint:webhook] channel secret is not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    if (!verifyLineSignatureWithSecret(rawBody, signature, channelSecret)) {
      console.warn('[droppoint:webhook] rejected invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    let body: { events?: unknown };
    try {
      body = JSON.parse(rawBody) as { events?: unknown };
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    const events = Array.isArray(body.events) ? body.events as WebhookEvent[] : [];
    if (events.length > 100) {
      return NextResponse.json({ error: 'Too many events' }, { status: 400 });
    }

    for (const event of events) {
      const eventId = (event as WebhookEvent & { webhookEventId?: unknown }).webhookEventId;
      const claim = await claimWebhookEvent({
        namespace: 'line-droppoint',
        material: typeof eventId === 'string' ? eventId : JSON.stringify(event),
        signingSecret: channelSecret,
      });
      if (claim.duplicate) continue;
      try {
        if (event.type === 'follow') {
          await handleFollow(event);
        } else if (event.type === 'message' && event.message.type === 'text') {
          await handleTextMessage(event as MessageEvent & { message: TextEventMessage });
        } else if (event.type === 'postback') {
          await handlePostback(event);
        }
        await completeWebhookClaim(claim);
      } catch (error) {
        await releaseWebhookClaim(claim);
        throw error;
      }
    }

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const replayError = webhookReplayErrorResponse(error);
    if (replayError) return replayError;
    console.error('[droppoint:webhook] processing failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
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

  const dpClient = getDropPointLineClient();
  if (!dpClient) throw new Error('DROPPOINT_LINE_CLIENT_NOT_CONFIGURED');
  await dpClient.pushMessage(userId, welcomeMessage);
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
  const { data: activeDropPoint, error: dropPointLookupError } = await supabase
    .from('drop_points')
    .select('drop_point_id')
    .eq('line_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (dropPointLookupError) throw new Error('DROP_POINT_LOOKUP_FAILED');
  if (!activeDropPoint) {
    console.warn('[droppoint:webhook] postback rejected for inactive account');
    return;
  }
  const validRedemptionId = redemptionId
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(redemptionId)
    ? redemptionId
    : null;

  if (action === 'verify_item' && contractId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contractId)) {
      return;
    }
    const { data: assignedContract, error: contractLookupError } = await supabase
      .from('contracts')
      .select('contract_id')
      .eq('contract_id', contractId)
      .eq('drop_point_id', activeDropPoint.drop_point_id)
      .maybeSingle();
    if (contractLookupError) throw new Error('DROP_POINT_CONTRACT_LOOKUP_FAILED');
    if (!assignedContract) return;
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
  if (action === 'redemption_amount_correct' && validRedemptionId) {
    await handleRedemptionAmountCorrect(validRedemptionId, userId, event.replyToken);
  }

  // Drop Point says amount is incorrect
  if (action === 'redemption_amount_incorrect' && validRedemptionId) {
    await handleRedemptionAmountIncorrect(validRedemptionId, userId, event.replyToken);
  }

}

// Handle when Drop Point confirms the redemption amount is correct
async function handleRedemptionAmountCorrect(redemptionId: string, dropPointLineId: string, replyToken: string) {
  try {
    const supabase = supabaseAdmin();
    const { data: redemption, error: redemptionError } = await supabase
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

    if (redemptionError && redemptionError.code !== 'PGRST116') {
      throw new Error('REDEMPTION_LOOKUP_FAILED');
    }

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

    const pawner = relationOne(redemption.contract?.pawners);
    const investor = relationOne(redemption.contract?.investors);
    const dropPoint = relationOne(redemption.contract?.drop_points);
    if (!dropPoint || dropPoint.line_id !== dropPointLineId) {
      console.warn('[droppoint:webhook] redemption assignment mismatch');
      return;
    }

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
      throw new Error('REDEMPTION_UPDATE_FAILED');
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

    const { error: contractUpdateError } = await supabase
      .from('contracts')
      .update({
        redemption_status: 'IN_PROGRESS',
        updated_at: nowIso,
      })
      .eq('contract_id', redemption.contract_id);
    if (contractUpdateError) {
      const { error: rollbackError } = await supabase
        .from('redemption_requests')
        .update({
          request_status: 'SLIP_UPLOADED',
          verified_by_line_id: null,
          verified_by_drop_point_id: null,
          verified_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('redemption_id', redemptionId)
        .eq('request_status', 'AMOUNT_VERIFIED');
      if (rollbackError) throw new Error('REDEMPTION_RECONCILIATION_REQUIRED');
      throw new Error('CONTRACT_REDEMPTION_UPDATE_FAILED');
    }

    // Send message to pawner based on delivery method
    if (pawner?.line_id) {
      try {
        await pawnerLineClient.pushMessage(pawner.line_id, createPawnerItemReadyCard(redemption));
      } catch (msgError) {
        console.error('[droppoint:webhook] pawner notification delayed', {
          type: msgError instanceof Error ? msgError.name : 'unknown',
        });
      }
    }

    // Send message to investor about payment received
    if (investor?.line_id) {
      const investorMessage = `รับชำระเงินเรียบร้อย\n\nสัญญา: ${redemption.contract?.contract_number || '-'}\nจำนวนเงิน: ${formatAmount(redemption.total_amount)} บาท\n\nอยู่ระหว่างส่งคืนสินค้าให้ผู้ขอสินเชื่อ`;

      try {
        await investorLineClient.pushMessage(investor.line_id, {
          type: 'text',
          text: investorMessage
        });
      } catch (msgError) {
        console.error('[droppoint:webhook] investor notification delayed', {
          type: msgError instanceof Error ? msgError.name : 'unknown',
        });
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
      console.error('[droppoint:webhook] storage-box lookup failed', {
        code: storageBoxError.code || 'unknown',
      });
    }

    const dpClient = getDropPointLineClient();
    if (!dpClient) throw new Error('DropPoint LINE client not configured');
    const returnCard = createDropPointReturnConfirmCard({
      ...redemption,
      storage_box_code: storageBox?.box_code || null,
    });
    await dpClient.replyMessage(replyToken, returnCard);

    console.log('[droppoint:webhook] redemption amount verified');

  } catch (error) {
    console.error('[droppoint:webhook] amount confirmation failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
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
              { type: 'text', text: `${[item?.brand, item?.model].filter(Boolean).join(' ') || '-'}`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'ลูกค้า:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: `${[pawner?.firstname, pawner?.lastname].filter(Boolean).join(' ') || '-'}`, color: '#333333', size: 'sm', flex: 5 }
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
    const { data: redemption, error: redemptionError } = await supabase
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

    if (redemptionError && redemptionError.code !== 'PGRST116') {
      throw new Error('REDEMPTION_LOOKUP_FAILED');
    }

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

    const pawner = relationOne(redemption.contract?.pawners);
    const dropPoint = relationOne(redemption.contract?.drop_points);
    if (!dropPoint || dropPoint.line_id !== dropPointLineId) {
      console.warn('[droppoint:webhook] redemption assignment mismatch');
      return;
    }

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
      throw new Error('REDEMPTION_CANCEL_FAILED');
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
    const { error: contractResetError } = await supabase
      .from('contracts')
      .update({
        redemption_status: 'NONE',
        updated_at: nowIso,
      })
      .eq('contract_id', redemption.contract_id);
    if (contractResetError) {
      const { error: rollbackError } = await supabase
        .from('redemption_requests')
        .update({
          request_status: 'SLIP_UPLOADED',
          verified_at: null,
          verified_by_line_id: null,
          verified_by_drop_point_id: null,
          verification_notes: null,
          updated_at: new Date().toISOString(),
        })
        .eq('redemption_id', redemptionId)
        .eq('request_status', 'CANCELLED');
      if (rollbackError) throw new Error('REDEMPTION_RECONCILIATION_REQUIRED');
      throw new Error('CONTRACT_REDEMPTION_RESET_FAILED');
    }

    // Send message to pawner about cancellation
    if (pawner?.line_id) {
      const pawnerMessage = `ยอดเงินที่โอนไม่ถูกต้อง\n\nสัญญา: ${redemption.contract?.contract_number}\n\nการไถ่ถอนถูกยกเลิกตามข้อกำหนดและข้อสัญญาของ Pawnly\n\nหากต้องการดำเนินการต่อหรือมีข้อสงสัย สามารถติดต่อฝ่ายสนับสนุนได้ที่ 062-6092941`;

      try {
        await pawnerLineClient.pushMessage(pawner.line_id, {
          type: 'text',
          text: pawnerMessage
        });
      } catch (msgError) {
        console.error('[droppoint:webhook] pawner notification delayed', {
          type: msgError instanceof Error ? msgError.name : 'unknown',
        });
      }
    }

    // Reply to drop point
    const dpClient = getDropPointLineClient();
    if (!dpClient) throw new Error('DropPoint LINE client not configured');
    await dpClient.replyMessage(replyToken, {
      type: 'text',
      text: `การไถ่ถอนถูกยกเลิกเนื่องจากยอดเงินไม่ถูกต้อง\n\nบันทึก log เรียบร้อยแล้ว`
    });

    console.log('[droppoint:webhook] redemption canceled after amount mismatch');

  } catch (error) {
    console.error('[droppoint:webhook] amount rejection failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
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
    'DROPPOINT_SELF_PICKUP': 'รับเองที่ Drop Point',
    'DROPPOINT_SELF_RIDER': 'เรียกไรเดอร์เอง',
    'CENTRAL_SCHEDULE_7D': 'นัดรับที่ Drop Point ภายใน 7 วัน',
    'CENTRAL_SELF_PICKUP_TODAY': 'รับเองที่คลังกลาง Astly วันนี้',
    'DROPPOINT_NEXT_DAY_PICKUP': 'รับวันถัดไปที่ Drop Point',
  }[redemption.delivery_method as string] || redemption.delivery_method;
  const dropPointReturnMethods = new Set([
    'SELF_PICKUP',
    'SELF_ARRANGE',
    'DROPPOINT_SELF_PICKUP',
    'DROPPOINT_SELF_RIDER',
    'CENTRAL_SCHEDULE_7D',
    'DROPPOINT_NEXT_DAY_PICKUP',
  ]);
  const centralReturnMethods = new Set([
    'CENTRAL_SELF_PICKUP_TODAY',
  ]);
  const isDropPointReturn = dropPointReturnMethods.has(String(redemption.delivery_method || ''));
  const isCentralReturn = centralReturnMethods.has(String(redemption.delivery_method || ''));

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
              { type: 'text', text: `${[item?.brand, item?.model].filter(Boolean).join(' ') || '-'}`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
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
          ...(isDropPointReturn ? [{
            type: 'box' as const,
            layout: 'vertical' as const,
            margin: 'lg' as const,
            contents: [
              { type: 'text' as const, text: 'รับของที่:', color: '#666666', size: 'xs' as const },
              { type: 'text' as const, text: dropPoint?.drop_point_name || '', color: '#333333', size: 'sm' as const, weight: 'bold' as const, margin: 'sm' as const },
              { type: 'text' as const, text: `โทร: ${dropPoint?.phone_number || ''}`, color: '#666666', size: 'xs' as const, margin: 'sm' as const }
            ]
          }] : []),
          ...(isCentralReturn ? [{
            type: 'box' as const,
            layout: 'vertical' as const,
            margin: 'lg' as const,
            contents: [
              { type: 'text' as const, text: 'สถานที่รับ:', color: '#666666', size: 'xs' as const },
              { type: 'text' as const, text: 'คลังกลาง Astly', color: '#333333', size: 'sm' as const, weight: 'bold' as const, margin: 'sm' as const },
              { type: 'text' as const, text: 'เจ้าหน้าที่จะแจ้งรายละเอียดนัดหมาย', color: '#666666', size: 'xs' as const, margin: 'sm' as const }
            ]
          }] : []),
          ...(redemption.delivery_method === 'PLATFORM_ARRANGE' ? [{
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
            label: 'ได้รับของคืนแล้ว',
            data: `action=pawner_confirm_received&redemptionId=${redemption.redemption_id}`
          },
          style: 'primary',
          color: '#B85C38'
        }, {
          type: 'button',
          action: {
            type: 'postback',
            label: 'ยังไม่ได้รับของ',
            data: `action=pawner_report_not_received&redemptionId=${redemption.redemption_id}`
          },
          style: 'secondary'
        }]
      }
    }
  };
}

// Verify LINE signature
export async function GET() {
  return NextResponse.json({ message: 'Drop Point Webhook is active' });
}
