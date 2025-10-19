import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import axios from 'axios';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LIFF_CONTRACT_DETAIL_URL = 'https://liff.line.me/2008216710-gn6BwQjo';

export async function POST(request: NextRequest) {
  try {
    const { contractId } = await request.json();

    if (!contractId) {
      return NextResponse.json(
        { error: 'กรุณาระบุ contractId' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const contractsCollection = db.collection('contracts');
    const itemsCollection = db.collection('items');
    const storesCollection = db.collection('stores');
    const customersCollection = db.collection('customers');

    // Fetch contract data
    const contract = await contractsCollection.findOne({ _id: new ObjectId(contractId) });

    if (!contract) {
      return NextResponse.json(
        { error: 'ไม่พบสัญญา' },
        { status: 404 }
      );
    }

    // Fetch related data
    const item = await itemsCollection.findOne({ _id: new ObjectId(contract.itemId) });
    const store = await storesCollection.findOne({ _id: new ObjectId(contract.storeId) });
    const customer = await customersCollection.findOne({ lineId: contract.lineId });

    if (!item || !store || !customer) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลที่เกี่ยวข้อง' },
        { status: 404 }
      );
    }

    // Calculate due date
    const startDate = new Date(contract.createdAt);
    const dueDate = new Date(startDate);
    dueDate.setDate(dueDate.getDate() + (item.loanDays || 30));

    // Format dates
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    };

    // Create Flex Message
    const flexMessage = {
      type: 'flex',
      altText: `สัญญาเลขที่ ${contract.contractNumber} ของคุณได้ถูกสร้างเรียบร้อยแล้ว`,
      contents: {
        type: 'bubble',
        styles: {
          header: {
            backgroundColor: '#0A4215'
          },
          body: {
            backgroundColor: '#FFFFFF'
          },
          footer: {
            backgroundColor: '#FFFFFF'
          }
        },
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🎉 สัญญาสำเร็จ',
              weight: 'bold',
              size: 'lg',
              color: '#FFFFFF',
              align: 'center'
            }
          ],
          paddingAll: '16px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `สัญญาเลขที่ ${contract.contractNumber}`,
              weight: 'bold',
              size: 'md',
              color: '#0A4215',
              wrap: true,
              margin: 'none'
            },
            {
              type: 'text',
              text: 'ได้ถูกสร้างเรียบร้อยแล้ว',
              size: 'sm',
              color: '#666666',
              margin: 'xs',
              wrap: true
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: 'สินค้า:',
                      size: 'sm',
                      color: '#333333',
                      flex: 0
                    },
                    {
                      type: 'text',
                      text: `${item.brand} ${item.model}`,
                      size: 'sm',
                      color: '#666666',
                      align: 'end',
                      wrap: true
                    }
                  ],
                  margin: 'md'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: 'จำนวนเงิน:',
                      size: 'sm',
                      color: '#333333',
                      flex: 0
                    },
                    {
                      type: 'text',
                      text: `${(item.desiredAmount || item.estimatedValue || 0).toLocaleString()} บาท`,
                      size: 'sm',
                      color: '#0A4215',
                      align: 'end',
                      weight: 'bold'
                    }
                  ],
                  margin: 'sm'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: 'อัตราดอกเบี้ย:',
                      size: 'sm',
                      color: '#333333',
                      flex: 0
                    },
                    {
                      type: 'text',
                      text: `${item.interestRate || 10}%`,
                      size: 'sm',
                      color: '#666666',
                      align: 'end'
                    }
                  ],
                  margin: 'sm'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: 'ระยะเวลา:',
                      size: 'sm',
                      color: '#333333',
                      flex: 0
                    },
                    {
                      type: 'text',
                      text: `${item.loanDays || 30} วัน`,
                      size: 'sm',
                      color: '#666666',
                      align: 'end'
                    }
                  ],
                  margin: 'sm'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: 'วันครบกำหนด:',
                      size: 'sm',
                      color: '#333333',
                      flex: 0
                    },
                    {
                      type: 'text',
                      text: formatDate(dueDate),
                      size: 'sm',
                      color: '#D32F2F',
                      align: 'end',
                      weight: 'bold'
                    }
                  ],
                  margin: 'sm'
                }
              ],
              spacing: 'sm'
            }
          ],
          paddingAll: '16px'
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'primary',
              action: {
                type: 'uri',
                label: 'รายละเอียดสัญญา',
                uri: `${LIFF_CONTRACT_DETAIL_URL}?contractId=${contractId}`
              },
              color: '#0A4215',
              height: 'sm'
            },
            {
              type: 'button',
              style: 'secondary',
              action: {
                type: 'postback',
                label: 'ที่ตั้งร้าน',
                data: `action=store_location&storeId=${store._id}&contractId=${contractId}`
              },
              color: '#666666',
              height: 'sm',
              margin: 'sm'
            }
          ],
          paddingAll: '16px',
          spacing: 'sm'
        }
      }
    };

    // Send message via LINE Messaging API
    const response = await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to: contract.lineId,
        messages: [flexMessage]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        }
      }
    );

    console.log('LINE message sent successfully:', response.data);

    return NextResponse.json({
      success: true,
      message: 'Notification sent successfully'
    });

  } catch (error: any) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการส่งการแจ้งเตือน' },
      { status: 500 }
    );
  }
}

