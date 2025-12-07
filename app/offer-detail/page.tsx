'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

function OfferDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useLiff();

  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get contractId from either direct param or from liff.state
  let contractId = searchParams.get('contractId');

  // If not found, try to extract from liff.state
  if (!contractId) {
    const liffState = searchParams.get('liff.state');
    if (liffState) {
      // liff.state format: /offer-detail?contractId=xxx
      const match = liffState.match(/contractId=([^&]+)/);
      if (match) {
        contractId = match[1];
      }
    }
  }

  console.log('📍 Extracted contractId:', contractId);

  useEffect(() => {
    if (contractId) {
      fetchContractDetails();
    }
  }, [contractId]);

  const fetchContractDetails = async () => {
    try {
      setLoading(true);
      console.log('🔍 Fetching contract details for:', contractId);
      const response = await axios.get(`/api/contracts/${contractId}`);
      console.log('✅ Contract data received:', response.data);
      setContract(response.data.contract);
    } catch (error: any) {
      console.error('❌ Error fetching contract:', error);
      console.error('Error details:', error.response?.data);
      setError(error.response?.data?.error || 'ไม่สามารถโหลดรายละเอียดข้อเสนอได้');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!profile?.userId) {
      alert('กรุณาเข้าสู่ระบบ LINE');
      return;
    }

    try {
      setActionLoading(true);
      await axios.post('/api/contracts/investor-action', {
        action: 'accept',
        contractId,
        lineId: profile.userId
      });

      alert('ยอมรับข้อเสนอเรียบร้อยแล้ว');
      router.push('/register-invest'); // Go back to investor profile
    } catch (error: any) {
      console.error('Error accepting offer:', error);
      alert('เกิดข้อผิดพลาดในการยอมรับข้อเสนอ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    try {
      setActionLoading(true);
      await axios.post('/api/contracts/investor-action', {
        action: 'decline',
        contractId
      });

      alert('ปฏิเสธข้อเสนอเรียบร้อยแล้ว');
      router.push('/register-invest'); // Go back to investor profile
    } catch (error: any) {
      console.error('Error declining offer:', error);
      alert('เกิดข้อผิดพลาดในการปฏิเสธข้อเสนอ');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!contractId) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="text-red-600 mb-4">ไม่พบ Contract ID</div>
          <div className="text-sm text-gray-500 mb-4">
            Debug: {JSON.stringify({
              directParam: searchParams.get('contractId'),
              liffState: searchParams.get('liff.state'),
              allParams: Array.from(searchParams.entries())
            })}
          </div>
          <button
            onClick={() => router.back()}
            className="bg-[#1E3A8A] text-white px-6 py-3 rounded-lg"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="text-red-600 mb-4">{error || 'ไม่พบข้อมูลข้อเสนอ'}</div>
          <div className="text-sm text-gray-500 mb-4">Contract ID: {contractId}</div>
          <button
            onClick={() => router.back()}
            className="bg-[#1E3A8A] text-white px-6 py-3 rounded-lg"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  const InfoRow = ({ label, value, valueColor = 'text-gray-800', isBoldValue = false }: {
    label: string;
    value: string;
    valueColor?: string;
    isBoldValue?: boolean;
  }) => (
    <div className="flex justify-between items-start py-1">
      <div className="font-bold text-gray-700 text-sm w-1/3">{label}</div>
      <div className={`text-right w-2/3 text-sm ${valueColor} ${isBoldValue ? 'font-bold' : 'font-medium'}`}>
        {value}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white font-sans p-4 pb-10 flex flex-col items-center">

      {/* Header */}
      <div className="w-full max-w-sm text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">รายละเอียดข้อเสนอ</h1>
        <p className="text-sm text-gray-500">Offer Detail</p>
      </div>

      {/* Main Content Card */}
      <div className="w-full max-w-sm bg-[#F0F0F0] rounded-3xl p-5 mb-6">

        {/* Title */}
        <h1 className="text-lg font-bold text-gray-800 mb-4">รายละเอียดข้อเสนอ</h1>

        {/* Product Image */}
        <div className="w-full aspect-square bg-gray-200 rounded-xl overflow-hidden mb-6 shadow-sm">
          <img
            src={contract.items?.image_urls?.[0] || 'https://via.placeholder.com/300x300?text=No+Image'}
            alt="Product"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Details List */}
        <div className="space-y-1 mb-4">
          <InfoRow label="ชื่อผู้จำนำ" value={`${contract.pawners?.firstname} ${contract.pawners?.lastname}`} />
          <InfoRow label="สินค้า" value={`${contract.items?.brand} ${contract.items?.model}`} />
          <InfoRow label="ความจุ" value={contract.items?.capacity || 'ไม่ระบุ'} />
          <InfoRow label="สภาพ" value={`${contract.items?.item_condition}%`} />
          <InfoRow label="ตำหนิ" value={contract.items?.defects || 'ไม่มี'} />
          <InfoRow label="มูลค่า" value={`${contract.loan_principal_amount?.toLocaleString()}.00`} />
          <InfoRow label="ดอกเบี้ย" value={`${(contract.interest_rate * 100).toFixed(1)}% | ${(contract.interest_amount).toLocaleString()}`} />
          <InfoRow label="ระยะเวลา" value={`${contract.contract_duration_days} วัน`} />
          <InfoRow label="วันที่เสนอ" value={new Date().toLocaleDateString('th-TH')} />
        </div>

        <div className="h-px bg-white my-3 opacity-60"></div>

        {/* Remarks */}
        <div className="mb-6">
          <h3 className="font-bold text-gray-700 text-sm mb-1">หมายเหตุ</h3>
          <p className="text-sm text-gray-500">{contract.items?.notes || 'ไม่มี'}</p>
        </div>

        {/* Countdown Timer */}
        <div className="border border-[#DE6B6B] bg-[#DE6B6B]/10 rounded-full py-2 text-center mb-2">
          <span className="text-[#DE6B6B] text-sm font-medium">23:59:59</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="w-full max-w-sm space-y-3">
        {/* Accept Button */}
        <button
          onClick={handleAccept}
          disabled={actionLoading}
          className="w-full bg-[#88B459] hover:bg-[#769F4A] text-white rounded-2xl py-4 flex flex-col items-center justify-center shadow-sm transition-colors active:scale-[0.98] disabled:opacity-50"
        >
          <span className="text-base font-bold">ยอมรับ</span>
          <span className="text-[10px] font-light opacity-90">Accept</span>
        </button>

        {/* Decline Button */}
        <button
          onClick={handleDecline}
          disabled={actionLoading}
          className="w-full bg-[#DE6B6B] hover:bg-[#C95A5A] text-white rounded-2xl py-4 flex flex-col items-center justify-center shadow-sm transition-colors active:scale-[0.98] disabled:opacity-50"
        >
          <span className="text-base font-bold">Decline</span>
          <span className="text-[10px] font-light opacity-90">ปฏิเสธ</span>
        </button>
      </div>

    </div>
  );
}

export default function OfferDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <OfferDetailContent />
    </Suspense>
  );
}
