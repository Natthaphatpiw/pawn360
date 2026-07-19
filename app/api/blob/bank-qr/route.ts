import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';

const BANK_QR_PATHNAME = 'bank/QRCode.png';

export async function GET() {
  try {
    const result = await get(BANK_QR_PATHNAME, { access: 'private' });
    if (!result || result.statusCode !== 200) {
      return new NextResponse('Not found', { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        'Cache-Control': 'private, no-cache',
        'Content-Type': result.blob.contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Error reading bank QR code from Vercel Blob:', error);
    return new NextResponse('Unable to load bank QR code', { status: 500 });
  }
}
