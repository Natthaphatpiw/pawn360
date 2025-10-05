import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET_NAME = 'piwp360';
const FOLDER_PREFIX = 'cont360/';

// Create S3 client lazily to ensure env vars are loaded
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'ap-southeast-2';

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in environment variables.');
    }

    s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return s3Client;
}

/**
 * อัปโหลด QR Code ไปยัง AWS S3
 * @param itemId - ID ของรายการจำนำ
 * @param qrCodeBuffer - Buffer ของ QR Code (PNG)
 * @returns URL ของ QR Code ใน S3
 */
export async function uploadQRCodeToS3(
  itemId: string,
  qrCodeBuffer: Buffer
): Promise<string> {
  try {
    const client = getS3Client();
    const fileName = `qr-${itemId}.png`;
    const key = `${FOLDER_PREFIX}${fileName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: qrCodeBuffer,
      ContentType: 'image/png',
      // ไม่ใช้ ACL เพราะ bucket มี policy ตั้งค่า public access แล้ว
    });

    await client.send(command);

    // Return public URL
    const publicUrl = `https://piwp360.s3.ap-southeast-2.amazonaws.com/${key}`;
    return publicUrl;
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
}

/**
 * สร้าง Presigned URL สำหรับดาวน์โหลด QR Code (ใช้เมื่อ ACL ไม่เป็น public)
 * @param itemId - ID ของรายการจำนำ
 * @returns Presigned URL (valid 1 ชั่วโมง)
 */
export async function getQRCodePresignedUrl(itemId: string): Promise<string> {
  try {
    const client = getS3Client();
    const fileName = `qr-${itemId}.png`;
    const key = `${FOLDER_PREFIX}${fileName}`;

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    // URL จะใช้งานได้ 1 ชั่วโมง
    const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
    return signedUrl;
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw error;
  }
}

/**
 * ทดสอบการเชื่อมต่อกับ S3
 */
export async function testS3Connection(): Promise<boolean> {
  try {
    const client = getS3Client();
    const testBuffer = Buffer.from('test');
    const testKey = `${FOLDER_PREFIX}test-connection.txt`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: testKey,
      Body: testBuffer,
      ContentType: 'text/plain',
    });

    await client.send(command);
    console.log('✅ S3 connection successful!');
    return true;
  } catch (error) {
    console.error('❌ S3 connection failed:', error);
    return false;
  }
}
