import { NextRequest, NextResponse } from 'next/server';
import { WebhookEvent, Client, FlexMessage } from '@line/bot-sdk';
import { verifySignature, sendStoreLocationCard, sendConfirmationSuccessMessage } from '@/lib/line/client';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { supabaseAdmin } from '@/lib/supabase/client';

// Drop Point LINE OA client
const dropPointLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT || 'ji1K2C80ufvt/XsJZ5HiuP/vJxZaNy4th02C+/p6WdazVlWps/KdKTn3OHhH6B5fsJD5Exjio8tFjPPg80BIGS27t52Z2d9zm47/pOWxwqi3iJGOS7N8BDtJGH7Vsn78xnBOBSr3z4QAEn9n11WO5wdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET_DROPPOINT || '9f5767cfe8ecb9c068c6f25502eee416'
});

// Investor LINE OA client
const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || 'vkhbKJj/xMWX9RWJUPOfr6cfNa5N+jJhp7AX1vpK4poDpkCF4dy/3cPGy4+rmATi0KE9tD/ewmtYLd7nv+0651xY5L7Guy8LGvL1vhc9yuXWFy9wuGPvDQFGfWeva5WFPv2go4BrpP1j+ux63XjsEwdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || 'ed704b15d57c8b84f09ebc3492f9339c'
});

export async function GET() {
  return NextResponse.json({
    message: 'Webhook endpoint is working',
    note: 'This endpoint only accepts POST requests from LINE Platform'
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature');

    console.log('Webhook received:', {
      hasBody: !!body,
      bodyLength: body?.length,
      hasSignature: !!signature,
      channelSecretConfigured: !!process.env.LINE_CHANNEL_SECRET,
    });

    // If body is empty, it's a verification request - just return 200
    if (!body || body.trim() === '') {
      console.log('Empty body - verification request');
      return NextResponse.json({ success: true });
    }

    // Verify signature if present
    if (signature && process.env.LINE_CHANNEL_SECRET) {
      const isValid = verifySignature(body, signature);
      console.log('Signature verification:', isValid);

      if (!isValid) {
        console.error('🚨 SECURITY WARNING: Invalid webhook signature detected!');
        console.error('🚨 This could indicate a security breach or misconfiguration');
        console.error('🚨 IMMEDIATE ACTION REQUIRED:');
        console.error('   1. Check LINE Developers Console > Channel Settings > Basic Settings');
        console.error('   2. Copy Channel Secret (not Channel Access Token)');
        console.error('   3. Update LINE_CHANNEL_SECRET in Vercel Environment Variables');
        console.error('   4. Redeploy the application');
        console.error('🚨 Temporarily allowing request to prevent service disruption');
        console.error('🚨 FIX THIS IMMEDIATELY IN PRODUCTION!');
      }
    } else {
      console.warn('No signature or channel secret - skipping verification');
    }

    const data = JSON.parse(body);
    const events: WebhookEvent[] = data.events || [];

    console.log('Processing events:', events.length);

    // Process each event
    for (const event of events) {
      if (event.type === 'follow') {
        await handleFollowEvent(event);
      } else if (event.type === 'postback') {
        await handlePostbackEvent(event);
      } else if (event.type === 'message') {
        await handleMessageEvent(event);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
      console.log(`New user followed: ${userId}`);
    } else {
      // User already exists - Rich Menu will be set when they register
      console.log(`Existing user followed: ${userId}`);
    }
  } catch (error) {
    console.error('Error handling follow event:', error);
  }
}

async function handlePostbackEvent(event: WebhookEvent) {
  if (event.type !== 'postback') return;

  const userId = event.source.userId;
  if (!userId) return;

  const postbackData = event.postback?.data;
  if (!postbackData) return;

  console.log(`Postback received: ${postbackData} from user: ${userId}`);

  try {
    // Parse postback data
    const params = new URLSearchParams(postbackData);
    const action = params.get('action');
    const itemId = params.get('itemId');

    if (action === 'store_location' && itemId) {
      try {
        console.log(`Processing store_location for itemId: ${itemId}`);

        // Validate itemId format
        if (!itemId.match(/^[0-9a-fA-F]{24}$/)) {
          console.error('Invalid itemId format:', itemId);
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
          console.error('Item not found:', itemId);
          return;
        }

        if (!item.storeId) {
          console.error('Item has no storeId:', itemId);
          return;
        }

        // Validate storeId format
        const storeIdStr = item.storeId.toString();
        if (!storeIdStr.match(/^[0-9a-fA-F]{24}$/)) {
          console.error('Invalid storeId format:', storeIdStr);
          return;
        }

        // Find store data
        const store = await storesCollection.findOne({
          _id: new ObjectId(storeIdStr)
        });

        if (!store) {
          console.error('Store not found:', storeIdStr);
          return;
        }

        console.log(`Found store: ${store.storeName}, sending location card`);

        // Send store location card
        await sendStoreLocationCard(userId, store);
                console.log(`Store location card sent successfully for store: ${store.storeName}`);
              } catch (error) {
                console.error('Error processing store_location:', error);
                console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
              }
            } else if (action === 'confirm_contract_modification' && itemId) {
              try {
                console.log(`Processing contract modification confirmation for itemId: ${itemId}`);

                if (!itemId.match(/^[0-9a-fA-F]{24}$/)) {
                  console.error('Invalid itemId format:', itemId);
                  return;
                }

                const { db } = await connectToDatabase();
                const itemsCollection = db.collection('items');
                const contractsCollection = db.collection('contracts');
                const customersCollection = db.collection('customers');
                const storesCollection = db.collection('stores');

                // ดึงข้อมูล item ที่มีข้อมูลการยืนยัน
                const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });

                if (!item) {
                  console.error('Item not found');
                  return;
                }

                // เลือกใช้ข้อมูลการยืนยัน (confirmationNewContract มี priority สูงกว่า confirmationProposedContract)
                const confirmedContract = item.confirmationNewContract || item.confirmationProposedContract;

                if (!confirmedContract) {
                  console.error('No confirmed contract data found');
                  return;
                }

                // แปลงค่าให้เป็น number เพื่อป้องกัน string concatenation
                const pawnedPrice = parseFloat(String(confirmedContract.pawnPrice || confirmedContract.pawnedPrice)) || 0;
                const interestRate = parseFloat(String(confirmedContract.interestRate)) || 10;
                const periodDays = parseInt(String(confirmedContract.loanDays || confirmedContract.periodDays)) || 30;
                const totalInterest = parseFloat(String(confirmedContract.interest || confirmedContract.interestAmount)) || 0;
                const remainingAmount = pawnedPrice + totalInterest;

                // คำนวณ dueDate อย่างถูกต้อง
                const startDate = new Date();
                const dueDate = new Date(startDate.getTime());
                dueDate.setDate(dueDate.getDate() + periodDays);

                console.log(`💰 Contract calculation - Price: ${pawnedPrice}, Interest: ${totalInterest}, Total: ${remainingAmount}, Days: ${periodDays}`);
                console.log(`📅 Date calculation - Start: ${startDate.toISOString()}, Due: ${dueDate.toISOString()}, Period: ${periodDays} days`);

                // ตรวจสอบว่ามี contract สำหรับ item นี้อยู่แล้วหรือไม่
                const existingContract = await contractsCollection.findOne({
                  'item.itemId': new ObjectId(itemId)
                });

                if (existingContract) {
                  console.log(`Contract already exists for item ${itemId}, updating instead of creating new one`);

                  // อัพเดท contract ที่มีอยู่
                  await contractsCollection.updateOne(
                    { _id: existingContract._id },
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

                  console.log(`Contract updated successfully for itemId: ${itemId}`);
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
                  { _id: new ObjectId(itemId) },
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
                  console.error('Error sending confirmation success message:', messageError);
                  // ไม่ให้ error นี้หยุดการทำงานหลัก
                }

                console.log(`Contract created successfully for itemId: ${itemId}, contractId: ${result.insertedId}`);
              } catch (error) {
                console.error('Error processing contract modification confirmation:', error);
                console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
              }
            } else if (action === 'cancel_contract_modification' && itemId) {
              try {
                console.log(`Processing contract modification cancellation for itemId: ${itemId}`);

                if (!itemId.match(/^[0-9a-fA-F]{24}$/)) {
                  console.error('Invalid itemId format:', itemId);
                  return;
                }

                const { db } = await connectToDatabase();
                const itemsCollection = db.collection('items');

                // Update item confirmation status to canceled
                await itemsCollection.updateOne(
                  { _id: new ObjectId(itemId) },
                  {
                    $set: {
                      confirmationStatus: 'canceled',
                      updatedAt: new Date()
                    }
                  }
                );

                console.log(`Contract modification canceled for itemId: ${itemId}`);
              } catch (error) {
                console.error('Error processing contract modification cancellation:', error);
                console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
              }
    } else if (action === 'upload_slip') {
              // Handle slip upload postback (customer wants to upload payment slip)
              const notificationId = params.get('notificationId');

              if (!notificationId) {
                console.error('No notificationId in upload_slip postback');
                return;
              }

              try {
                console.log(`Processing upload_slip for notificationId: ${notificationId}`);

                const { db } = await connectToDatabase();
                const notificationsCollection = db.collection('notifications');

                // Find notification
                const notification = await notificationsCollection.findOne({
                  shopNotificationId: notificationId
                });

                if (!notification) {
                  console.error('Notification not found:', notificationId);
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

                console.log(`Upload slip flow initiated for notification: ${notificationId}`);
              } catch (error) {
                console.error('Error processing upload_slip:', error);
              }
    } else if (action === 'confirm_pawn') {
      // Handle confirm_pawn postback - Pawner confirms to bring item to drop point
      const contractId = params.get('contractId');
      if (!contractId) {
        console.error('No contractId in confirm_pawn postback');
        return;
      }

      try {
        console.log(`Processing confirm_pawn for contractId: ${contractId}`);
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
          console.error('Contract not found:', contractError);
          return;
        }

        // Update contract status
        await supabase
          .from('contracts')
          .update({
            item_delivery_status: 'PAWNER_CONFIRMED',
            updated_at: new Date().toISOString()
          })
          .eq('contract_id', contractId);

        // Send confirmation to pawner
        const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (channelAccessToken && contract.pawners?.line_id) {
          const client = new Client({ channelAccessToken });
          await client.pushMessage(contract.pawners.line_id, {
            type: 'text',
            text: `ยืนยันการจำนำเรียบร้อยแล้ว\n\nกรุณานำสินค้าไปส่งที่:\n${contract.drop_points?.drop_point_name}\n${contract.drop_points?.address}\n\nภายใน 24 ชั่วโมง`
          });
        }

        // Notify Drop Point to expect item
        if (contract.drop_points?.line_id) {
          const dropPointNotification = createDropPointNotificationCard(contract);
          try {
            await dropPointLineClient.pushMessage(contract.drop_points.line_id, dropPointNotification);
            console.log(`Sent notification to drop point ${contract.drop_points.line_id}`);
          } catch (dpError) {
            console.error('Error sending to drop point:', dpError);
          }
        }

        console.log(`Confirm pawn processed for contractId: ${contractId}`);
      } catch (error) {
        console.error('Error processing confirm_pawn:', error);
      }
    } else if (action === 'confirm_payment') {
      // Handle confirm_payment postback - Pawner confirms receiving payment from investor
      const contractId = params.get('contractId');
      const paymentId = params.get('paymentId');

      if (!contractId) {
        console.error('No contractId in confirm_payment postback');
        return;
      }

      try {
        console.log(`Processing confirm_payment for contractId: ${contractId}`);
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
          console.error('Contract not found:', contractError);
          return;
        }

        // Update contract status to CONFIRMED (fully confirmed contract)
        await supabase
          .from('contracts')
          .update({
            payment_status: 'COMPLETED',
            payment_confirmed_at: new Date().toISOString(),
            contract_status: 'CONFIRMED',
            updated_at: new Date().toISOString()
          })
          .eq('contract_id', contractId);

        // Update payment record if paymentId provided
        // Valid payment_status values: PENDING, PROCESSING, COMPLETED, FAILED, REFUNDED
        if (paymentId) {
          await supabase
            .from('payments')
            .update({
              payment_status: 'COMPLETED'
            })
            .eq('payment_id', paymentId);
        }

        // Send confirmation to pawner
        const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (channelAccessToken && contract.pawners?.line_id) {
          const client = new Client({ channelAccessToken });
          await client.pushMessage(contract.pawners.line_id, {
            type: 'text',
            text: `ยืนยันการรับเงินเรียบร้อยแล้ว\n\nจำนวนเงิน: ${contract.loan_principal_amount?.toLocaleString()} บาท\nหมายเลขสัญญา: ${contract.contract_number}\n\nสัญญาจำนำเริ่มต้นแล้ว กรุณาชำระคืนภายในกำหนด`
          });
        }

        // Notify investor
        if (contract.investors?.line_id) {
          try {
            await investorLineClient.pushMessage(contract.investors.line_id, {
              type: 'text',
              text: `ผู้จำนำยืนยันรับเงินแล้ว\n\nหมายเลขสัญญา: ${contract.contract_number}\nสัญญาจำนำเริ่มต้นเรียบร้อยแล้ว`
            });
          } catch (invError) {
            console.error('Error sending to investor:', invError);
          }
        }

        console.log(`Confirm payment processed for contractId: ${contractId}`);
      } catch (error) {
        console.error('Error processing confirm_payment:', error);
      }
    } else if (action === 'reject_payment') {
      // Handle reject_payment postback - Pawner rejects/hasn't received payment
      const contractId = params.get('contractId');
      const paymentId = params.get('paymentId');

      if (!contractId) {
        console.error('No contractId in reject_payment postback');
        return;
      }

      try {
        console.log(`Processing reject_payment for contractId: ${contractId}`);
        const supabase = supabaseAdmin();

        // Get contract
        const { data: contract, error: contractError } = await supabase
          .from('contracts')
          .select(`
            *,
            investors:investor_id (*)
          `)
          .eq('contract_id', contractId)
          .single();

        if (contractError || !contract) {
          console.error('Contract not found:', contractError);
          return;
        }

        // Update payment record if paymentId provided
        // Valid payment_status values: PENDING, PROCESSING, COMPLETED, FAILED, REFUNDED
        if (paymentId) {
          await supabase
            .from('payments')
            .update({
              payment_status: 'FAILED'
            })
            .eq('payment_id', paymentId);
        }

        // Notify investor to re-upload slip
        if (contract.investors?.line_id) {
          try {
            await investorLineClient.pushMessage(contract.investors.line_id, {
              type: 'text',
              text: `ผู้จำนำแจ้งว่ายังไม่ได้รับเงิน\n\nหมายเลขสัญญา: ${contract.contract_number}\n\nกรุณาตรวจสอบการโอนเงินและส่งหลักฐานใหม่`
            });
          } catch (invError) {
            console.error('Error sending to investor:', invError);
          }
        }

        console.log(`Reject payment processed for contractId: ${contractId}`);
      } catch (error) {
        console.error('Error processing reject_payment:', error);
      }
    }

    // ==================== REDEMPTION HANDLERS ====================

    // Pawner confirms they received the item
    if (action === 'pawner_confirm_received') {
      const redemptionId = params.get('redemptionId');
      if (!redemptionId) {
        console.error('No redemptionId in pawner_confirm_received postback');
        return;
      }

      try {
        console.log(`Processing pawner_confirm_received for redemptionId: ${redemptionId}`);
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
          console.error('Redemption not found:', redemptionError);
          return;
        }

        const contract = redemption.contract;
        const investor = contract?.investors;
        const item = contract?.items;

        // Calculate investor earnings
        const interestEarned = redemption.interest_amount || 0;
        const platformFee = contract?.platform_fee_amount || 0;
        const netProfit = interestEarned - platformFee;

        // Update redemption status
        await supabase
          .from('redemption_requests')
          .update({
            request_status: 'PAWNER_CONFIRMED',
            pawner_confirmed_at: new Date().toISOString(),
            investor_interest_earned: interestEarned,
            platform_fee_deducted: platformFee,
            investor_net_profit: netProfit,
            updated_at: new Date().toISOString(),
          })
          .eq('redemption_id', redemptionId);

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
          await client.pushMessage(userId, {
            type: 'text',
            text: `ยืนยันรับสินค้าเรียบร้อยแล้ว\n\n${item?.brand} ${item?.model}\n\nขอบคุณที่ใช้บริการ Pawnly`
          });
        }

        // Send notification to Investor
        if (investor?.line_id) {
          const investorCard = createInvestorRedemptionCompleteCard(redemption, contract, netProfit);
          try {
            await investorLineClient.pushMessage(investor.line_id, investorCard);
          } catch (invError) {
            console.error('Error sending to investor:', invError);
          }
        }

        console.log(`Pawner confirmed received for redemptionId: ${redemptionId}`);
      } catch (error) {
        console.error('Error processing pawner_confirm_received:', error);
      }
    }

    // Investor confirms they received payment
    if (action === 'investor_confirm_received') {
      const redemptionId = params.get('redemptionId');
      if (!redemptionId) {
        console.error('No redemptionId in investor_confirm_received postback');
        return;
      }

      try {
        console.log(`Processing investor_confirm_received for redemptionId: ${redemptionId}`);
        const supabase = supabaseAdmin();

        // Get redemption
        const { data: redemption, error } = await supabase
          .from('redemption_requests')
          .select('*, contract:contract_id (*)')
          .eq('redemption_id', redemptionId)
          .single();

        if (error || !redemption) {
          console.error('Redemption not found:', error);
          return;
        }

        // Update redemption status
        await supabase
          .from('redemption_requests')
          .update({
            request_status: 'COMPLETED',
            investor_confirmed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('redemption_id', redemptionId);

        // Send success message to investor
        const netProfit = redemption.investor_net_profit || 0;
        const successMessage = `ยินดีด้วย! คุณได้รับกำไรจากสัญญานี้\n\n+${netProfit.toLocaleString()} บาท\n\nขอบคุณที่เป็นส่วนหนึ่งของ Pawnly\n\nอย่าลืมเช็คข้อเสนอใหม่ๆ เพื่อโอกาสในการสร้างกำไรที่มากขึ้น\n\nPawnly - ลงทุนง่าย กำไรดี`;

        try {
          await investorLineClient.pushMessage(userId, {
            type: 'text',
            text: successMessage
          });
        } catch (msgError) {
          console.error('Error sending to investor:', msgError);
        }

        console.log(`Investor confirmed received for redemptionId: ${redemptionId}`);
      } catch (error) {
        console.error('Error processing investor_confirm_received:', error);
      }
    }

    // Investor reports problem
    if (action === 'investor_report_problem') {
      const redemptionId = params.get('redemptionId');

      try {
        await investorLineClient.pushMessage(userId, {
          type: 'text',
          text: `หากพบปัญหาเกี่ยวกับการรับเงิน\n\nกรุณาติดต่อฝ่าย Support:\nโทร: 062-6092941\n\nเวลาทำการ: 09:00 - 18:00 น.\nทุกวันจันทร์ - เสาร์`
        });
      } catch (msgError) {
        console.error('Error sending support info:', msgError);
      }
    }

  } catch (error) {
    console.error('Error handling postback event:', error);
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
          text: 'ผู้จำนำยืนยันรับของแล้ว',
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
              { type: 'text', text: 'เงินต้น:', color: '#666666', size: 'sm', flex: 3 },
              { type: 'text', text: `${contract?.loan_principal_amount?.toLocaleString()} บาท`, color: '#333333', size: 'sm', flex: 4 }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'ดอกเบี้ยรับ:', color: '#666666', size: 'sm', flex: 3 },
              { type: 'text', text: `+${redemption.investor_interest_earned?.toLocaleString()} บาท`, color: '#1E3A8A', size: 'sm', flex: 4, weight: 'bold' }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'ค่าธรรมเนียม:', color: '#666666', size: 'sm', flex: 3 },
              { type: 'text', text: `-${redemption.platform_fee_deducted?.toLocaleString()} บาท`, color: '#999999', size: 'sm', flex: 4 }
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
              { type: 'text', text: `${contract.items?.brand} ${contract.items?.model}`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'ความจุ:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: contract.items?.storage_capacity || '-', color: '#333333', size: 'sm', flex: 5 }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'สี:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: contract.items?.color || '-', color: '#333333', size: 'sm', flex: 5 }
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
              { type: 'text', text: 'ผู้จำนำ:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: `${contract.pawners?.firstname} ${contract.pawners?.lastname}`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
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
            uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_VERIFY || '2008651088-m9yMlA7Q'}?contractId=${contract.contract_id}`
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
  console.log(`Image message received from ${userId}, messageId: ${messageId}`);

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
      console.log('No pending slip upload found for this user');
      return;
    }

    console.log(`Found pending notification: ${notification.shopNotificationId}, uploading slip`);

    // Call upload-payment-proof API
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pawn360.vercel.app';
    const response = await fetch(`${baseUrl}/api/customer/upload-payment-proof`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        notificationId: notification.shopNotificationId,
        lineUserId: userId,
        imageId: messageId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to upload slip:', error);

      // Send error message to user
      const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (channelAccessToken) {
        const client = new Client({ channelAccessToken });
        await client.pushMessage(userId, {
          type: 'text',
          text: '❌ เกิดข้อผิดพลาดในการอัพโหลดสลิป กรุณาลองใหม่อีกครั้งหรือติดต่อร้านค้า'
        });
      }
      return;
    }

    // Clear awaiting flag
    await notificationsCollection.updateOne(
      { _id: notification._id },
      {
        $unset: { awaitingSlipUpload: 1 },
        $set: { updatedAt: new Date() }
      }
    );

    console.log(`Slip uploaded successfully for notification: ${notification.shopNotificationId}`);

  } catch (error) {
    console.error('Error handling image message:', error);
  }
}
