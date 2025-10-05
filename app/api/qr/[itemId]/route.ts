import { NextRequest, NextResponse } from 'next/server';
import { getQRCodePresignedUrl } from '@/lib/aws/s3';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params;

    // Generate presigned URL (valid for 1 hour)
    const presignedUrl = await getQRCodePresignedUrl(itemId, 3600);

    return NextResponse.json({
      success: true,
      url: presignedUrl,
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate QR code URL' },
      { status: 500 }
    );
  }
}
