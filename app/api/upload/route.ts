import { NextRequest, NextResponse } from 'next/server';
import { putPrivateBlob } from '@/lib/storage/blob';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = (formData.get('folder') as string) || 'uploads';

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(folder)) {
      return NextResponse.json(
        { error: 'Invalid upload folder' },
        { status: 400 }
      );
    }

    // Validate file type (allow images and PDFs)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not allowed' },
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
    const fileName = `${folder}-${timestamp}-${randomId}.${fileExtension}`;
    const key = `${folder}/${fileName}`;

    const blob = await putPrivateBlob(key, buffer, file.type);

    return NextResponse.json({
      success: true,
      url: blob.signedUrl,
      key: blob.pathname,
      blobUrl: blob.url,
    });

  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
