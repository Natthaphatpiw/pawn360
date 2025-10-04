'use client';

import { useEffect, useState, use } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';

export default function QRCodePage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = use(params);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAndGenerateQR = async () => {
      try {
        // ดึงข้อมูล item
        const response = await axios.get(`/api/pawn-requests/${itemId}`);

        if (response.data.success) {
          // สร้าง LIFF URL สำหรับร้านค้า
          const liffId = process.env.NEXT_PUBLIC_LIFF_ID_STORE || '2008216710-de1ovYZL';
          const liffUrl = `https://liff.line.me/${liffId}/store/verify-pawn?itemId=${itemId}`;

          // Generate QR Code
          const qrDataUrl = await QRCode.toDataURL(liffUrl, {
            errorCorrectionLevel: 'H',
            type: 'image/png',
            width: 400,
            margin: 2,
          });

          setQrCodeUrl(qrDataUrl);
        } else {
          setError('ไม่พบรายการจำนำ');
        }
      } catch (err) {
        console.error('Error:', err);
        setError('เกิดข้อผิดพลาด');
      } finally {
        setLoading(false);
      }
    };

    fetchAndGenerateQR();
  }, [itemId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด QR Code...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold text-lg mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">QR Code จำนำ</h1>
            <p className="text-gray-600 text-sm">นำ QR Code นี้ไปแสดงที่ร้านค้า</p>
          </div>

          <div className="bg-white p-4 rounded-xl border-4 border-green-500 mb-4">
            {qrCodeUrl && (
              <img
                src={qrCodeUrl}
                alt="QR Code"
                className="w-full h-auto"
              />
            )}
          </div>

          <div className="bg-green-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-green-800 font-medium">📱 วิธีใช้งาน</p>
            <ol className="text-xs text-green-700 text-left mt-2 space-y-1">
              <li>1. แสดง QR Code นี้ให้พนักงานร้าน</li>
              <li>2. พนักงานจะแสกนเพื่อตรวจสอบสินค้า</li>
              <li>3. ร้านจะประเมินราคาและสร้างสัญญา</li>
            </ol>
          </div>

          <p className="text-xs text-gray-500 mt-4">
            Item ID: {itemId.substring(0, 8)}...
          </p>
        </div>
      </div>
    </div>
  );
}
