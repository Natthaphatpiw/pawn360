import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getS3Client } from '@/lib/aws/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Client } from '@line/bot-sdk';

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

/**
 * Downloads image from LINE Message API
 */
async function downloadLineImage(messageId: string): Promise<Buffer> {
  const client = getLineClient();
  const stream = await client.getMessageContent(messageId);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Uploads payment slip to S3
 */
async function uploadSlipToS3(
  slipBuffer: Buffer,
  notificationId: string
): Promise<string> {
  const s3Client = getS3Client();
  const timestamp = Date.now();
  const filename = `slip-${notificationId}-${timestamp}.jpg`;

  const uploadParams = {
    Bucket: 'piwp360',
    Key: `slips/${filename}`,
    Body: slipBuffer,
    ContentType: 'image/jpeg'
  };

  await s3Client.send(new PutObjectCommand(uploadParams));
  return `https://piwp360.s3.ap-southeast-2.amazonaws.com/slips/${filename}`;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let notificationId: string;
    let lineUserId: string;
    let imageSource: 'file' | 'line';
    let imageFile: File | null = null;
    let imageId: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      // File upload from web
      const formData = await request.formData();
      notificationId = formData.get('notificationId') as string;
      lineUserId = formData.get('lineUserId') as string;
      imageFile = formData.get('file') as File;
      imageSource = 'file';
    } else {
      // JSON request (from LINE webhook handler with imageId)
      const body = await request.json();
      notificationId = body.notificationId;
      lineUserId = body.lineUserId;
      imageId = body.imageId;
      imageSource = 'line';
    }

    if (!notificationId || !lineUserId) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const notificationsCollection = db.collection('notifications');

    // 1. Find notification
    const notification = await notificationsCollection.findOne({
      shopNotificationId: notificationId,
      lineUserId: lineUserId
    });

    if (!notification) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอที่ระบุ' },
        { status: 404 }
      );
    }

    // 2. Check if notification is in confirmed status (ready for payment)
    if (notification.status !== 'confirmed') {
      return NextResponse.json(
        { error: 'คำขอนี้ยังไม่ได้รับการยืนยัน หรือดำเนินการเสร็จสิ้นแล้ว' },
        { status: 400 }
      );
    }

    // 3. Get image buffer
    let imageBuffer: Buffer;
    if (imageSource === 'file' && imageFile) {
      imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    } else if (imageSource === 'line' && imageId) {
      imageBuffer = await downloadLineImage(imageId);
    } else {
      return NextResponse.json(
        { error: 'ไม่พบไฟล์รูปภาพ' },
        { status: 400 }
      );
    }

    // 4. Upload to S3
    const slipUrl = await uploadSlipToS3(imageBuffer, notificationId);

    // 5. Update notification
    await notificationsCollection.updateOne(
      { _id: notification._id },
      {
        $set: {
          status: 'payment_pending',
          paymentProofUrl: slipUrl,
          updatedAt: new Date()
        }
      }
    );

    // 6. Send slip to Shop System for verification
    const shopSystemUrl = process.env.SHOP_SYSTEM_URL || 'https://pawn360-ver.vercel.app';

    try {
      // Convert Buffer to FormData for Shop System
      const formData = new FormData();
      const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
      const file = new File([blob], 'slip.jpg', { type: 'image/jpeg' });

      formData.append('notificationId', notificationId);
      formData.append('file', file);
      formData.append('slipUrl', slipUrl);

      const response = await fetch(`${shopSystemUrl}/api/notifications/payment-proof`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        console.error('Shop System API error:', await response.text());
        throw new Error('ไม่สามารถส่งสลิปไปยังระบบร้านได้');
      }

      const shopData = await response.json();
      console.log('Slip sent to Shop System:', shopData);

      // 7. Send confirmation to customer via LINE
      const client = getLineClient();
      await client.pushMessage(lineUserId, {
        type: 'text',
        text: '✅ อัพโหลดสลิปสำเร็จ\n\nกำลังรอพนักงานตรวจสอบ คุณจะได้รับการแจ้งเตือนเมื่อการตรวจสอบเสร็จสิ้น'
      });

      return NextResponse.json({
        success: true,
        message: 'อัพโหลดสลิปสำเร็จ กำลังรอพนักงานตรวจสอบ',
        slipUrl: slipUrl
      });

    } catch (shopError: any) {
      console.error('Failed to send slip to Shop System:', shopError);

      // Still save the slip URL but notify user of issue
      await notificationsCollection.updateOne(
        { _id: notification._id },
        {
          $set: {
            status: 'payment_uploaded',
            updatedAt: new Date()
          }
        }
      );

      return NextResponse.json(
        {
          success: false,
          error: 'อัพโหลดสลิปสำเร็จ แต่ไม่สามารถส่งไปยังร้านได้ กรุณาติดต่อร้านโดยตรง',
          slipUrl: slipUrl
        },
        { status: 503 }
      );
    }

  } catch (error: any) {
    console.error('Upload payment proof error:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการอัพโหลดสลิป' },
      { status: 500 }
    );
  }
}
