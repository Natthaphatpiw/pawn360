import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Client, ClientConfig } from '@line/bot-sdk';
import { ObjectId } from 'mongodb';

const storeConfig: ClientConfig = {
  channelAccessToken: process.env.LINE_STORE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_STORE_CHANNEL_SECRET || '',
};

const storeClient = new Client(storeConfig);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contractId, contractNumber, actionType, amount, lineId } = body;

    if (!contractId || !actionType || !lineId) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const contractsCollection = db.collection('contracts');
    const customersCollection = db.collection('customers');
    const storesCollection = db.collection('stores');

    // Get contract details
    const contract = await contractsCollection.findOne({ _id: new ObjectId(contractId) });
    if (!contract) {
      return NextResponse.json(
        { error: 'ไม่พบสัญญา' },
        { status: 404 }
      );
    }

    // Get customer details
    const customer = await customersCollection.findOne({ lineId });
    if (!customer) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลลูกค้า' },
        { status: 404 }
      );
    }

    // Get store details
    const store = await storesCollection.findOne({ _id: contract.storeId });
    if (!store) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลร้านค้า' },
        { status: 404 }
      );
    }

    // Send notification to all store LINE IDs
    const storeLineIds = store.lineIds || [];

    if (storeLineIds.length === 0) {
      return NextResponse.json(
        { error: 'ร้านค้ายังไม่มีผู้รับการแจ้งเตือน' },
        { status: 400 }
      );
    }

    const actionText = actionType === 'renew' ? 'ต่อดอกเบี้ย' : 'ไถ่ถอนสินค้า';
    const actionColor = actionType === 'renew' ? '#2563EB' : '#16A34A';

    // Create Flex Message
    const flexMessage = {
      type: 'flex' as const,
      altText: `🔔 ${actionText} - ${customer.fullName}`,
      contents: {
        type: 'bubble' as const,
        header: {
          type: 'box' as const,
          layout: 'vertical' as const,
          contents: [
            {
              type: 'text' as const,
              text: `🔔 ${actionText}`,
              weight: 'bold' as const,
              size: 'lg' as const,
              color: '#ffffff',
            },
          ],
          backgroundColor: actionColor,
          paddingAll: 'lg',
        },
        body: {
          type: 'box' as const,
          layout: 'vertical' as const,
          contents: [
            {
              type: 'text' as const,
              text: 'ข้อมูลลูกค้า',
              weight: 'bold' as const,
              size: 'md' as const,
              margin: 'md' as const,
            },
            {
              type: 'box' as const,
              layout: 'vertical' as const,
              margin: 'lg' as const,
              spacing: 'sm' as const,
              contents: [
                {
                  type: 'box' as const,
                  layout: 'baseline' as const,
                  spacing: 'sm' as const,
                  contents: [
                    {
                      type: 'text' as const,
                      text: 'ชื่อ:',
                      color: '#666666',
                      size: 'sm' as const,
                      flex: 2,
                    },
                    {
                      type: 'text' as const,
                      text: customer.fullName,
                      wrap: true,
                      color: '#333333',
                      size: 'sm' as const,
                      flex: 5,
                      weight: 'bold' as const,
                    },
                  ],
                },
                {
                  type: 'box' as const,
                  layout: 'baseline' as const,
                  spacing: 'sm' as const,
                  contents: [
                    {
                      type: 'text' as const,
                      text: 'เบอร์:',
                      color: '#666666',
                      size: 'sm' as const,
                      flex: 2,
                    },
                    {
                      type: 'text' as const,
                      text: customer.phone,
                      wrap: true,
                      color: '#333333',
                      size: 'sm' as const,
                      flex: 5,
                    },
                  ],
                },
                {
                  type: 'box' as const,
                  layout: 'baseline' as const,
                  spacing: 'sm' as const,
                  contents: [
                    {
                      type: 'text' as const,
                      text: 'LINE ID:',
                      color: '#666666',
                      size: 'sm' as const,
                      flex: 2,
                    },
                    {
                      type: 'text' as const,
                      text: lineId.substring(0, 10) + '...',
                      wrap: true,
                      color: '#333333',
                      size: 'xs' as const,
                      flex: 5,
                    },
                  ],
                },
              ],
            },
            {
              type: 'separator' as const,
              margin: 'xl' as const,
            },
            {
              type: 'text' as const,
              text: 'ข้อมูลสัญญา',
              weight: 'bold' as const,
              size: 'md' as const,
              margin: 'xl' as const,
            },
            {
              type: 'box' as const,
              layout: 'vertical' as const,
              margin: 'lg' as const,
              spacing: 'sm' as const,
              contents: [
                {
                  type: 'box' as const,
                  layout: 'baseline' as const,
                  spacing: 'sm' as const,
                  contents: [
                    {
                      type: 'text' as const,
                      text: 'เลขสัญญา:',
                      color: '#666666',
                      size: 'sm' as const,
                      flex: 2,
                    },
                    {
                      type: 'text' as const,
                      text: contractNumber,
                      wrap: true,
                      color: '#333333',
                      size: 'sm' as const,
                      flex: 5,
                      weight: 'bold' as const,
                    },
                  ],
                },
                {
                  type: 'box' as const,
                  layout: 'baseline' as const,
                  spacing: 'sm' as const,
                  contents: [
                    {
                      type: 'text' as const,
                      text: 'สินค้า:',
                      color: '#666666',
                      size: 'sm' as const,
                      flex: 2,
                    },
                    {
                      type: 'text' as const,
                      text: `${contract.item.brand} ${contract.item.model}`,
                      wrap: true,
                      color: '#333333',
                      size: 'sm' as const,
                      flex: 5,
                    },
                  ],
                },
                {
                  type: 'box' as const,
                  layout: 'baseline' as const,
                  spacing: 'sm' as const,
                  contents: [
                    {
                      type: 'text' as const,
                      text: 'รายการ:',
                      color: '#666666',
                      size: 'sm' as const,
                      flex: 2,
                    },
                    {
                      type: 'text' as const,
                      text: actionText,
                      wrap: true,
                      color: actionColor,
                      size: 'md' as const,
                      flex: 5,
                      weight: 'bold' as const,
                    },
                  ],
                },
                {
                  type: 'separator' as const,
                  margin: 'md' as const,
                },
                {
                  type: 'box' as const,
                  layout: 'baseline' as const,
                  spacing: 'sm' as const,
                  margin: 'md' as const,
                  contents: [
                    {
                      type: 'text' as const,
                      text: 'จำนวนเงิน:',
                      color: '#666666',
                      size: 'sm' as const,
                      flex: 2,
                    },
                    {
                      type: 'text' as const,
                      text: `${amount.toLocaleString()} บาท`,
                      wrap: true,
                      color: '#E91E63',
                      size: 'xl' as const,
                      flex: 5,
                      weight: 'bold' as const,
                    },
                  ],
                },
              ],
            },
          ],
        },
        footer: {
          type: 'box' as const,
          layout: 'vertical' as const,
          spacing: 'sm' as const,
          contents: [
            {
              type: 'text' as const,
              text: '💡 กรุณาติดต่อลูกค้าภายใน 24 ชั่วโมง',
              size: 'xs' as const,
              color: '#999999',
              align: 'center' as const,
            },
          ],
        },
      },
    };

    // Send to all store LINE IDs
    for (const storeLineId of storeLineIds) {
      try {
        await storeClient.pushMessage(storeLineId, flexMessage);
        console.log(`Sent notification to store LINE ID: ${storeLineId}`);
      } catch (error) {
        console.error(`Failed to send to ${storeLineId}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'ส่งคำขอไปยังร้านค้าเรียบร้อยแล้ว',
    });
  } catch (error: any) {
    console.error('Request action error:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการส่งคำขอ' },
      { status: 500 }
    );
  }
}
