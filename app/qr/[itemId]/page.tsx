'use client';

import { useEffect, use } from 'react';

export default function QRCodePage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = use(params);

  useEffect(() => {
    // Redirect to LIFF app immediately
    const liffId = '2008216710-de1ovYZL'; // LIFF ID for store
    const liffUrl = `https://liff.line.me/${liffId}#itemId=${itemId}`;
    console.log('Redirecting to LIFF:', liffUrl);
    window.location.href = liffUrl;
  }, [itemId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">กำลังเปิดแอปพลิเคชันร้านค้า...</p>
      </div>
    </div>
  );
}
