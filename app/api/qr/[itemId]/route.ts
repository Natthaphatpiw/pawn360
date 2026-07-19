import { NextRequest, NextResponse } from 'next/server';
import { getQRCodeSignedUrl } from '@/lib/storage/blob';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await context.params;

    // Generate a signed Blob URL (valid for 1 hour)
    const signedUrl = await getQRCodeSignedUrl(itemId, 3600);

    return NextResponse.json({
      success: true,
      url: signedUrl,
    });
  } catch (error) {
    console.error('Error generating signed Blob URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate QR code URL' },
      { status: 500 }
    );
  }
}
