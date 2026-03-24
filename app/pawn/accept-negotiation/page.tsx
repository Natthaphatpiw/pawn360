'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

function AcceptNegotiationContent() {
  const { profile, isLoading: liffLoading } = useLiff();
  const searchParams = useSearchParams();
  const itemId = searchParams.get('itemId');

  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleAccept = async () => {
    if (!itemId || !profile?.userId) {
      setError('ข้อมูลไม่ครบถ้วน');
      return;
    }

    setIsAccepting(true);
    setError(null);

    try {
      const response = await axios.post('/api/pawn-requests/accept-negotiation', {
        itemId,
        lineId: profile.userId,
      });

      if (response.data.success) {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาด');
    } finally {
      setIsAccepting(false);
    }
  };

  if (liffLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-green-50 to-white">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-green-600 text-6xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">ยอมรับเงื่อนไขแล้ว!</h1>
          <p className="text-gray-600 mb-4">QR Code ใหม่ได้ถูกส่งไปยังแชทของคุณแล้ว</p>
          <p className="text-sm text-gray-500">นำ QR Code ไปแสดงที่ร้านเพื่อทำรายการต่อ</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-4">
              <span className="text-3xl">🔄</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">ยืนยันเงื่อนไขใหม่</h1>
            <p className="text-gray-600 text-sm">
              ร้านค้าได้แก้ไขเงื่อนไขการขอสินเชื่อ กดยืนยันเพื่อตกลง
            </p>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={handleAccept}
              disabled={isAccepting}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isAccepting ? 'กำลังดำเนินการ...' : '✅ ยอมรับเงื่อนไขใหม่'}
            </button>

            <button
              onClick={() => {
                if (window.liff) {
                  window.liff.closeWindow();
                }
              }}
              className="w-full py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AcceptNegotiationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    }>
      <AcceptNegotiationContent />
    </Suspense>
  );
}
