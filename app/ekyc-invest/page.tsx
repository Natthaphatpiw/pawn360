'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

export default function InvestorEKYCPage() {
  const router = useRouter();
  const { profile, isLoading: liffLoading } = useLiff();

  const [loading, setLoading] = useState(false);
  const [checkingInvestor, setCheckingInvestor] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [investorId, setInvestorId] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);

  // Get investor ID and check KYC status
  useEffect(() => {
    const checkInvestor = async () => {
      if (!profile?.userId) {
        setError('ไม่พบ LINE profile กรุณาเปิดลิงก์ผ่าน LINE LIFF');
        setCheckingInvestor(false);
        return;
      }

      setCheckingInvestor(true);
      try {
        const response = await axios.get(`/api/investors/check?lineId=${profile.userId}`);
        if (response.data.exists) {
          const investor = response.data.investor;
          setInvestorId(investor.investor_id);
          setKycStatus(investor.kyc_status);

          // Redirect based on KYC status
          if (investor.kyc_status === 'VERIFIED') {
            router.push('/register-invest');
          } else if (investor.kyc_status === 'PENDING') {
            router.push('/ekyc-invest/waiting');
          }
        } else {
          router.push('/register-invest');
        }
      } catch (error) {
        console.error('Error getting investor ID:', error);
        setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        setCheckingInvestor(false);
      }
    };

    if (!liffLoading && profile?.userId) {
      checkInvestor();
    }
  }, [profile?.userId, router, liffLoading]);

  const handleStartKYC = async () => {
    if (!investorId) {
      setError('ไม่พบข้อมูลนักลงทุน กรุณาลงทะเบียนก่อน');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/ekyc/initiate-invest', {
        investorId
      });

      if (response.data.success && response.data.url) {
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

  if (liffLoading || checkingInvestor) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1E3A8A] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          {/* Icon */}
          <div className="mb-6 flex justify-center">
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
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            ยืนยันตัวตน
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            Identity Verification
          </p>

          {/* Description */}
          <div className="bg-[#F8FAFC] rounded-xl p-6 mb-8 text-left">
            <h2 className="font-bold text-gray-800 mb-3">
              ทำไมต้องยืนยันตัวตน?
            </h2>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start">
                <span className="text-[#1E3A8A] mr-2">✓</span>
                <span>เพื่อความปลอดภัยในการลงทุน</span>
              </li>
              <li className="flex items-start">
                <span className="text-[#1E3A8A] mr-2">✓</span>
                <span>ป้องกันการฉ้อโกงและการใช้ข้อมูลผิดวัตถุประสงค์</span>
              </li>
              <li className="flex items-start">
                <span className="text-[#1E3A8A] mr-2">✓</span>
                <span>เป็นไปตามกฎหมาย KYC (Know Your Customer)</span>
              </li>
              <li className="flex items-start">
                <span className="text-[#1E3A8A] mr-2">✓</span>
                <span>ใช้เวลาเพียง 2-3 นาที</span>
              </li>
            </ul>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Rejected Status */}
          {kycStatus === 'REJECTED' && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 text-sm font-medium mb-1">
                การยืนยันตัวตนครั้งก่อนไม่สำเร็จ
              </p>
              <p className="text-yellow-700 text-xs">
                กรุณาลองยืนยันตัวตนอีกครั้ง โดยตรวจสอบให้แน่ใจว่าข้อมูลถูกต้องและรูปภาพชัดเจน
              </p>
            </div>
          )}

          {/* Start Button */}
          <button
            onClick={handleStartKYC}
            disabled={loading}
            className="w-full bg-[#1E3A8A] hover:bg-[#1E40AF] text-white font-bold py-4 rounded-xl transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                กำลังดำเนินการ...
              </span>
            ) : (
              'เริ่มยืนยันตัวตน'
            )}
          </button>

          <p className="mt-4 text-xs text-gray-400">
            ระบบจะนำคุณไปยังหน้ายืนยันตัวตนผ่าน UpPass
          </p>
        </div>
      </div>
    </div>
  );
}
