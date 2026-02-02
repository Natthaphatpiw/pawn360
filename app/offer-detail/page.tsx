'use client';

import { useState, useEffect, Suspense, type ReactNode, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import ImageCarousel from '@/components/ImageCarousel';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';

const INVESTOR_TIER_THRESHOLDS = {
  GOLD: 400_000,
  PLATINUM: 1_000_000,
};

const INVESTOR_TIER_RATES = {
  SILVER: 0.015,
  GOLD: 0.0153,
  PLATINUM: 0.016,
};

const resolveInvestorTier = (total: number) => {
  if (total >= INVESTOR_TIER_THRESHOLDS.PLATINUM) return 'PLATINUM';
  if (total >= INVESTOR_TIER_THRESHOLDS.GOLD) return 'GOLD';
  return 'SILVER';
};

function OfferDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useLiff();

  const [contract, setContract] = useState<any>(null);
  const [investor, setInvestor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const pendingActionRef = useRef<((token: string) => void) | null>(null);
  const [acceptSuccess, setAcceptSuccess] = useState(false);
  const [acceptMessage, setAcceptMessage] = useState('');

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

  console.log('Extracted contractId:', contractId);

  useEffect(() => {
    if (!contractId || !profile?.userId) return;
    ensureInvestorKyc();
  }, [contractId, profile?.userId]);

  const fetchContractDetails = async () => {
    try {
      setLoading(true);
      console.log('Fetching contract details for:', contractId);
      const response = await axios.get(`/api/contracts/${contractId}?viewer=investor&lineId=${profile?.userId}`);
      console.log('Contract data received:', response.data);
      setContract(response.data.contract);
    } catch (error: any) {
      console.error('Error fetching contract:', error);
      console.error('Error details:', error.response?.data);
      if (error.response?.data?.kycRequired) {
        router.replace('/ekyc-invest');
        return;
      }
      setError(error.response?.data?.error || 'ไม่สามารถโหลดรายละเอียดข้อเสนอได้');
    } finally {
      setLoading(false);
    }
  };

  const ensureInvestorKyc = async () => {
    try {
      const response = await axios.get(`/api/investors/by-line-id/${profile?.userId}`);
      const status = response.data.investor?.kyc_status;
      setInvestor(response.data.investor);
      if (status !== 'VERIFIED') {
        router.replace('/ekyc-invest');
        return;
      }
      fetchContractDetails();
    } catch (error) {
      console.error('Error checking investor KYC:', error);
      router.replace('/ekyc-invest');
    }
  };

  const submitAccept = async (pinToken: string) => {
    if (!profile?.userId) {
      alert('กรุณาเข้าสู่ระบบ LINE');
      return;
    }

    const canAccept = contract &&
      !contract.investor_id &&
      contract.funding_status === 'PENDING' &&
      ['PENDING', 'PENDING_SIGNATURE'].includes(contract.contract_status);

    if (!canAccept) {
      alert('ข้อเสนอนี้ไม่พร้อมรับการลงทุนแล้ว');
      return;
    }

    try {
      setActionLoading(true);
      const response = await axios.post('/api/contracts/investor-action', {
        action: 'accept',
        contractId,
        lineId: profile.userId,
        pinToken
      });

      if (response.data?.alreadyAccepted) {
        setAcceptMessage('ข้อเสนอนี้ถูกยอมรับไปแล้ว');
      } else {
        setAcceptMessage('รับข้อเสนอเรียบร้อย กรุณารอจุดรับฝากตรวจสอบและยืนยัน');
      }
      setAcceptSuccess(true);
    } catch (error: any) {
      console.error('Error accepting offer:', error);
      if (error.response?.data?.kycRequired) {
        router.replace('/ekyc-invest');
        return;
      }
      alert(error.response?.data?.error || 'เกิดข้อผิดพลาดในการยอมรับข้อเสนอ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!profile?.userId) {
      alert('กรุณาเข้าสู่ระบบ LINE');
      return;
    }

    const session = getPinSession('INVESTOR', profile.userId);
    if (session?.token) {
      await submitAccept(session.token);
      return;
    }

    pendingActionRef.current = async (token: string) => {
      await submitAccept(token);
    };
    setPinModalOpen(true);
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

  if (acceptSuccess) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white rounded-3xl p-8 text-center shadow-lg border border-gray-100">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">✓</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">รับข้อเสนอเรียบร้อย</h1>
          <p className="text-gray-600 text-sm mb-6">
            {acceptMessage || 'กรุณารอจุดรับฝากตรวจสอบและยืนยัน'}
          </p>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).liff?.closeWindow) {
                (window as any).liff.closeWindow();
              } else {
                router.push('/investment');
              }
            }}
            className="w-full bg-[#1E3A8A] hover:bg-[#152C6B] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            ปิด
          </button>
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
    value: ReactNode;
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

  const interestAmount = Number(contract.interest_amount) || 0;
  const platformFeeRate = typeof contract.platform_fee_rate === 'number'
    ? contract.platform_fee_rate
    : 0.01;
  const interestRatePercent = typeof contract.interest_rate === 'number'
    ? contract.interest_rate * 100
    : 0;
  const feeRatePercent = platformFeeRate * 100;
  const principal = Number(contract.loan_principal_amount || 0);
  const durationDays = Number(contract.contract_duration_days || 0);
  const platformFeeRaw = Number(contract.platform_fee_amount);
  const platformFeeAmount = Number.isFinite(platformFeeRaw) && platformFeeRaw > 0
    ? platformFeeRaw
    : Math.round(principal * platformFeeRate * (durationDays / 30) * 100) / 100;
  const currentTotal = Number(investor?.total_active_principal || 0);
  const projectedTier = resolveInvestorTier(currentTotal + principal);
  const investorRate = typeof contract.investor_rate === 'number'
    ? contract.investor_rate
    : INVESTOR_TIER_RATES[projectedTier];
  const investorRatePercent = investorRate * 100;
  const investorInterest = Math.round(principal * investorRate * (durationDays / 30) * 100) / 100;

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
          <ImageCarousel
            images={contract.items?.image_urls}
            className="w-full h-full gap-0 no-scrollbar"
            itemClassName="w-full h-full flex-shrink-0"
            emptyLabel="No Image"
            emptyClassName="w-full h-full flex items-center justify-center text-gray-400 text-sm"
          />
        </div>

        {/* Details List */}
        <div className="space-y-1 mb-4">
          <InfoRow label="ผู้จำนำ" value="ไม่เปิดเผย" valueColor="text-gray-500" />
          <InfoRow label="สินค้า" value={`${contract.items?.brand} ${contract.items?.model}`} />
          <InfoRow label="ความจุ" value={contract.items?.capacity || 'ไม่ระบุ'} />
          <InfoRow label="สภาพ" value={`${contract.items?.item_condition}%`} />
          <InfoRow label="ตำหนิ" value={contract.items?.defects || 'ไม่มี'} />
          <InfoRow label="มูลค่า" value={`${contract.loan_principal_amount?.toLocaleString()}.00`} />
          <InfoRow
            label="ดอกเบี้ย"
            value={(
              <div className="text-right">
                <div>{`${interestRatePercent.toFixed(1)}% | ${interestAmount.toLocaleString()}`}</div>
                <div className="text-xs text-gray-500">
                  นักลงทุน {investorRatePercent.toFixed(2)}% {investorInterest.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">
                  ค่าธรรมเนียมระบบ {feeRatePercent.toFixed(1)}% {platformFeeAmount.toLocaleString()}
                </div>
              </div>
            )}
          />
          <InfoRow label="ระยะเวลา" value={`${contract.contract_duration_days} วัน`} />
          <InfoRow label="วันที่เสนอ" value={new Date().toLocaleDateString('th-TH')} />
        </div>

        <div className="h-px bg-white my-3 opacity-60"></div>

        {/* Remarks */}
        <div className="mb-6">
          <h3 className="font-bold text-gray-700 text-sm mb-1">หมายเหตุ</h3>
          <p className="text-sm text-gray-500">{contract.items?.notes || 'ไม่มี'}</p>
        </div>

      </div>

      {/* Action Buttons */}
      <div className="w-full max-w-sm space-y-3">
        {/* Accept Button */}
        <button
          onClick={handleAccept}
          disabled={actionLoading}
          className="w-full bg-[#1E3A8A] hover:bg-[#152C6B] text-white rounded-2xl py-4 flex flex-col items-center justify-center shadow-sm transition-colors active:scale-[0.98] disabled:opacity-50"
        >
          <span className="text-base font-bold">ยอมรับ</span>
          <span className="text-[10px] font-light opacity-90">Accept</span>
        </button>
      </div>

      <PinModal
        open={pinModalOpen}
        role="INVESTOR"
        lineId={profile?.userId || ''}
        onClose={() => setPinModalOpen(false)}
        onVerified={(token) => {
          setPinModalOpen(false);
          pendingActionRef.current?.(token);
          pendingActionRef.current = null;
        }}
      />

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
