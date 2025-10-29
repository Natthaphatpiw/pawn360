import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { Client } from '@line/bot-sdk';
import { createPendingApprovalMessage } from '@/lib/line/flex-templates';

// Lazy initialization of LINE client
let lineClient: Client | null = null;

function getLineClient(): Client {
  if (!lineClient) {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!channelAccessToken || !channelSecret) {
      throw new Error('LINE channel access token or secret not configured');
    }

    lineClient = new Client({
      channelAccessToken,
      channelSecret,
    });
  }
  return lineClient;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contractId, lineUserId, message } = body;

    if (!contractId || !lineUserId) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');
    const storesCollection = db.collection('stores');
    const notificationsCollection = db.collection('notifications');

    // 1. Get item details
    const item = await itemsCollection.findOne({
      _id: new ObjectId(contractId),
      lineId: lineUserId
    });

    if (!item) {
      return NextResponse.json(
        { error: 'ไม่พบรายการจำนำ' },
        { status: 404 }
      );
    }

    // Check if item is active
    if (item.status !== 'active') {
      return NextResponse.json(
        { error: 'รายการนี้ไม่สามารถดำเนินการได้' },
        { status: 400 }
      );
    }

    // 2. Get store details
    const store = await storesCollection.findOne({ _id: item.storeId });
    if (!store) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลร้านค้า' },
        { status: 404 }
      );
    }

    // 5. Create callback URL
    const callbackUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/shop-notification`;

    // 6. Send request to Shop System
    const shopSystemUrl = process.env.SHOP_SYSTEM_URL || 'https://pawn360-ver.vercel.app';

    try {
      const response = await fetch(`${shopSystemUrl}/api/notifications/extension`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storeId: item.storeId.toString(),
          customerId: lineUserId,
          contractId: item._id.toString(),
          customerName: 'ลูกค้า', // TODO: ดึงจาก collection อื่นถ้ามี
          phone: '', // TODO: ดึงจาก collection อื่นถ้ามี
          message: `ต้องการต่อดอกเบี้ยสัญญา ${item._id.toString()}`,
          callbackUrl: callbackUrl
        })
      });

      if (!response.ok) {
        console.error('Shop System API error:', await response.text());
        throw new Error('ไม่สามารถส่งคำขอไปยังระบบร้านได้');
      }

      const notificationData = await response.json();
      console.log('Shop System response:', notificationData);

      // 7. Save notification to database
      await notificationsCollection.insertOne({
        shopNotificationId: notificationData.notificationId,
        contractId: item._id,
        customerId: new ObjectId(lineUserId), // TODO: ใช้ customerId จริง
        lineUserId,
        type: 'extension',
        status: 'pending',
        callbackUrl: callbackUrl,
        createdAt: new Date()
      });

      // 8. Send LINE message to customer
      try {
        const client = getLineClient();
        const flexMessage = createPendingApprovalMessage('extension', item._id.toString());
        await client.pushMessage(lineUserId, flexMessage);
      } catch (lineError) {
        console.error('Failed to send LINE message:', lineError);
        // Don't fail the request if LINE message fails
      }

      return NextResponse.json({
        success: true,
        message: 'ส่งคำขอต่อดอกเบี้ยเรียบร้อยแล้ว รอพนักงานดำเนินการ',
        notificationId: notificationData.notificationId
      });

    } catch (shopError: any) {
      console.error('Failed to send to Shop System:', shopError);
      return NextResponse.json(
        { error: 'ไม่สามารถเชื่อมต่อกับระบบร้านได้ กรุณาลองใหม่อีกครั้ง' },
        { status: 503 }
      );
    }

  } catch (error: any) {
    console.error('Request extension error:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการส่งคำขอ' },
      { status: 500 }
    );
  }
}