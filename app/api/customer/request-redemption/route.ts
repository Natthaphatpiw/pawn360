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
    const contractsCollection = db.collection('contracts');
    const customersCollection = db.collection('customers');
    const storesCollection = db.collection('stores');
    const notificationsCollection = db.collection('notifications');

    // 1. Get contract details
    const contract = await contractsCollection.findOne({ _id: new ObjectId(contractId) });
    if (!contract) {
      return NextResponse.json(
        { error: 'ไม่พบสัญญา' },
        { status: 404 }
      );
    }

    // Check if contract is active
    if (contract.status !== 'active' && contract.status !== 'overdue') {
      return NextResponse.json(
        { error: 'สัญญานี้ไม่สามารถดำเนินการได้' },
        { status: 400 }
      );
    }

    // 2. Get customer details
    const customer = await customersCollection.findOne({ lineId: lineUserId });
    if (!customer) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลลูกค้า' },
        { status: 404 }
      );
    }

    // 3. Get store details
    const store = await storesCollection.findOne({ _id: contract.storeId });
    if (!store) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลร้านค้า' },
        { status: 404 }
      );
    }

    // 4. Calculate redemption amount
    const principal = contract.pawnDetails.pawnedPrice;
    const totalInterest = contract.pawnDetails.totalInterest;
    const redemptionAmount = principal + totalInterest;

    // 5. Create callback URL
    const callbackUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/shop-notification`;

    // 6. Send request to Shop System
    const shopSystemUrl = process.env.SHOP_SYSTEM_URL || 'https://pawn360-ver.vercel.app';
    const shopNotificationId = `REDEMPTION-${Date.now()}-${contractId}`;

    try {
      const response = await fetch(`${shopSystemUrl}/api/notifications/redemption`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notificationId: shopNotificationId,
          storeId: store._id.toString(),
          customerId: customer._id.toString(),
          contractId: contract._id.toString(),
          customerName: customer.fullName,
          phone: customer.phone,
          lineUserId: lineUserId,
          contractNumber: contract.contractNumber,
          itemDescription: `${contract.item.brand} ${contract.item.model}`,
          amount: redemptionAmount,
          message: message || 'ลูกค้าต้องการไถ่ถอนสัญญา',
          callbackUrl: callbackUrl,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        console.error('Shop System API error:', await response.text());
        throw new Error('ไม่สามารถส่งคำขอไปยังระบบร้านได้');
      }

      const shopData = await response.json();
      console.log('Shop System response:', shopData);

      // 7. Save notification to database
      await notificationsCollection.insertOne({
        shopNotificationId: shopNotificationId,
        contractId: new ObjectId(contractId),
        customerId: customer._id,
        lineUserId: lineUserId,
        type: 'redemption',
        status: 'pending',
        amount: redemptionAmount,
        message: message || 'ลูกค้าต้องการไถ่ถอนสัญญา',
        callbackUrl: callbackUrl,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // 8. Send LINE message to customer
      try {
        const client = getLineClient();
        const flexMessage = createPendingApprovalMessage('redemption', contract.contractNumber);
        await client.pushMessage(lineUserId, flexMessage);
      } catch (lineError) {
        console.error('Failed to send LINE message:', lineError);
        // Don't fail the request if LINE message fails
      }

      return NextResponse.json({
        success: true,
        message: 'ส่งคำขอไถ่ถอนเรียบร้อยแล้ว รอพนักงานดำเนินการ',
        notificationId: shopNotificationId,
        amount: redemptionAmount
      });

    } catch (shopError: any) {
      console.error('Failed to send to Shop System:', shopError);
      return NextResponse.json(
        { error: 'ไม่สามารถเชื่อมต่อกับระบบร้านได้ กรุณาลองใหม่อีกครั้ง' },
        { status: 503 }
      );
    }

  } catch (error: any) {
    console.error('Request redemption error:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการส่งคำขอ' },
      { status: 500 }
    );
  }
}
