import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET_NAME = 'piwp360';
const FOLDER_PREFIX = 'cont360/';

// Create S3 client lazily to ensure env vars are loaded
let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
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
 * @returns Presigned URL ของ QR Code ใน S3
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
      // ไม่ใช้ ACL เพราะ bucket ไม่รองรับ ACLs
    });

    await client.send(command);

    // สร้าง Presigned URL แทน public URL
    const presignedUrl = await getQRCodePresignedUrl(itemId);
    return presignedUrl;
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
}

/**
 * สร้าง Presigned URL สำหรับดาวน์โหลด QR Code (ใช้เมื่อ ACL ไม่เป็น public)
 * @param itemId - ID ของรายการจำนำ
 * @param expiresIn - ระยะเวลาที่ URL ใช้งานได้ (วินาที) ค่าเริ่มต้น 7 วัน
 * @returns Presigned URL
 */
export async function getQRCodePresignedUrl(itemId: string, expiresIn: number = 7 * 24 * 3600): Promise<string> {
  try {
    const client = getS3Client();
    const fileName = `qr-${itemId}.png`;
    const key = `${FOLDER_PREFIX}${fileName}`;

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const signedUrl = await getSignedUrl(client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw error;
  }
}

/**
 * สร้าง Presigned URL สำหรับดาวน์โหลดไฟล์รูปภาพ
 * @param imageKey - Key ของไฟล์รูปภาพใน S3
 * @param expiresIn - ระยะเวลาที่ URL ใช้งานได้ (วินาที) ค่าเริ่มต้น 7 วัน
 * @returns Presigned URL
 */
export async function getImagePresignedUrl(imageKey: string, expiresIn: number = 7 * 24 * 3600): Promise<string> {
  try {
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: imageKey,
    });

    const signedUrl = await getSignedUrl(client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('Error generating presigned URL for image:', error);
    throw error;
  }
}

/**
 * อัปโหลดลายเซ็นไปยัง AWS S3
 * @param contractId - ID ของสัญญา
 * @param signatureDataURL - Data URL ของลายเซ็น (base64)
 * @returns Presigned URL ของลายเซ็นใน S3
 */
export async function uploadSignatureToS3(
  contractId: string,
  signatureDataURL: string
): Promise<string> {
  try {
    const client = getS3Client();

    // Convert data URL to buffer
    const base64Data = signatureDataURL.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const fileName = `signature-${contractId}.png`;
    const key = `${FOLDER_PREFIX}${fileName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
    });

    await client.send(command);

    // สร้าง Presigned URL
    const presignedUrl = await getSignaturePresignedUrl(contractId);
    return presignedUrl;
  } catch (error) {
    console.error('Error uploading signature to S3:', error);
    throw error;
  }
}

/**
 * สร้าง Presigned URL สำหรับดาวน์โหลดลายเซ็น
 * @param contractId - ID ของสัญญา
 * @param expiresIn - ระยะเวลาที่ URL ใช้งานได้ (วินาที) ค่าเริ่มต้น 7 วัน
 * @returns Presigned URL
 */
export async function getSignaturePresignedUrl(contractId: string, expiresIn: number = 7 * 24 * 3600): Promise<string> {
  try {
    const client = getS3Client();
    const fileName = `signature-${contractId}.png`;
    const key = `${FOLDER_PREFIX}${fileName}`;

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const signedUrl = await getSignedUrl(client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('Error generating presigned URL for signature:', error);
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
