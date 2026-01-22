import QRCode from 'qrcode';

export async function generateQRCode(data: string, filename?: string): Promise<string> {
  try {
    // Generate QR code as data URL (base64)
    // ใน Vercel ไม่สามารถเขียนไฟล์ได้ เลยต้องใช้ data URL แทน
    const qrCodeDataURL = await QRCode.toDataURL(data, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 400,
      margin: 1,
    });

    // Return data URL directly (ใช้ส่งไปยัง LINE API ได้เลย)
    return qrCodeDataURL;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
}

export function generateQRCodeData(itemId: string): string {
  // สร้าง URL ที่ไปที่ QR code page ก่อน แล้วจะ redirect ไป LIFF
  const domain = process.env.NEXT_PUBLIC_DOMAIN || 'https://pawnly.io';
  const url = `${domain}/qr/${itemId}`;
  console.log('Generated QR code URL:', url, 'for itemId:', itemId);
  return url;
}
