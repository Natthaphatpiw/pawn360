import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Client, ClientConfig } from '@line/bot-sdk';
import { ObjectId } from 'mongodb';
import { getS3Client } from '@/lib/aws/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';

// Lazy initialization of LINE client
let storeClient: Client | null = null;

function getStoreClient(): Client {
  if (!storeClient) {
    const channelAccessToken = process.env.LINE_STORE_CHANNEL_ACCESS_TOKEN || process.env.CHANNEL_ACCESS_TOKEN;
    const channelSecret = process.env.LINE_STORE_CHANNEL_SECRET || process.env.CHANNEL_SECRET;

    if (!channelAccessToken || !channelSecret) {
      throw new Error('LINE channel access token or secret not configured');
    }

    const storeConfig: ClientConfig = {
      channelAccessToken,
      channelSecret,
    };

    storeClient = new Client(storeConfig);
  }
  return storeClient;
}

// Function to upload slip to S3
async function uploadSlipToS3(slipBuffer: Buffer, contractId: string, actionType: string): Promise<string | null> {
  try {
    const timestamp = Date.now();
    const filename = `slip-${contractId}-${actionType}-${timestamp}.jpg`;
    const s3Client = getS3Client();

    const uploadParams = {
      Bucket: 'piwp360',
      Key: `slips/${filename}`,
      Body: slipBuffer,
      ContentType: 'image/jpeg'
    };

    await s3Client.send(new PutObjectCommand(uploadParams));
    return `https://piwp360.s3.ap-southeast-2.amazonaws.com/slips/${filename}`;
  } catch (error) {
    console.error('Failed to upload slip:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check if request is multipart/form-data (has slip file)
    const contentType = request.headers.get('content-type') || '';
    let body: any;
    let slipFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      body = {
        contractId: formData.get('contractId'),
        actionType: formData.get('actionType'),
        amount: formData.get('amount'),
        lineId: null, // Will be set later from session/LIFF
      };
      slipFile = formData.get('slip') as File;
    } else {
      body = await request.json();
    }

    const { contractId, actionType, amount, lineId, contractNumber } = body;

    if (!contractId || !actionType) {
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

    // Get customer details (use contract.lineId if not provided)
    const customerLineId = lineId || contract.lineId;
    const customer = await customersCollection.findOne({ lineId: customerLineId });
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

    let actionText = '';
    let actionColor = '#365314';

    switch (actionType) {
      case 'redeem':
        actionText = 'ไถ่ถอนสินค้า';
        actionColor = '#365314';
        break;
      case 'renew':
        actionText = 'ต่อดอกเบี้ย';
        actionColor = '#2F6B3B';
        break;
      case 'reduce':
        actionText = 'ลดเงินต้น';
        actionColor = '#4D7C0F';
        break;
      case 'increase_principal':
        actionText = 'เพิ่มเงินต้น';
        actionColor = '#3F6212';
        break;
      default:
        actionText = actionType;
        actionColor = '#365314';
    }

    // Create Flex Message
    const flexMessage = {
      type: 'flex' as const,
      altText: `${actionText} - ${customer.fullName}`,
      contents: {
        type: 'bubble' as const,
        header: {
          type: 'box' as const,
          layout: 'vertical' as const,
          contents: [
            {
              type: 'text' as const,
              text: `${actionText}`,
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
                      text: contract.contractNumber || contractNumber,
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
              text: 'กรุณาติดต่อลูกค้าภายใน 24 ชั่วโมง',
              size: 'xs' as const,
              color: '#999999',
              align: 'center' as const,
            },
          ],
        },
      },
    };

    // Upload slip to S3 if provided
    let slipUrl = null;
    if (slipFile) {
      const slipBuffer = Buffer.from(await slipFile.arrayBuffer());
      slipUrl = await uploadSlipToS3(slipBuffer, contractId, actionType);
    }

    // Create transaction record
    const transactionRecord = {
      id: `TXN${Date.now()}`,
      type: actionType,
      amount: parseFloat(amount),
      timestamp: new Date(),
      slipUrl: slipUrl,
      status: 'pending', // pending, approved, rejected
      customerInfo: {
        lineId: customerLineId,
        fullName: customer.fullName,
        phone: customer.phone
      },
      contractInfo: {
        contractNumber: contract.contractNumber || contractNumber,
        item: `${contract.item.brand} ${contract.item.model}`
      }
    };

    // Add transaction to contract's transactionHistory
    const existingContract = await contractsCollection.findOne({ _id: new ObjectId(contractId) });
    const currentHistory = existingContract?.transactionHistory || [];
    const updatedHistory = [...currentHistory, transactionRecord];

    await contractsCollection.updateOne(
      { _id: new ObjectId(contractId) },
      {
        $set: {
          transactionHistory: updatedHistory,
          updatedAt: new Date()
        }
      }
    );

    // Send to all store LINE IDs
    try {
      const client = getStoreClient();
      for (const storeLineId of storeLineIds) {
        try {
          await client.pushMessage(storeLineId, flexMessage);
          console.log(`Sent notification to store LINE ID: ${storeLineId}`);
        } catch (error) {
          console.error(`Failed to send to ${storeLineId}:`, error);
        }
      }
    } catch (error) {
      console.error('LINE client initialization failed:', error);
      return NextResponse.json(
        { error: 'LINE messaging service unavailable' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'ส่งคำขอไปยังร้านค้าเรียบร้อยแล้ว',
      transactionId: transactionRecord.id
    });
  } catch (error: any) {
    console.error('Request action error:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการส่งคำขอ' },
      { status: 500 }
    );
  }
}
