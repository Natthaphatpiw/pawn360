'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

export default function InvestorEKYCWaitingPage() {
  const router = useRouter();
  const { profile, isLoading: liffLoading } = useLiff();
  const [checking, setChecking] = useState(false);

  // Poll for KYC status updates
  useEffect(() => {
    const checkKYCStatus = async () => {
      if (!profile?.userId || checking) return;

      setChecking(true);
      try {
        const response = await axios.get(`/api/investors/check?lineId=${profile.userId}`);
        if (response.data.exists) {
          const investor = response.data.investor;

          if (investor.kyc_status === 'VERIFIED') {
            // Verified! Redirect to profile
            router.push('/register-invest');
          } else if (investor.kyc_status === 'REJECTED') {
            // Rejected, go back to eKYC page
            router.push('/ekyc-invest');
          }
          // else PENDING, stay on this page
        }
      } catch (error) {
        console.error('Error checking KYC status:', error);
      } finally {
        setChecking(false);
      }
    };

    // Check immediately
    if (!liffLoading && profile?.userId) {
      checkKYCStatus();
    }

    // Then check every 5 seconds
    const interval = setInterval(() => {
      if (!liffLoading && profile?.userId) {
        checkKYCStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [profile?.userId, router, liffLoading, checking]);

  if (liffLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          {/* Animated Icon */}
          <div className="mb-6 flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 bg-[#E9EFF6] rounded-full flex items-center justify-center">
                <svg
                  className="w-12 h-12 text-[#1E3A8A]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="absolute inset-0 animate-ping">
                <div className="w-24 h-24 bg-[#1E3A8A] rounded-full opacity-20"></div>
              </div>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            กำลังตรวจสอบข้อมูล
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            Verifying Your Information
          </p>

          {/* Description */}
          <div className="bg-[#F8FAFC] rounded-xl p-6 mb-8">
            <p className="text-gray-700 mb-4">
              ระบบกำลังตรวจสอบข้อมูลของคุณ
            </p>
            <p className="text-sm text-gray-500">
              โปรดรอสักครู่ ระบบจะอัปเดตสถานะโดยอัตโนมัติ<br />
              (โดยปกติใช้เวลา 1-2 นาที)
            </p>
          </div>

          {/* Loading Indicator */}
          <div className="flex justify-center mb-6">
            <div className="flex space-x-2">
              <div className="w-3 h-3 bg-[#1E3A8A] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-3 h-3 bg-[#1E3A8A] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-3 h-3 bg-[#1E3A8A] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>

          {/* Back Button */}
          <button
            onClick={() => router.push('/register-invest')}
            className="w-full bg-white border-2 border-[#1E3A8A] text-[#1E3A8A] font-bold py-4 rounded-xl hover:bg-[#F8FAFC] transition-colors"
          >
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    </div>
  );
}
