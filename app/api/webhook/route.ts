import { NextRequest, NextResponse } from 'next/server';
import { WebhookEvent, Client } from '@line/bot-sdk';
import { verifySignature, sendStoreLocationCard, sendConfirmationSuccessMessage } from '@/lib/line/client';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

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

                // ใช้ storeId จาก item.storeId ซึ่งได้ถูกตั้งค่าไว้แล้ว หรือจาก confirmedContract
                const storeIdToUse = item.storeId?.toString() || confirmedContract?.storeId?.toString();

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
                  storeId: new ObjectId(storeIdToUse),
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
                      storeId: new ObjectId(storeIdToUse),
                      updatedAt: new Date()
                    },
                    $unset: {
                      confirmationModifications: 1,
                      confirmationProposedContract: 1,
                      confirmationNewContract: 1,
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
                      storeId: new ObjectId(storeIdToUse),
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
                    text: '📸 กรุณาส่งรูปภาพสลิปการโอนเงิน\n\nหลังจากโอนเงินเรียบร้อยแล้ว กรุณาถ่ายรูปหรือ screenshot สลิปการโอนเงินแล้วส่งมาที่แชทนี้'
                  });
                }

                console.log(`Upload slip flow initiated for notification: ${notificationId}`);
              } catch (error) {
                console.error('Error processing upload_slip:', error);
              }
    }

  } catch (error) {
    console.error('Error handling postback event:', error);
  }
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
