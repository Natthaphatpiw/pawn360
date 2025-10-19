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
  // สร้าง LIFF URL ที่เปิดหน้าร้านค้าตรวจสอบและแก้ไขรายการจำนำ
  // ใช้ LIFF ID สำหรับร้านค้า
  const liffId = process.env.LIFF_ID_STORE || '2008216710-de1ovYZL';
  return `https://liff.line.me/${liffId}?itemId=${itemId}`;
}
