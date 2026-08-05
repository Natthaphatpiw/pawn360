import { NextRequest, NextResponse } from 'next/server';
import { WebhookEvent, Client, FlexMessage } from '@line/bot-sdk';
import { sendStoreLocationCard, sendConfirmationSuccessMessage } from '@/lib/line/client';
import { verifyLineSignatureWithSecret } from '@/lib/security/line';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { supabaseAdmin } from '@/lib/supabase/client';
import { refreshInvestorTierAndTotals } from '@/lib/services/investor-tier';
import {
  claimWebhookEvent,
  completeWebhookClaim,
  readBoundedWebhookText,
  releaseWebhookClaim,
  webhookReplayErrorResponse,
} from '@/lib/security/webhook-replay';

const MAX_LINE_EVENTS = 100;

function lineEventMaterial(event: WebhookEvent): string {
  const webhookEventId = (event as WebhookEvent & { webhookEventId?: unknown }).webhookEventId;
  return typeof webhookEventId === 'string' && webhookEventId.length <= 256
    ? webhookEventId
    : JSON.stringify(event);
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function validUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function formatAmount(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString('th-TH') : '-';
}

function logWebhookFailure(stage: string, error?: unknown) {
  console.error(`[line:webhook] ${stage}`, {
    type: error instanceof Error ? error.name : 'unknown',
  });
}

function getDropPointLineClient() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT;
  const secret = process.env.LINE_CHANNEL_SECRET_DROPPOINT;
  if (!token) return null;
  return new Client({ channelAccessToken: token, channelSecret: secret || '' });
}

function getInvestorLineClient() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST;
  const secret = process.env.LINE_CHANNEL_SECRET_INVEST;
  if (!token) return null;
  return new Client({ channelAccessToken: token, channelSecret: secret || '' });
}

function formatDropPointDestination(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  if (!relation || typeof relation !== 'object') {
    return 'กรุณาติดต่อเจ้าหน้าที่เพื่อยืนยันจุดส่งสินค้า';
  }

  const dropPoint = relation as Record<string, unknown>;
  const normalize = (field: unknown) => typeof field === 'string' ? field.trim() : '';
  const name = normalize(dropPoint.drop_point_name);
  const address = [
    dropPoint.addr_house_no,
    dropPoint.addr_village,
    dropPoint.addr_street,
    dropPoint.addr_sub_district,
    dropPoint.addr_district,
    dropPoint.addr_province,
    dropPoint.addr_postcode,
  ]
    .map(normalize)
    .filter(Boolean)
    .join(' ');

  return [name, address].filter(Boolean).join('\n')
    || 'กรุณาติดต่อเจ้าหน้าที่เพื่อยืนยันจุดส่งสินค้า';
}

export async function GET() {
  return NextResponse.json({
    message: 'Webhook endpoint is working',
    note: 'This endpoint only accepts POST requests from LINE Platform'
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedWebhookText(request);
    const signature = request.headers.get('x-line-signature');
    const channelSecret = process.env.LINE_CHANNEL_SECRET || '';

    if (!channelSecret) {
      console.error('[line:webhook] LINE_CHANNEL_SECRET is not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    if (!signature || !verifyLineSignatureWithSecret(body, signature, channelSecret)) {
      console.warn('[line:webhook] rejected invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (!body) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    let data: { events?: unknown };
    try {
      data = JSON.parse(body) as { events?: unknown };
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    const events = Array.isArray(data.events) ? data.events as WebhookEvent[] : [];
    if (events.length > MAX_LINE_EVENTS) {
      return NextResponse.json({ error: 'Too many events' }, { status: 400 });
    }

    for (const event of events) {
      const claim = await claimWebhookEvent({
        namespace: 'line-pawner',
        material: lineEventMaterial(event),
        signingSecret: channelSecret,
      });
      if (claim.duplicate) continue;
      try {
        if (event.type === 'follow') {
          await handleFollowEvent(event);
        } else if (event.type === 'postback') {
          await handlePostbackEvent(event);
        } else if (event.type === 'message') {
          await handleMessageEvent(event);
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
    console.error('[line:webhook] processing failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

async function handleFollowEvent(event: WebhookEvent) {
  if (event.type !== 'follow') return;

  const userId = event.source.userId;
  if (!userId) return;

  try {
    const { db } = await connectToDatabase();
    const customersCollection = db.collection('customers');

    // Check if user already exists
    const existingCustomer = await customersCollection.findOne({ lineId: userId });

    if (!existingCustomer) {
      // User doesn't exist - do nothing
      // They will see the default Rich Menu for new users
      console.log('[line:webhook] new follower received');
    } else {
      // User already exists - Rich Menu will be set when they register
      console.log('[line:webhook] existing follower received');
    }
  } catch (error) {
    logWebhookFailure('follow handling failed', error);
    throw error;
  }
}

async function handlePostbackEvent(event: WebhookEvent) {
  if (event.type !== 'postback') return;

  const userId = event.source.userId;
  if (!userId) return;

  const postbackData = event.postback?.data;
  if (!postbackData) return;

  console.log('[line:webhook] postback received');

  try {
    // Parse postback data
    const params = new URLSearchParams(postbackData);
    const action = params.get('action');
    const itemId = params.get('itemId');

    if (action === 'store_location' && itemId) {
      try {
        console.log('[line:webhook] store-location action started');

        // Validate itemId format
        if (!itemId.match(/^[0-9a-fA-F]{24}$/)) {
          console.warn('[line:webhook] invalid item identifier');
          return;
        }

        // Find store associated with this item
        const { db } = await connectToDatabase();
        const itemsCollection = db.collection('items');
        const storesCollection = db.collection('stores');

        const item = await itemsCollection.findOne({
          _id: new ObjectId(itemId)
        });

        if (!item) {
          console.warn('[line:webhook] item was not found');
          return;
        }

        if (item.lineId !== userId) {
          console.warn('[line:webhook] item ownership mismatch');
          return;
        }

        if (!item.storeId) {
          console.warn('[line:webhook] item has no assigned store');
          return;
        }

        // Validate storeId format
        const storeIdStr = item.storeId.toString();
        if (!storeIdStr.match(/^[0-9a-fA-F]{24}$/)) {
          console.warn('[line:webhook] invalid store identifier');
          return;
        }

        // Find store data
        const store = await storesCollection.findOne({
          _id: new ObjectId(storeIdStr)
        });

        if (!store) {
          console.warn('[line:webhook] assigned store was not found');
          return;
        }

        console.log('[line:webhook] sending store location');

        // Send store location card
        await sendStoreLocationCard(userId, store);
                console.log('[line:webhook] store location sent');
              } catch (error) {
                logWebhookFailure('store location failed', error);
                throw error;
              }
            } else if (action === 'confirm_contract_modification' && itemId) {
              try {
                console.log('[line:webhook] contract confirmation started');

                if (!itemId.match(/^[0-9a-fA-F]{24}$/)) {
                  console.warn('[line:webhook] invalid item identifier');
                  return;
                }

                const { db } = await connectToDatabase();
                const itemsCollection = db.collection('items');
                const contractsCollection = db.collection('contracts');
                const customersCollection = db.collection('customers');

                // ดึงข้อมูล item ที่มีข้อมูลการยืนยัน
                const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });

                if (!item) {
                  console.error('Item not found');
                  return;
                }

                if (item.lineId !== userId) {
                  console.warn('[line:webhook] item ownership mismatch');
                  return;
                }

                if (item.confirmationStatus !== 'pending') {
                  console.warn('[line:webhook] invalid contract confirmation transition');
                  return;
                }

                const reservation = await itemsCollection.updateOne(
                  { _id: new ObjectId(itemId), lineId: userId, confirmationStatus: 'pending' },
                  { $set: { confirmationStatus: 'processing', updatedAt: new Date() } },
                );
                if (reservation.modifiedCount !== 1) return;

                // เลือกใช้ข้อมูลการยืนยัน (confirmationNewContract มี priority สูงกว่า confirmationProposedContract)
                const confirmedContract = item.confirmationNewContract || item.confirmationProposedContract;

                if (!confirmedContract) {
                  console.error('No confirmed contract data found');
                  await itemsCollection.updateOne(
                    { _id: new ObjectId(itemId), lineId: userId, confirmationStatus: 'processing' },
                    { $set: { confirmationStatus: 'pending', updatedAt: new Date() } },
                  );
                  return;
                }

                // แปลงค่าให้เป็น number เพื่อป้องกัน string concatenation
                const pawnedPrice = parseFloat(String(confirmedContract.pawnPrice || confirmedContract.pawnedPrice)) || 0;
                const interestRate = parseFloat(String(confirmedContract.interestRate)) || 10;
                const periodDays = parseInt(String(confirmedContract.loanDays || confirmedContract.periodDays)) || 30;
                const totalInterest = parseFloat(String(confirmedContract.interest || confirmedContract.interestAmount)) || 0;
                const remainingAmount = pawnedPrice + totalInterest;
                if (
                  pawnedPrice <= 0
                  || pawnedPrice > 100_000_000
                  || interestRate <= 0
                  || interestRate > 100
                  || periodDays <= 0
                  || periodDays > 3650
                  || !ObjectId.isValid(String(confirmedContract.storeId || ''))
                ) {
                  await itemsCollection.updateOne(
                    { _id: new ObjectId(itemId), lineId: userId, confirmationStatus: 'processing' },
                    { $set: { confirmationStatus: 'pending', updatedAt: new Date() } },
                  );
                  console.warn('[line:webhook] invalid confirmed contract values');
                  return;
                }

                // คำนวณ dueDate อย่างถูกต้อง
                const startDate = new Date();
                const dueDate = new Date(startDate.getTime());
                dueDate.setDate(dueDate.getDate() + periodDays);

                console.log('[line:webhook] contract values validated');

                // ตรวจสอบว่ามี contract สำหรับ item นี้อยู่แล้วหรือไม่
                const existingContract = await contractsCollection.findOne({
                  'item.itemId': new ObjectId(itemId)
                });

                if (existingContract) {
                  console.log('[line:webhook] existing contract update started');

                  // อัพเดท contract ที่มีอยู่
                  const contractUpdate = await contractsCollection.updateOne(
                    { _id: existingContract._id, lineId: userId },
                    {
                      $set: {
                        'pawnDetails.pawnedPrice': pawnedPrice,
                        'pawnDetails.interestRate': interestRate,
                        'pawnDetails.periodDays': periodDays,
                        'pawnDetails.totalInterest': totalInterest,
                        'pawnDetails.remainingAmount': remainingAmount,
                        'dates.dueDate': dueDate,
                        updatedAt: new Date()
                      }
                    }
                  );
                  if (contractUpdate.matchedCount !== 1) throw new Error('CONTRACT_OWNER_MISMATCH');

                  await itemsCollection.updateOne(
                    { _id: new ObjectId(itemId), lineId: userId, confirmationStatus: 'processing' },
                    {
                      $set: { confirmationStatus: 'confirmed', updatedAt: new Date() },
                      $unset: {
                        confirmationModifications: 1,
                        confirmationProposedContract: 1,
                        confirmationTimestamp: 1,
                      },
                    },
                  );

                  console.log('[line:webhook] existing contract updated');
                  return;
                }

                // สร้างสัญญาจริง (ถ้ายังไม่มี)
                const contractNumber = `PW${Date.now()}`;
                const proposedContract = confirmedContract;

                const newContract = {
                  contractNumber,
                  status: 'active',
                  customerId: item.customerId || item.lineId, // ใช้ customerId หรือ lineId เป็น fallback
                  lineId: item.lineId,
                  item: {
                    itemId: item._id,
                    brand: item.brand,
                    model: item.model,
                    type: item.type,
                    serialNo: item.serialNo || '',
                    condition: item.condition,
                    defects: item.defects || '',
                    accessories: item.accessories || '',
                    images: item.images || [],
                  },
                  pawnDetails: {
                    aiEstimatedPrice: item.estimatedValue || 0,
                    pawnedPrice: pawnedPrice,
                    interestRate: interestRate,
                    periodDays: periodDays,
                    totalInterest: totalInterest,
                    remainingAmount: remainingAmount,
                    fineAmount: 0,
                    payInterest: 0,
                    soldAmount: 0,
                  },
                  dates: {
                    startDate,
                    dueDate,
                    extendedDate: null,
                    redeemedDate: null,
                  },
                  storeId: new ObjectId(proposedContract.storeId),
                  storeName: proposedContract.storeName,
                  // เพิ่มฟิลด์สำหรับบันทึก URL
                  documents: {
                    contractHtmlUrl: null, // จะอัปเดตหลังจากสร้าง HTML
                    verificationPhotoUrl: null, // จะอัปเดตหลังจากถ่ายรูป
                  },
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };

                const result = await contractsCollection.insertOne(newContract);

                // อัปเดต item status และเพิ่ม contract reference
                await itemsCollection.updateOne(
                  { _id: new ObjectId(itemId), lineId: userId, confirmationStatus: 'processing' },
                  {
                    $set: {
                      status: 'contracted',
                      confirmationStatus: 'confirmed',
                      contractId: result.insertedId,
                      storeId: new ObjectId(proposedContract.storeId),
                      updatedAt: new Date()
                    },
                    $unset: {
                      confirmationModifications: 1,
                      confirmationProposedContract: 1,
                      confirmationTimestamp: 1
                    },
                    $push: {
                      contractHistory: result.insertedId as any,
                    } as any,
                  }
                );

                // อัปเดตข้อมูลลูกค้า
                await customersCollection.updateOne(
                  { lineId: item.lineId },
                  {
                    $set: {
                      storeId: new ObjectId(proposedContract.storeId),
                    },
                    $push: {
                      contractsID: result.insertedId as any,
                    } as any,
                    $inc: {
                      totalContracts: 1,
                      totalValue: proposedContract.pawnPrice || proposedContract.pawnedPrice,
                    },
                  }
                );

                // ส่งข้อความยืนยันสำเร็จให้ user (ใช้ค่าที่แปลงแล้ว)
                try {
                  await sendConfirmationSuccessMessage(item.lineId, {
                    contractNumber,
                    storeName: proposedContract.storeName,
                    pawnedPrice: pawnedPrice,
                    remainingAmount: remainingAmount,
                    dueDate: dueDate.toISOString(),
                  });
                } catch (messageError) {
                  logWebhookFailure('contract success notification delayed', messageError);
                  // ไม่ให้ error นี้หยุดการทำงานหลัก
                }

                console.log('[line:webhook] contract created');
              } catch (error) {
                try {
                  const { db } = await connectToDatabase();
                  await db.collection('items').updateOne(
                    { _id: new ObjectId(itemId), lineId: userId, confirmationStatus: 'processing' },
                    { $set: { confirmationStatus: 'pending', updatedAt: new Date() } },
                  );
                } catch {
                  // A reconciliation job should surface any stale processing row.
                }
                logWebhookFailure('contract modification confirmation failed', error);
                throw error;
              }
            } else if (action === 'cancel_contract_modification' && itemId) {
              try {
                console.log('[line:webhook] contract cancellation started');

                if (!itemId.match(/^[0-9a-fA-F]{24}$/)) {
                  console.warn('[line:webhook] invalid item identifier');
                  return;
                }

                const { db } = await connectToDatabase();
                const itemsCollection = db.collection('items');

                // Update item confirmation status to canceled
                const cancelResult = await itemsCollection.updateOne(
                  { _id: new ObjectId(itemId), lineId: userId, confirmationStatus: 'pending' },
                  {
                    $set: {
                      confirmationStatus: 'canceled',
                      updatedAt: new Date()
                    }
                  }
                );

                if (cancelResult.modifiedCount !== 1) {
                  console.warn('[line:webhook] invalid contract cancellation transition');
                  return;
                }

                console.log('[line:webhook] contract confirmation canceled');
              } catch (error) {
                logWebhookFailure('contract modification cancellation failed', error);
                throw error;
              }
    } else if (action === 'upload_slip') {
              // Handle slip upload postback (customer wants to upload payment slip)
              const notificationId = params.get('notificationId');

              if (!notificationId) {
                console.error('No notificationId in upload_slip postback');
                return;
              }

              try {
                console.log('[line:webhook] slip-upload action started');

                const { db } = await connectToDatabase();
                const notificationsCollection = db.collection('notifications');

                // Find notification
                const notification = await notificationsCollection.findOne({
                  shopNotificationId: notificationId,
                  lineUserId: userId,
                });

                if (!notification) {
                  console.warn('[line:webhook] notification was not found');
                  return;
                }

                // Store the notificationId in a temporary context for this user
                // When they send an image, we'll use this to know which notification it's for
                await notificationsCollection.updateOne(
                  { _id: notification._id },
                  {
                    $set: {
                      awaitingSlipUpload: true,
                      updatedAt: new Date()
                    }
                  }
                );

                // Send instructions to customer
                const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
                if (channelAccessToken) {
                  const client = new Client({ channelAccessToken });
                  await client.pushMessage(userId, {
                    type: 'text',
                    text: 'กรุณาส่งรูปภาพสลิปการโอนเงิน\n\nหลังจากโอนเงินเรียบร้อยแล้ว กรุณาถ่ายรูปหรือ screenshot สลิปการโอนเงินแล้วส่งมาที่แชทนี้'
                  });
                }

                console.log('[line:webhook] slip-upload flow initiated');
              } catch (error) {
                logWebhookFailure('slip flow failed', error);
                throw error;
              }
    } else if (action === 'confirm_pawn') {
      // Handle confirm_pawn postback - Pawner confirms to bring item to drop point
      const contractId = params.get('contractId');
      if (!validUuid(contractId)) {
        console.error('No contractId in confirm_pawn postback');
        return;
      }

      try {
        console.log('[line:webhook] pawn confirmation started');
        const supabase = supabaseAdmin();

        // Get contract with drop point info
        const { data: contract, error: contractError } = await supabase
          .from('contracts')
          .select(`
            *,
            items:item_id (*),
            pawners:customer_id (*),
            drop_points:drop_point_id (*),
            investors:investor_id (*)
          `)
          .eq('contract_id', contractId)
          .single();

        if (contractError || !contract) {
          logWebhookFailure('contract lookup failed', contractError);
          return;
        }

        const contractPawner = relationOne(contract.pawners);
        if (!contractPawner || contractPawner.line_id !== userId) {
          console.warn('[line:webhook] contract ownership mismatch');
          return;
        }
        contract.pawners = contractPawner;
        contract.items = relationOne(contract.items);
        contract.drop_points = relationOne(contract.drop_points);
        contract.investors = relationOne(contract.investors);

        const { data: loanRequest } = await supabase
          .from('loan_requests')
          .select('delivery_method')
          .eq('request_id', contract.loan_request_id)
          .single();

        if (loanRequest?.delivery_method === 'DELIVERY') {
          const deliveryLiffId = process.env.NEXT_PUBLIC_LIFF_ID_PAWNER_DELIVERY || '2008216710-690r5uXQ';
          const deliveryUrl = `https://liff.line.me/${deliveryLiffId}?contractId=${contract.contract_id}`;

          const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
          if (channelAccessToken && contract.pawners?.line_id) {
            const client = new Client({ channelAccessToken });
            await client.pushMessage(contract.pawners.line_id, {
              type: 'text',
              text: `คุณเลือกบริการจัดส่งสินค้าผ่าน Drop Point\nกรุณากรอกที่อยู่เพื่อให้รถเข้ารับสินค้าได้ที่ลิงก์นี้:\n${deliveryUrl}`
            });
          }
          return;
        }

        // Idempotency check at database level - check if already confirmed
        if (contract.item_delivery_status === 'PAWNER_CONFIRMED' ||
            contract.item_delivery_status === 'DELIVERED' ||
            contract.item_delivery_status === 'VERIFIED') {
          console.log('[line:webhook] pawn confirmation already applied');
          const dropPointDestination = formatDropPointDestination(contract.drop_points);
          // Send a polite reminder message instead
          const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
          if (channelAccessToken && contract.pawners?.line_id) {
            const client = new Client({ channelAccessToken });
            await client.pushMessage(contract.pawners.line_id, {
              type: 'text',
              text: `คุณได้ยืนยันการขอสินเชื่อไปแล้ว\n\nกรุณานำสินค้าไปส่งที่:\n${dropPointDestination}\n\nภายในเวลาทำการของวันถัดไป`
            });
          }
          return;
        }

        // Reserve the only valid delivery transition so a second, distinct
        // postback cannot move a later state (for example IN_TRANSIT) back.
        const { data: deliveryConfirmed, error: deliveryUpdateError } = await supabase
          .from('contracts')
          .update({
            item_delivery_status: 'PAWNER_CONFIRMED',
            updated_at: new Date().toISOString()
          })
          .eq('contract_id', contractId)
          .eq('item_delivery_status', 'PENDING')
          .select('contract_id')
          .maybeSingle();
        if (deliveryUpdateError) throw new Error('DELIVERY_CONFIRMATION_FAILED');
        if (!deliveryConfirmed) {
          console.warn('[line:webhook] invalid delivery confirmation transition');
          return;
        }

        // Send confirmation to pawner
        const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (channelAccessToken && contract.pawners?.line_id) {
          const dropPointDestination = formatDropPointDestination(contract.drop_points);
          const client = new Client({ channelAccessToken });
          await client.pushMessage(contract.pawners.line_id, {
            type: 'text',
            text: `ยืนยันการขอสินเชื่อเรียบร้อยแล้ว\n\nกรุณานำสินค้าไปส่งที่:\n${dropPointDestination}\n\nภายในเวลาทำการของวันถัดไป`
          });
        }

        // Notify Drop Point to expect item
        if (contract.drop_points?.line_id) {
          const dropPointNotification = createDropPointNotificationCard(contract);
          try {
            const dpClient = getDropPointLineClient();
            if (!dpClient) {
              console.warn('DropPoint LINE client not configured, skipping pushMessage');
            } else {
              await dpClient.pushMessage(contract.drop_points.line_id, dropPointNotification);
            }
            console.log('[line:webhook] drop-point notification sent');
          } catch (dpError) {
            logWebhookFailure('drop-point notification delayed', dpError);
          }
        }

        console.log('[line:webhook] pawn confirmation processed');
      } catch (error) {
        logWebhookFailure('pawn confirmation failed', error);
        throw error;
      }
    } else if (action === 'confirm_payment') {
      // Handle confirm_payment postback - Pawner confirms receiving payment from investor
      const contractId = params.get('contractId');
      const paymentId = params.get('paymentId');

      if (!validUuid(contractId) || !validUuid(paymentId)) {
        console.error('No contractId in confirm_payment postback');
        return;
      }

      try {
        console.log('[line:webhook] payment confirmation started');
        const supabase = supabaseAdmin();

        // Get contract
        const { data: contract, error: contractError } = await supabase
          .from('contracts')
          .select(`
            *,
            items:item_id (*),
            pawners:customer_id (*),
            investors:investor_id (*)
          `)
          .eq('contract_id', contractId)
          .single();

        if (contractError || !contract) {
          logWebhookFailure('contract lookup failed', contractError);
          return;
        }

        const contractPawner = relationOne(contract.pawners);
        if (!contractPawner || contractPawner.line_id !== userId) {
          console.warn('[line:webhook] contract ownership mismatch');
          return;
        }
        contract.pawners = contractPawner;
        contract.items = relationOne(contract.items);
        contract.investors = relationOne(contract.investors);

        // Idempotency check at database level - check if already confirmed
        if (contract.payment_status === 'COMPLETED' || contract.contract_status === 'CONFIRMED') {
          console.log('[line:webhook] payment confirmation already applied');
          // Send a polite confirmation message instead
          const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
          if (channelAccessToken && contract.pawners?.line_id) {
            const client = new Client({ channelAccessToken });
            await client.pushMessage(contract.pawners.line_id, {
              type: 'text',
              text: `คุณได้ยืนยันการรับเงินไปแล้ว\n\nจำนวนเงิน: ${formatAmount(contract.loan_principal_amount)} บาท\nหมายเลขสัญญา: ${contract.contract_number || '-'}`
            });
          }
          return;
        }

        if (contract.payment_status !== 'INVESTOR_PAID') {
          console.warn('[line:webhook] invalid payment confirmation transition');
          return;
        }

        const { data: payment, error: paymentLookupError } = await supabase
          .from('payments')
          .select('payment_id, contract_id, payment_status')
          .eq('payment_id', paymentId)
          .eq('contract_id', contractId)
          .maybeSingle();
        if (paymentLookupError || !payment || !['PENDING', 'COMPLETED'].includes(payment.payment_status)) {
          console.warn('[line:webhook] payment record mismatch');
          return;
        }

        if (payment.payment_status === 'PENDING') {
          const { data: completedPayment, error: paymentUpdateError } = await supabase
            .from('payments')
            .update({
              payment_status: 'COMPLETED',
              confirmed_by_recipient: true,
              confirmed_at: new Date().toISOString(),
            })
            .eq('payment_id', paymentId)
            .eq('contract_id', contractId)
            .eq('payment_status', 'PENDING')
            .select('payment_id')
            .maybeSingle();
          if (paymentUpdateError || !completedPayment) throw new Error('PAYMENT_CONFIRMATION_CONFLICT');
        }

        // Update contract status to CONFIRMED (fully confirmed contract)
        const { data: confirmedContract, error: confirmContractError } = await supabase
          .from('contracts')
          .update({
            payment_status: 'COMPLETED',
            payment_confirmed_at: new Date().toISOString(),
            contract_status: 'CONFIRMED',
            updated_at: new Date().toISOString()
          })
          .eq('contract_id', contractId)
          .eq('payment_status', 'INVESTOR_PAID')
          .select('contract_id')
          .maybeSingle();
        if (confirmContractError || !confirmedContract) throw new Error('CONTRACT_CONFIRMATION_CONFLICT');

        // Send confirmation to pawner
        const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (channelAccessToken && contract.pawners?.line_id) {
          const client = new Client({ channelAccessToken });
          await client.pushMessage(contract.pawners.line_id, {
            type: 'text',
            text: `ยืนยันการรับเงินเรียบร้อยแล้ว\n\nจำนวนเงิน: ${formatAmount(contract.loan_principal_amount)} บาท\nหมายเลขสัญญา: ${contract.contract_number || '-'}\n\nสัญญาสินเชื่อเริ่มต้นแล้ว กรุณาชำระคืนภายในกำหนด`
          });
        }

        // Notify investor
        if (contract.investors?.line_id) {
          try {
            const invClient = getInvestorLineClient();
            if (!invClient) throw new Error('Investor LINE client not configured');
            await invClient.pushMessage(contract.investors.line_id, {
              type: 'text',
              text: `ผู้ขอสินเชื่อยืนยันรับเงินแล้ว\n\nหมายเลขสัญญา: ${contract.contract_number}\nสัญญาสินเชื่อเริ่มต้นเรียบร้อยแล้ว`
            });
          } catch (invError) {
            logWebhookFailure('investor notification delayed', invError);
          }
        }

        console.log('[line:webhook] payment confirmation processed');
      } catch (error) {
        logWebhookFailure('payment confirmation failed', error);
        throw error;
      }
    } else if (action === 'reject_payment') {
      // Handle reject_payment postback - Pawner rejects/hasn't received payment
      const contractId = params.get('contractId');
      const paymentId = params.get('paymentId');

      if (!validUuid(contractId) || !validUuid(paymentId)) {
        console.error('No contractId in reject_payment postback');
        return;
      }

      try {
        console.log('[line:webhook] payment rejection started');
        const supabase = supabaseAdmin();

        // Get contract
        const { data: contract, error: contractError } = await supabase
          .from('contracts')
          .select(`
            *,
            investors:investor_id (*),
            pawners:customer_id (*)
          `)
          .eq('contract_id', contractId)
          .single();

        if (contractError || !contract) {
          logWebhookFailure('contract lookup failed', contractError);
          return;
        }

        const contractPawner = relationOne(contract.pawners);
        if (!contractPawner || contractPawner.line_id !== userId) {
          console.warn('[line:webhook] contract ownership mismatch');
          return;
        }
        contract.pawners = contractPawner;
        contract.investors = relationOne(contract.investors);

        // Fetch payment record (if provided) to strengthen idempotency checks
        let payment: any = null;
        const { data: paymentData, error: paymentLookupError } = await supabase
          .from('payments')
          .select('payment_id, contract_id, payment_status, paid_by_investor_id, confirmed_by_recipient, confirmed_at')
          .eq('payment_id', paymentId)
          .eq('contract_id', contractId)
          .maybeSingle();
        if (paymentLookupError || !paymentData) {
          console.warn('[line:webhook] payment record mismatch');
          return;
        }
        payment = paymentData;

        // Idempotency check - already rejected before
        if (contract.payment_status === 'REJECTED') {
          console.log('[line:webhook] payment rejection already applied');
          const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
          if (channelAccessToken && contract.pawners?.line_id) {
            const client = new Client({ channelAccessToken });
            await client.pushMessage(contract.pawners.line_id, {
              type: 'text',
              text: `คำขอ "ยังไม่ได้รับเงิน" ได้ถูกส่งไปแล้ว\n\nหมายเลขสัญญา: ${contract.contract_number}\n\nหากยังมีปัญหา กรุณาติดต่อ Support`
            });
          }
          return;
        }

        // IDEMPOTENCY CHECK - Check funding_status to prevent duplicate rejection actions
        // Only allow reject if funding is still PENDING or payment is still being processed
        if (contract.funding_status === 'FUNDED' || contract.funding_status === 'DISBURSED') {
          console.log('[line:webhook] payment rejection blocked after funding');

          // Send message to pawner explaining the situation
          const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
          if (channelAccessToken && contract.pawners?.line_id) {
            const client = new Client({ channelAccessToken });
            await client.pushMessage(contract.pawners.line_id, {
              type: 'text',
              text: `การปฏิเสธการชำระเงินนี้ไม่สามารถทำได้แล้ว\n\nสัญญาได้รับการโอนเงินเรียบร้อยแล้ว\nหมายเลขสัญญา: ${contract.contract_number}\n\nหากมีปัญหากรุณาติดต่อ Support`
            });
          }
          return;
        }

        // Check payment status for idempotency (contract-level + payment-level)
        if (
          contract.contract_status === 'CONFIRMED' ||
          contract.payment_status === 'COMPLETED' ||
          contract.payment_confirmed_at ||
          payment?.payment_status === 'COMPLETED' ||
          payment?.confirmed_by_recipient === true ||
          payment?.confirmed_at
        ) {
          console.log('[line:webhook] payment rejection blocked after confirmation');

          const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
          if (channelAccessToken && contract.pawners?.line_id) {
            const client = new Client({ channelAccessToken });
            await client.pushMessage(contract.pawners.line_id, {
              type: 'text',
              text: `คุณได้ยืนยันรับเงินไปแล้ว\n\nหมายเลขสัญญา: ${contract.contract_number}\n\nหากมีข้อสงสัยกรุณาติดต่อ Support`
            });
          }
          return;
        }

        // Update payment record if paymentId provided
        // Valid payment_status values: PENDING, PROCESSING, COMPLETED, FAILED, REFUNDED
        if (contract.payment_status !== 'INVESTOR_PAID' || payment.payment_status !== 'PENDING') {
          console.warn('[line:webhook] invalid payment rejection transition');
          return;
        }

        const { data: failedPayment, error: paymentError } = await supabase
          .from('payments')
          .update({ payment_status: 'FAILED' })
          .eq('payment_id', paymentId)
          .eq('contract_id', contractId)
          .eq('payment_status', 'PENDING')
          .select('payment_id')
          .maybeSingle();
        if (paymentError || !failedPayment) throw new Error('PAYMENT_REJECTION_CONFLICT');

        // Update contract status to indicate payment issue
        const { data: rejectedContract, error: rejectContractError } = await supabase
          .from('contracts')
          .update({
            payment_status: 'REJECTED',
            updated_at: new Date().toISOString()
          })
          .eq('contract_id', contractId)
          .eq('payment_status', 'INVESTOR_PAID')
          .select('contract_id')
          .maybeSingle();
        if (rejectContractError || !rejectedContract) throw new Error('CONTRACT_REJECTION_CONFLICT');

        // Send confirmation to pawner
        const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (channelAccessToken && contract.pawners?.line_id) {
          const client = new Client({ channelAccessToken });
          await client.pushMessage(contract.pawners.line_id, {
            type: 'text',
            text: `แจ้งนักลงทุนแล้วว่ายังไม่ได้รับเงิน\n\nหมายเลขสัญญา: ${contract.contract_number}\n\nนักลงทุนจะได้รับแจ้งให้ตรวจสอบและดำเนินการใหม่`
          });
        }

        // Notify investor to re-upload slip ONLY IF funding is still pending
        if (contract.funding_status === 'PENDING' && contract.investors?.line_id) {
          try {
            const invClient = getInvestorLineClient();
            if (!invClient) throw new Error('Investor LINE client not configured');
            await invClient.pushMessage(contract.investors.line_id, {
              type: 'text',
              text: `ผู้ขอสินเชื่อแจ้งว่ายังไม่ได้รับเงิน\n\nหมายเลขสัญญา: ${contract.contract_number}\n\nกรุณาตรวจสอบการโอนเงินและส่งหลักฐานการโอนเงินใหม่อีกครั้ง`
            });
            console.log('[line:webhook] investor notification sent');
          } catch (invError) {
            logWebhookFailure('investor notification delayed', invError);
          }
        } else {
          console.log('[line:webhook] investor notification not applicable');
        }

        console.log('[line:webhook] payment rejection processed');
      } catch (error) {
        logWebhookFailure('payment rejection failed', error);
        throw error;
      }
    }

    // ==================== REDEMPTION HANDLERS ====================

    // Pawner confirms they received the item
    if (action === 'pawner_confirm_received') {
      const redemptionId = params.get('redemptionId');
      if (!validUuid(redemptionId)) {
        console.error('No redemptionId in pawner_confirm_received postback');
        return;
      }

      try {
        console.log('[line:webhook] redemption confirmation started');
        const supabase = supabaseAdmin();

        // Get redemption with all details
        const { data: redemption, error: redemptionError } = await supabase
          .from('redemption_requests')
          .select(`
            *,
            contract:contract_id (
              *,
              items:item_id (*),
              pawners:customer_id (*),
              investors:investor_id (*)
            )
          `)
          .eq('redemption_id', redemptionId)
          .single();

        if (redemptionError || !redemption) {
          logWebhookFailure('redemption lookup failed', redemptionError);
          return;
        }

        const redemptionContract = relationOne(redemption.contract);
        const redemptionPawner = relationOne(redemptionContract?.pawners);
        if (!redemptionContract || !redemptionPawner || redemptionPawner.line_id !== userId) {
          console.warn('[line:webhook] redemption ownership mismatch');
          return;
        }
        redemptionContract.pawners = redemptionPawner;
        redemptionContract.items = relationOne(redemptionContract.items);
        redemptionContract.investors = relationOne(redemptionContract.investors);
        redemption.contract = redemptionContract;

        // Idempotency check - check if already confirmed
        if (redemption.request_status === 'PAWNER_CONFIRMED' || redemption.pawner_confirmed_at) {
          console.log('[line:webhook] redemption confirmation already applied');
          const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
          if (channelAccessToken) {
            const client = new Client({ channelAccessToken });
            await client.pushMessage(userId, {
              type: 'text',
              text: `คุณได้ยืนยันรับสินค้าไปแล้ว\n\nขอบคุณที่ใช้บริการ Astly`
            });
          }
          return;
        }

        const contract = redemption.contract;
        const investor = contract?.investors;
        const item = contract?.items;

        const msPerDay = 1000 * 60 * 60 * 24;
        const startDate = new Date(contract?.contract_start_date || new Date().toISOString());
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(contract?.contract_end_date || new Date().toISOString());
        endDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const rawDaysInContract = Number(contract?.contract_duration_days || 0)
          || Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay);
        const daysInContract = Math.max(1, rawDaysInContract);
        const rawDaysElapsed = Math.floor((today.getTime() - startDate.getTime()) / msPerDay) + 1;
        const daysElapsed = Math.min(daysInContract, Math.max(1, rawDaysElapsed));

        const investorRate = Number(contract?.investor_rate || 0.015);
        const principal = Number(contract?.loan_principal_amount || 0);
        const interestEarned = Math.round(principal * investorRate * (daysElapsed / 30) * 100) / 100;
        const platformFee = contract?.platform_fee_amount || 0;
        const netProfit = interestEarned;

        // Update redemption status
        const { data: confirmedRedemption, error: redemptionUpdateError } = await supabase
          .from('redemption_requests')
          .update({
            request_status: 'PAWNER_CONFIRMED',
            pawner_confirmed_at: new Date().toISOString(),
            investor_interest_earned: interestEarned,
            platform_fee_deducted: platformFee,
            investor_net_profit: netProfit,
            updated_at: new Date().toISOString(),
          })
          .eq('redemption_id', redemptionId)
          .not('request_status', 'in', '(PAWNER_CONFIRMED,COMPLETED)')
          .is('pawner_confirmed_at', null)
          .select('redemption_id')
          .maybeSingle();
        if (redemptionUpdateError || !confirmedRedemption) throw new Error('REDEMPTION_CONFIRMATION_CONFLICT');

        // Update contract status to COMPLETED
        await supabase
          .from('contracts')
          .update({
            contract_status: 'COMPLETED',
            redemption_status: 'COMPLETED',
            item_delivery_status: 'RETURNED',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('contract_id', redemption.contract_id);

        if (contract?.investor_id) {
          try {
            await refreshInvestorTierAndTotals(contract.investor_id);
          } catch (refreshError) {
            logWebhookFailure('investor totals refresh delayed', refreshError);
          }
        }

        // Update item status
        await supabase
          .from('items')
          .update({
            item_status: 'RETURNED',
            updated_at: new Date().toISOString(),
          })
          .eq('item_id', contract?.item_id);

        // Send confirmation to Pawner
        const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (channelAccessToken) {
          const client = new Client({ channelAccessToken });
          const itemName = [item?.brand, item?.model].filter(Boolean).join(' ').trim() || 'สินค้า';
          await client.pushMessage(userId, {
            type: 'text',
            text: `ยืนยันรับสินค้าเรียบร้อยแล้ว\n\n${itemName}\n\nขอบคุณที่ใช้บริการ Astly`
          });
        }

        // Send notification to Investor
        if (investor?.line_id) {
          const investorCard = createInvestorRedemptionCompleteCard(redemption, contract, netProfit);
          try {
            const invClient = getInvestorLineClient();
            if (!invClient) throw new Error('Investor LINE client not configured');
            await invClient.pushMessage(investor.line_id, investorCard);
          } catch (invError) {
            logWebhookFailure('investor notification delayed', invError);
          }
        }

        console.log('[line:webhook] redemption confirmation processed');
      } catch (error) {
        logWebhookFailure('redemption confirmation failed', error);
        throw error;
      }
    }

    if (action === 'pawner_report_not_received') {
      const redemptionId = params.get('redemptionId');
      if (!redemptionId) {
        console.error('No redemptionId in pawner_report_not_received postback');
        return;
      }

      const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (!channelAccessToken) {
        return;
      }

      const client = new Client({ channelAccessToken });
      await client.pushMessage(userId, {
        type: 'text',
        text: 'หากยังไม่ได้รับของคืนกรุณาติดต่อเจ้าหน้าที่ช่วยเหลือ ภายใน 48 ชั่วโมง',
      });
    }

  } catch (error) {
    logWebhookFailure('postback handling failed', error);
    throw error;
  }
}

// Create card for Investor when redemption is complete
function createInvestorRedemptionCompleteCard(redemption: any, contract: any, netProfit: number): FlexMessage {
  const item = contract?.items;

  return {
    type: 'flex',
    altText: 'สัญญาไถ่ถอนเสร็จสิ้น',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'สัญญาไถ่ถอนเสร็จสิ้น',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }, {
          type: 'text',
          text: 'ผู้ขอสินเชื่อยืนยันรับของแล้ว',
          size: 'sm',
          color: '#ffffff',
          align: 'center',
          margin: 'sm'
        }],
        backgroundColor: '#1E3A8A',
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
              { type: 'text', text: 'เงินต้น:', color: '#666666', size: 'sm', flex: 3 },
              { type: 'text', text: `${formatAmount(contract?.loan_principal_amount)} บาท`, color: '#333333', size: 'sm', flex: 4 }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'ดอกเบี้ยรับ:', color: '#666666', size: 'sm', flex: 3 },
              { type: 'text', text: `+${formatAmount(redemption.investor_interest_earned)} บาท`, color: '#1E3A8A', size: 'sm', flex: 4, weight: 'bold' }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'ค่าธรรมเนียม:', color: '#666666', size: 'sm', flex: 3 },
              { type: 'text', text: `-${formatAmount(redemption.platform_fee_deducted)} บาท`, color: '#999999', size: 'sm', flex: 4 }
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
              { type: 'text', text: 'กำไรสุทธิ:', color: '#1E3A8A', size: 'lg', flex: 3, weight: 'bold' },
              { type: 'text', text: `+${netProfit.toLocaleString()} บาท`, color: '#1E3A8A', size: 'xl', flex: 4, weight: 'bold' }
            ]
          },
          {
            type: 'text',
            text: 'ตรวจสอบยอดเงินในบัญชีของคุณได้เลย',
            size: 'xs',
            color: '#888888',
            margin: 'lg',
            wrap: true
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
              label: 'ยืนยันได้รับเงิน',
              data: `action=investor_confirm_received&redemptionId=${redemption.redemption_id}`
            },
            style: 'primary',
            color: '#1E3A8A'
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: 'แจ้งปัญหา',
              data: `action=investor_report_problem&redemptionId=${redemption.redemption_id}`
            },
            style: 'secondary'
          }
        ]
      }
    }
  };
}

// Helper function to create drop point notification card
function createDropPointNotificationCard(contract: any): FlexMessage {
  const itemName = [contract.items?.brand, contract.items?.model].filter(Boolean).join(' ').trim() || '-';
  const pawnerName = [contract.pawners?.firstname, contract.pawners?.lastname].filter(Boolean).join(' ').trim() || '-';
  const formatShortDate = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('th-TH');
  };
  const deliveryDate = formatShortDate(
    contract.item_received_at
      || contract.item_verified_at
      || contract.updated_at
      || contract.created_at
      || new Date().toISOString()
  );
  const capacityText = contract.items?.capacity
    || contract.items?.storage
    || contract.items?.storage_capacity
    || '-';
  const colorText = contract.items?.color || '-';

  return {
    type: 'flex',
    altText: 'มีสินค้าใหม่รอรับ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'มีสินค้าใหม่รอรับ',
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
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'สินค้า:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: itemName, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'ความจุ:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: capacityText, color: '#333333', size: 'sm', flex: 5 }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'สี:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: colorText, color: '#333333', size: 'sm', flex: 5 }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'วันที่ส่งมา:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: deliveryDate, color: '#333333', size: 'sm', flex: 5 }
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
              { type: 'text', text: 'ผู้ขอสินเชื่อ:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: pawnerName, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'เบอร์:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: contract.pawners?.phone_number || '-', color: '#333333', size: 'sm', flex: 5 }
            ]
          }
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
            label: 'ตรวจสอบสินค้า',
            uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_LIST || '2008651088-6wNs8Yrr'}?contractId=${contract.contract_id}`
          },
          style: 'primary',
          color: '#365314'
        }]
      }
    }
  };
}

async function handleMessageEvent(event: WebhookEvent) {
  if (event.type !== 'message') return;

  const userId = event.source.userId;
  if (!userId) return;

  // Check if it's an image message
  if (event.message.type !== 'image') return;

  const messageId = event.message.id;
  try {
    const { db } = await connectToDatabase();
    const notificationsCollection = db.collection('notifications');

    // Find notification that's awaiting slip upload for this user
    const notification = await notificationsCollection.findOne({
      lineUserId: userId,
      status: 'confirmed',
      awaitingSlipUpload: true
    });

    if (!notification) {
      return;
    }

    // Call upload-payment-proof API
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://astly.io';
    const internalSecret = String(process.env.INTERNAL_API_SECRET || '').trim();
    if (!internalSecret) throw new Error('INTERNAL_API_SECRET_NOT_CONFIGURED');
    const response = await fetch(`${baseUrl}/api/customer/upload-payment-proof`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${internalSecret}`,
      },
      body: JSON.stringify({
        notificationId: notification.shopNotificationId,
        lineUserId: userId,
        imageId: messageId
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.error('[line:webhook] payment proof handoff failed');

      // Send error message to user
      const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (channelAccessToken) {
        const client = new Client({ channelAccessToken });
        await client.pushMessage(userId, {
          type: 'text',
          text: 'เกิดข้อผิดพลาดในการอัพโหลดสลิป กรุณาลองใหม่อีกครั้งหรือติดต่อร้านค้า'
        });
      }
      return;
    }

    // Clear awaiting flag
    const cleared = await notificationsCollection.updateOne(
      { _id: notification._id },
      {
        $unset: { awaitingSlipUpload: 1 },
        $set: { updatedAt: new Date() }
      }
    );
    if (cleared.matchedCount !== 1) throw new Error('PAYMENT_PROOF_CONTEXT_CLEAR_FAILED');

    console.log('[line:webhook] payment proof uploaded');

  } catch (error) {
    console.error('[line:webhook] image message processing failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}
