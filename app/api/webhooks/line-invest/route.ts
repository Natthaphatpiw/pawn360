import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client, type WebhookEvent } from '@line/bot-sdk';
import { verifyLineSignatureWithSecret } from '@/lib/security/line';
import {
  claimWebhookEvent,
  completeWebhookClaim,
  readBoundedWebhookText,
  releaseWebhookClaim,
  webhookReplayErrorResponse,
} from '@/lib/security/webhook-replay';

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET_INVEST;

const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: CHANNEL_SECRET || ''
});

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function validUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

async function handleInvestorPostback(
  event: Extract<WebhookEvent, { type: 'postback' }>,
  sourceUserId: string,
) {
  const params = new URLSearchParams(event.postback.data || '');
  const action = params.get('action');
  if (action !== 'investor_confirm_received' && action !== 'investor_report_problem') return;

  const redemptionId = params.get('redemptionId');
  if (!validUuid(redemptionId)) return;

  const supabase = supabaseAdmin();
  const { data: redemption, error } = await supabase
    .from('redemption_requests')
    .select(`
      redemption_id,
      request_status,
      investor_net_profit,
      investor_confirmed_at,
      contract:contract_id (
        investors:investor_id (line_id)
      )
    `)
    .eq('redemption_id', redemptionId)
    .maybeSingle();
  if (error) throw new Error('INVESTOR_REDEMPTION_LOOKUP_FAILED');
  if (!redemption) return;

  const contract = relationOne(redemption.contract);
  const investor = relationOne(contract?.investors);
  if (!investor || investor.line_id !== sourceUserId) {
    console.warn('[investor:webhook] redemption ownership mismatch');
    return;
  }

  if (action === 'investor_report_problem') {
    await lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: 'หากพบปัญหาเกี่ยวกับการรับเงิน\n\nกรุณาติดต่อฝ่าย Support: 062-6092941\nเวลาทำการ 09:00 - 18:00 น. วันจันทร์ - เสาร์',
    });
    return;
  }

  const netProfit = Number(redemption.investor_net_profit || 0);
  if (redemption.request_status === 'COMPLETED' || redemption.investor_confirmed_at) {
    await lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: `คุณได้ยืนยันรับเงินไปแล้ว\n\nกำไรสุทธิ: +${netProfit.toLocaleString()} บาท`,
    });
    return;
  }
  if (redemption.request_status !== 'PAWNER_CONFIRMED') {
    await lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: 'รายการนี้ยังไม่พร้อมให้ยืนยันรับเงิน กรุณาตรวจสอบสถานะอีกครั้ง',
    });
    return;
  }

  const { data: completed, error: updateError } = await supabase
    .from('redemption_requests')
    .update({
      request_status: 'COMPLETED',
      investor_confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('redemption_id', redemptionId)
    .eq('request_status', 'PAWNER_CONFIRMED')
    .is('investor_confirmed_at', null)
    .select('redemption_id')
    .maybeSingle();
  if (updateError || !completed) throw new Error('INVESTOR_REDEMPTION_CONFIRMATION_CONFLICT');

  await lineClient.replyMessage(event.replyToken, {
    type: 'text',
    text: `ยืนยันรับเงินเรียบร้อยแล้ว\n\nกำไรสุทธิ: +${netProfit.toLocaleString()} บาท\n\nขอบคุณที่เป็นส่วนหนึ่งของ Astly`,
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || !CHANNEL_SECRET) {
      console.error('LINE invest webhook is not configured (missing token/secret)');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    // Get signature from header
    const signature = request.headers.get('x-line-signature');

    if (!signature) {
      console.error('No signature provided');
      return NextResponse.json({ error: 'No signature' }, { status: 401 });
    }

    // Get raw body for signature verification
    const rawBody = await readBoundedWebhookText(request);

    // Verify signature
    if (!verifyLineSignatureWithSecret(rawBody, signature, CHANNEL_SECRET)) {
      console.error('Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse body
    let body: { events?: unknown };
    try {
      body = JSON.parse(rawBody) as { events?: unknown };
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    const events = Array.isArray(body.events) ? body.events as WebhookEvent[] : [];

    if (events.length === 0) {
      return NextResponse.json({ message: 'No events' });
    }
    if (events.length > 100) {
      return NextResponse.json({ error: 'Too many events' }, { status: 400 });
    }

    for (const event of events) {
      const eventId = (event as WebhookEvent & { webhookEventId?: unknown }).webhookEventId;
      const claim = await claimWebhookEvent({
        namespace: 'line-investor',
        material: typeof eventId === 'string' ? eventId : JSON.stringify(event),
        signingSecret: CHANNEL_SECRET,
      });
      if (claim.duplicate) continue;

      const { type } = event;
      const replyToken = 'replyToken' in event && typeof event.replyToken === 'string'
        ? event.replyToken
        : undefined;
      const sourceUserId = event.source.userId;
      try {
        switch (type) {
        case 'message':
          // Handle incoming messages from investors
          // Check if investor exists and get their KYC status
          try {
            const supabase = supabaseAdmin();
            const { data: investor } = await supabase
              .from('investors')
              .select('firstname, lastname, kyc_status, investor_id')
              .eq('line_id', sourceUserId || '')
              .single();

            if (investor) {
              let replyMessage = '';

              if (investor.kyc_status === 'VERIFIED') {
                replyMessage = `สวัสดีครับ คุณ${investor.firstname} ${investor.lastname}\n\nการยืนยันตัวตนของคุณเสร็จสิ้นแล้ว คุณสามารถลงทุนได้แล้ว\n\nกดที่นี่เพื่อเข้าสู่ระบบลงทุน:`;
              } else if (investor.kyc_status === 'PENDING') {
                replyMessage = `สวัสดีครับ คุณ${investor.firstname} ${investor.lastname}\n\nข้อมูลการยืนยันตัวตนของคุณอยู่ระหว่างการตรวจสอบ\nกรุณารอผลการตรวจสอบ`;
              } else if (investor.kyc_status === 'REJECTED') {
                replyMessage = `สวัสดีครับ คุณ${investor.firstname} ${investor.lastname}\n\nการยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง\n\nกดที่นี่เพื่อเริ่มยืนยันตัวตน:`;
              } else {
                // NOT_VERIFIED or other status
                replyMessage = `สวัสดีครับ คุณ${investor.firstname} ${investor.lastname}\n\nคุณยังไม่ได้ยืนยันตัวตน กรุณาทำการยืนยันตัวตนก่อน\n\nกดที่นี่เพื่อเริ่มยืนยันตัวตน:`;
              }

              // Send reply using LINE Bot SDK
              if (replyToken) {
                await lineClient.replyMessage(replyToken, {
                  type: 'text',
                  text: replyMessage
                });
              }
            } else {
              // Investor not found in database
              const replyMessage = `สวัสดีครับ\n\nดูเหมือนคุณยังไม่ได้ลงทะเบียนเป็นนักลงทุน\nกรุณาลงทะเบียนก่อน:\n\nลงทะเบียนนักลงทุน:`;

              if (replyToken) {
                await lineClient.replyMessage(replyToken, {
                  type: 'text',
                  text: replyMessage
                });
              }
            }
          } catch (error) {
            console.error('[investor:webhook] message handling failed', {
              type: error instanceof Error ? error.name : 'unknown',
            });
            // Send generic error message
            if (replyToken) {
              await lineClient.replyMessage(replyToken, {
                type: 'text',
                text: 'ขออภัย เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง'
              });
            }
          }
          break;

        case 'follow':
          // User added the bot as friend
          // Send welcome message
          try {
            const welcomeMessage = `ยินดีต้อนรับสู่ Astly Investor\n\nเพื่อเริ่มลงทุน คุณต้องทำการยืนยันตัวตนก่อน\n\nกดที่นี่เพื่อลงทะเบียน:`;

            if (!sourceUserId) break;
            await lineClient.pushMessage(sourceUserId, {
              type: 'text',
              text: welcomeMessage
            });
          } catch (error) {
            console.error('[investor:webhook] welcome message delayed', {
              type: error instanceof Error ? error.name : 'unknown',
            });
          }
          break;

        case 'unfollow':
          // User removed the bot
          console.log('Investor unfollow event received');
          break;

        case 'join':
          // Bot joined a group/room
          console.log('Bot joined event received');
          break;

        case 'leave':
          // Bot left a group/room
          console.log('Bot left event received');
          break;

        case 'postback':
          if (sourceUserId) await handleInvestorPostback(event, sourceUserId);
          break;

        default:
          console.log('Unhandled event type:', type);
        }
        await completeWebhookClaim(claim);
      } catch (error) {
        await releaseWebhookClaim(claim);
        throw error;
      }
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );

  } catch (error) {
    const replayError = webhookReplayErrorResponse(error);
    if (replayError) return replayError;
    console.error('[investor:webhook] processing failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { success: false, error: 'Webhook processing failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

// Handle GET requests (for verification)
export async function GET() {
  return NextResponse.json({
    message: 'LINE Investor Webhook endpoint is active',
    channel: 'investor'
  });
}

// Allow POST and GET methods
export const runtime = 'nodejs';
