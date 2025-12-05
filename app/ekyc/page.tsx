'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

export default function EKYCPage() {
  const router = useRouter();
  const { profile, isLoading: liffLoading } = useLiff();

  const [loading, setLoading] = useState(false);
  const [checkingCustomer, setCheckingCustomer] = useState(true); // New state for initial check
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);

  // Get customer ID and check KYC status
  useEffect(() => {
    const checkCustomer = async () => {
      if (!profile?.userId) {
        setError('ไม่พบ LINE profile กรุณาเปิดลิงก์ผ่าน LINE LIFF');
        setCheckingCustomer(false);
        return;
      }

      setCheckingCustomer(true);
      try {
        const response = await axios.get(`/api/pawners/check?lineId=${profile.userId}`);
        if (response.data.exists) {
          const pawner = response.data.pawner;
          setCustomerId(pawner.customer_id);
          setKycStatus(pawner.kyc_status);

          // Redirect based on KYC status
          if (pawner.kyc_status === 'VERIFIED') {
            // Already verified - go to register page
            router.push('/register');
          } else if (pawner.kyc_status === 'PENDING') {
            // Waiting for verification - go to waiting page
            router.push('/ekyc/waiting');
          }
          // else stay on this page (NOT_VERIFIED or REJECTED)
        } else {
          // Not registered - go to register
          router.push('/register');
        }
      } catch (error) {
        console.error('Error getting customer ID:', error);
        setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        setCheckingCustomer(false);
      }
    };

    if (!liffLoading && profile?.userId) {
      checkCustomer();
    }
  }, [profile?.userId, router, liffLoading]);

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
        // User will be redirected back after completing eKYC
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

  // Show loading when LIFF is loading or checking customer
  if (liffLoading || checkingCustomer) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#C0562F] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  // Show error state if no customer ID after loading completes
  if (!customerId && error) {
    return (
      <div className="min-h-screen bg-white font-sans p-4 flex flex-col items-center justify-center">
        <div className="w-full max-w-md">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
          <button
            onClick={() => router.push('/register')}
            className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white font-bold py-4 rounded-2xl transition-all"
          >
            กลับไปหน้าลงทะเบียน
          </button>
        </div>
      </div>
    );
  }

  // If still no customerId after all checks, redirect to register
  if (!customerId) {
    router.push('/register');
    return null;
  }

  return (
    <div className="min-h-screen bg-white font-sans p-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-md">

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-[#F9EFE6] rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-[#C0562F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">ยืนยันตัวตน</h1>
          <p className="text-sm text-gray-500">Identity Verification (eKYC)</p>
        </div>

        {/* Instructions */}
        <div className="bg-[#F9EFE6] rounded-2xl p-6 mb-6">
          <h2 className="font-bold text-gray-800 mb-3">กรุณาเตรียม:</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start">
              <span className="text-[#C0562F] mr-2">•</span>
              <span>บัตรประชาชนตัวจริง (ไม่ใช่สำเนา)</span>
            </li>
            <li className="flex items-start">
              <span className="text-[#C0562F] mr-2">•</span>
              <span>สถานที่มีแสงสว่างเพียงพอ</span>
            </li>
            <li className="flex items-start">
              <span className="text-[#C0562F] mr-2">•</span>
              <span>เตรียมพร้อมถ่ายภาพใบหน้า (Selfie)</span>
            </li>
          </ul>
        </div>

        {/* Rejection reason if any */}
        {kycStatus === 'REJECTED' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-600">
              การยืนยันตัวตนครั้งก่อนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStartKYC}
          disabled={loading}
          className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white font-bold py-4 rounded-2xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
        >
          <span className="text-base">
            {loading ? 'กำลังเชื่อมต่อ...' : 'เริ่มยืนยันตัวตน'}
          </span>
          {!loading && (
            <div className="text-[10px] font-light opacity-90 mt-1">Start Verification</div>
          )}
        </button>

        {/* Note */}
        <p className="text-xs text-gray-500 text-center mt-4">
          ระบบจะนำท่านไปยังหน้ายืนยันตัวตนของ UpPass
        </p>
      </div>
    </div>
  );
}
