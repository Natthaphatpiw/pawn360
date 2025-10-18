import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getImagePresignedUrl } from '@/lib/aws/s3';

const BUCKET_NAME = 'piwp360';
const FOLDER_PREFIX = 'pawn-items/';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const fileName = `item-${timestamp}-${randomId}.${fileExtension}`;
    const key = `${FOLDER_PREFIX}${fileName}`;

    // Upload to S3
    const s3Client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      // ไม่ใช้ ACL เพราะ bucket ไม่รองรับ ACLs
    });

    await s3Client.send(command);

    // สร้าง Presigned URL สำหรับเข้าถึงรูปภาพ
    const presignedUrl = await getImagePresignedUrl(key);

    return NextResponse.json({
      success: true,
      url: presignedUrl,
      key: key
    });

  } catch (error: any) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  }
}
