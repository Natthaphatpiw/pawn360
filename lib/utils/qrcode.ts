import QRCode from 'qrcode';
import { writeFile } from 'fs/promises';
import path from 'path';

export async function generateQRCode(data: string, filename: string): Promise<string> {
  try {
    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(data, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 400,
      margin: 1,
    });

    // Convert data URL to buffer
    const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Save to public folder
    const publicPath = path.join(process.cwd(), 'public', 'qrcodes', filename);
    await writeFile(publicPath, buffer);

    // Return public URL
    return `/qrcodes/${filename}`;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
}

export function generateQRCodeData(itemId: string): string {
  // สร้าง LIFF URL ที่เปิดหน้าร้านค้าตรวจสอบรายการจำนำ
  const liffId = process.env.LIFF_ID_STORE || '2008216710-de1ovYZL';
  return `https://liff.line.me/${liffId}/store/verify-pawn?itemId=${itemId}`;
}
