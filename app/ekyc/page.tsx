'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

export default function EKYCPage() {
  const router = useRouter();
  const { profile, isLoading: liffLoading } = useLiff();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  // Get customer ID from pawner data
  useEffect(() => {
    const getCustomerId = async () => {
      if (!profile?.userId) return;

      try {
        const response = await axios.get(`/api/pawners/check?lineId=${profile.userId}`);
        if (response.data.exists) {
          setCustomerId(response.data.pawner.customer_id);
        } else {
          router.push('/register');
        }
      } catch (error) {
        console.error('Error getting customer ID:', error);
        router.push('/register');
      }
    };

    if (profile?.userId) {
      getCustomerId();
    }
  }, [profile?.userId, router]);

  const handleStartKYC = async () => {
    if (!customerId) {
      setError('ไม่พบข้อมูลลูกค้า กรุณาลงทะเบียนก่อน');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Call API to initiate eKYC
      const response = await axios.post('/api/ekyc/initiate', {
        customerId
      });

      if (response.data.success && response.data.url) {
        // 2. Redirect to UpPass verification page
        window.location.href = response.data.url;
      } else {
        throw new Error('Failed to get verification URL');
      }
    } catch (error: any) {
      console.error('eKYC error:', error);
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการเริ่มต้นการยืนยันตัวตน');
      setLoading(false);
    }
  };

  if (liffLoading || !customerId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#C0562F] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center border border-gray-100">
        <div className="mb-6">
          <div className="w-20 h-20 bg-[#F9EFE6] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-[#C0562F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2 text-gray-800">ยืนยันตัวตน (eKYC)</h1>
          <p className="text-gray-500 mb-8 text-sm">
            กรุณาเตรียมบัตรประชาชนเพื่อทำการยืนยันตัวตน <br />
            สำหรับการใช้งานระบบจำนำ P2P
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleStartKYC}
          disabled={loading}
          className="w-full bg-[#C0562F] hover:bg-[#A04D2D] text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? 'กำลังเชื่อมต่อระบบ...' : 'เริ่มยืนยันตัวตน'}
        </button>

        <p className="text-xs text-gray-500 mt-4">
          ระบบจะนำท่านไปยังหน้ายืนยันตัวตนของ UpPass
        </p>
      </div>
    </div>
  );
}
