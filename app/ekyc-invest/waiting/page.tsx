'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

export default function EKYCInvestWaitingPage() {
  const router = useRouter();
  const { profile, isLoading: liffLoading } = useLiff();

  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes = 300 seconds
  const [dots, setDots] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutOccurred = useRef(false);

  // Poll KYC status every 3 seconds
  useEffect(() => {
    const pollKYCStatus = async () => {
      if (!profile?.userId || timeoutOccurred.current) return;

      try {
        const response = await axios.get(`/api/investors/check?lineId=${profile.userId}`);
        if (response.data.exists) {
          const investor = response.data.investor;

          if (investor.kyc_status === 'VERIFIED') {
            // Success! Clean up and redirect
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (intervalRef.current) clearInterval(intervalRef.current);
            router.push('/register-invest');
          } else if (investor.kyc_status === 'REJECTED') {
            // Rejected - redirect to eKYC page
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (intervalRef.current) clearInterval(intervalRef.current);
            router.push('/ekyc-invest');
          }
          // If still PENDING, continue polling
        }
      } catch (error) {
        console.error('Error polling KYC status:', error);
      }
    };

    if (profile?.userId) {
      // Poll immediately
      pollKYCStatus();

      // Then poll every 3 seconds
      pollingRef.current = setInterval(pollKYCStatus, 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [profile?.userId, router]);

  // Countdown timer
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Time's up
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (pollingRef.current) clearInterval(pollingRef.current);
          timeoutOccurred.current = true;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Animate loading dots
  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots((prev) => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(dotsInterval);
  }, []);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (liffLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A]"></div>
      </div>
    );
  }

  // Timeout screen
  if (timeLeft === 0) {
    return (
      <div className="min-h-screen bg-white font-sans p-4 flex flex-col items-center justify-center">
        <div className="w-full max-w-md text-center">
          {/* Error Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-800 mb-2">หมดเวลารอผลการยืนยันตัวตน</h1>
          <p className="text-sm text-gray-500 mb-6">Request Timeout</p>

          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
            <p className="text-sm text-red-600">
              ระบบไม่ได้รับผลการยืนยันตัวตนภายในเวลาที่กำหนด (5 นาที)<br />
              กรุณาลองทำรายการใหม่อีกครั้ง
            </p>
          </div>

          <button
            onClick={() => router.push('/ekyc-invest')}
            className="w-full bg-[#1E3A8A] hover:bg-[#152C6B] text-white font-bold py-4 rounded-2xl transition-all shadow-sm active:scale-[0.98]"
          >
            <span className="text-base">ลองใหม่อีกครั้ง</span>
            <div className="text-[10px] font-light opacity-90 mt-1">Try Again</div>
          </button>
        </div>
      </div>
    );
  }

  // Waiting screen
  return (
    <div className="min-h-screen bg-white font-sans p-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-md text-center">

        {/* Loading Animation */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-24 h-24 border-4 border-[#E9EFF6] rounded-full"></div>
            <div className="w-24 h-24 border-4 border-[#1E3A8A] border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
            <div className="absolute top-0 left-0 w-24 h-24 flex items-center justify-center">
              <svg className="w-10 h-10 text-[#1E3A8A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Status Text */}
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          กำลังรอผลการยืนยันตัวตน{dots}
        </h1>
        <p className="text-sm text-gray-500 mb-6">Waiting for verification result</p>

        {/* Info Box */}
        <div className="bg-[#E9EFF6] rounded-2xl p-6 mb-6">
          <p className="text-sm text-gray-700 mb-4">
            ระบบกำลังรอรับผลการยืนยันตัวตนจาก UpPass
          </p>
          <p className="text-xs text-gray-600">
            กรุณาอย่าปิดหน้านี้ ระบบจะอัพเดตอัตโนมัติเมื่อได้รับผลการยืนยัน
          </p>
        </div>

        {/* Timer */}
        <div className="bg-white border-2 border-[#1E3A8A] rounded-xl p-4 mb-4">
          <div className="text-xs text-gray-500 mb-1">เวลาคงเหลือ</div>
          <div className="text-3xl font-bold text-[#1E3A8A] font-mono">
            {formatTime(timeLeft)}
          </div>
        </div>

        {/* Cancel button */}
        <button
          onClick={() => router.push('/register-invest')}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          ยกเลิกและกลับหน้าหลัก
        </button>

      </div>
    </div>
  );
}