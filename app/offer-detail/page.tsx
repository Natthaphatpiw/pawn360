'use client';

import { useState, useEffect, Suspense, type ReactNode, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import ImageCarousel from '@/components/ImageCarousel';
import PinModal from '@/components/PinModal';
import { openLiffEntry } from '@/lib/liff/navigation';
import { getMockContractById, getMockInvestorProfile, isInvestorPreviewMode, MOCK_CONTRACT_IDS } from '@/lib/mock-investment';
import { CheckCircle } from 'lucide-react';

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
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading } = useLiff();

  const redirectToInvestorVerification = () => {
    openLiffEntry({
      liffIdCandidates: [
        process.env.NEXT_PUBLIC_LIFF_ID_INVEST_REGISTER,
        process.env.NEXT_PUBLIC_LIFF_ID_INVEST,
      ],
      fallbackPath: '/ekyc-invest',
    });
  };

  const [contract, setContract] = useState<any>(null);
  const [investor, setInvestor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const pendingActionRef = useRef<((token: string) => void) | null>(null);
  const [acceptSuccess, setAcceptSuccess] = useState(false);
  const [acceptMessage, setAcceptMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // Get contractId from either direct param or from liff.state
  const previewMode = isInvestorPreviewMode();
  let contractId = searchParams.get('contractId');

  // If not found, try to extract from liff.state
  if (!contractId) {
    const liffState = searchParams.get('liff.state');
    if (liffState) {
      // liff.state format: /offer-detail?contractId=xxx
      const match = liffState.match(/contractId=([^&]+)/);
      if (match) {
        contractId = decodeURIComponent(match[1]);
      }
    }
  }
  const effectiveContractId = contractId || (previewMode ? MOCK_CONTRACT_IDS.offer : null);

  const formatPostedAt = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '-';
    return date.toLocaleString('th-TH', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatOfferEndIn = (value?: string | null, currentTime = Date.now()) => {
    if (!value) return '-';
    const expiryDate = new Date(value);
    const expiryMs = expiryDate.getTime();
    if (!Number.isFinite(expiryMs)) return '-';

    const remainingMs = expiryMs - currentTime;
    if (remainingMs <= 0) return 'หมดเวลาแล้ว';

    const totalMinutes = Math.floor(remainingMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours} ชั่วโมง : ${minutes.toString().padStart(2, '0')} นาที`;
  };

  useEffect(() => {
    if (liffLoading) return;

    if (!effectiveContractId) {
      setError('ไม่พบรายละเอียดข้อเสนอ');
      setLoading(false);
      return;
    }

    if (!profile?.userId) {
      setError('ไม่พบ LINE profile กรุณาเปิดลิงก์ผ่าน LINE');
      setLoading(false);
      return;
    }

    ensureInvestorKyc();
  }, [effectiveContractId, profile?.userId, liffLoading]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    setNow(Date.now());

    return () => window.clearInterval(timer);
  }, []);

  const fetchContractDetails = async () => {
    try {
      setLoading(true);
      console.log('Fetching contract details for:', effectiveContractId);
      if (previewMode) {
        setContract(getMockContractById(effectiveContractId));
        setError(null);
        return;
      }
      const response = await axios.get(`/api/contracts/${effectiveContractId}?viewer=investor&lineId=${profile?.userId}`);
      setContract(response.data.contract);
    } catch (error: any) {
      console.error('Error fetching contract:', error);
      console.error('Error details:', error.response?.data);
      if (error.response?.data?.kycRequired) {
        redirectToInvestorVerification();
        return;
      }
      setError(error.response?.data?.error || 'ไม่สามารถโหลดรายละเอียดข้อเสนอได้');
    } finally {
      setLoading(false);
    }
  };

  const ensureInvestorKyc = async () => {
    try {
      if (previewMode) {
        setInvestor(getMockInvestorProfile());
        fetchContractDetails();
        return;
      }
      const response = await axios.get(`/api/investors/by-line-id/${profile?.userId}`);
      const status = response.data.investor?.kyc_status;
      setInvestor(response.data.investor);
      if (status !== 'VERIFIED') {
        redirectToInvestorVerification();
        return;
      }
      fetchContractDetails();
    } catch (error) {
      console.error('Error checking investor KYC:', error);
      redirectToInvestorVerification();
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
        contractId: effectiveContractId,
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
        redirectToInvestorVerification();
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

    if (previewMode) {
      setAcceptMessage('รับข้อเสนอ mock สำเร็จ สามารถใช้หน้านี้ตรวจเลย์เอาต์และ flow ได้');
      setAcceptSuccess(true);
      return;
    }

    pendingActionRef.current = async (token: string) => {
      await submitAccept(token);
    };
    setPinModalOpen(true);
  };

  if (liffLoading || loading) {
    return (
      <div className="page-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (acceptSuccess) {
    return (
      <div className="theme-liff theme-investor h-[100dvh] min-h-[100dvh] bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl bg-background p-4 text-center">
          <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-24 h-24 text-green-500" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">รับข้อเสนอเรียบร้อย</h1>
          <p className="text-foreground-subtle text-sm mb-6">
            {acceptMessage || 'กรุณารอจุดรับฝากตรวจสอบและยืนยัน'}
          </p>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).liff?.closeWindow) {
                (window as any).liff.closeWindow();
              } else {
                openLiffEntry({
                  liffIdCandidates: [
                    process.env.NEXT_PUBLIC_LIFF_ID_INVESTMENT,
                    process.env.NEXT_PUBLIC_LIFF_ID_INVEST_DASHBOARD,
                  ],
                  fallbackPath: '/investment',
                  statePath: '/investment',
                });
              }
            }}
            className="btn-transition btn-sheen w-full rounded-full bg-s2 py-4 font-medium text-s2-fg shadow-soft"
          >
            ปิด
          </button>
        </div>
      </div>
    );
  }

  if (!effectiveContractId) {
    return (
      <div className="theme-liff theme-investor h-[100dvh] min-h-[100dvh] bg-background-white flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-s2-border bg-background-white p-8 text-center shadow-strong">
          <div className="mb-4 text-error">ไม่พบ Contract ID</div>
          <div className="mb-4 text-sm text-foreground-subtle">
            Debug: {JSON.stringify({
              directParam: searchParams.get('contractId'),
              liffState: searchParams.get('liff.state'),
              allParams: Array.from(searchParams.entries())
            })}
          </div>
          <button
            onClick={() => openLiffEntry({
              liffIdCandidates: [
                process.env.NEXT_PUBLIC_LIFF_ID_INVESTOR_OFFERS,
              ],
              fallbackPath: '/investor-offers',
              statePath: '/investor-offers',
            })}
            className="btn-transition inline-flex min-h-12 items-center justify-center rounded-full border border-s2 bg-s2 px-6 py-3 text-sm font-medium text-s2-fg"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="theme-liff theme-investor h-[100dvh] min-h-[100dvh] bg-background-white flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center rounded-xl border border-s2-border bg-s2-soft px-6 py-8 shadow-soft">
          <div className="text-error mb-4">{error || 'ไม่พบข้อมูลข้อเสนอ'}</div>
          <div className="text-sm text-foreground-subtle mb-4">Contract ID: {effectiveContractId}</div>
          <button
            onClick={() => openLiffEntry({
              liffIdCandidates: [
                process.env.NEXT_PUBLIC_LIFF_ID_INVESTOR_OFFERS,
              ],
              fallbackPath: '/investor-offers',
              statePath: '/investor-offers',
            })}
            className="btn-transition inline-flex min-h-12 items-center justify-center rounded-full border border-s2 bg-background-white px-6 py-3 text-sm font-medium text-s2"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  const InfoRow = ({ label, value, valueColor = 'text-foreground', isBoldValue = false }: {
    label: string;
    value: ReactNode;
    valueColor?: string;
    isBoldValue?: boolean;
  }) => (
    <div className="flex justify-between items-start py-1">
      <div className="w-1/3 text-sm font-bold text-foreground-muted">{label}</div>
      <div className={`text-right w-2/3 text-sm ${valueColor} ${isBoldValue ? 'font-bold' : 'font-base'}`}>
        {value}
      </div>
    </div>
  );

  const interestAmount = Number(contract.interest_amount) || 0;
  const platformFeeRate = typeof contract.platform_fee_rate === 'number'
    ? contract.platform_fee_rate
    : 0.015;
  const interestRatePercent = typeof contract.interest_rate === 'number'
    ? contract.interest_rate * 100
    : 0;
  const feeRatePercent = platformFeeRate * 100;
  const principal = Number(contract.loan_principal_amount || 0);
  const durationDays = Number(contract.contract_duration_days || 0);
  const offerPostedAt = contract?.posted_at || contract?.updated_at || contract?.created_at;
  const offerExpiresAt = contract?.expires_at || (offerPostedAt ? new Date(new Date(offerPostedAt).getTime() + (4 * 60 * 60 * 1000)).toISOString() : null);
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
  const offerEndInLabel = formatOfferEndIn(offerExpiresAt, now);
  const isOfferAccepted = Boolean(contract?.investor_id);
  const isOfferUnavailable = isOfferAccepted || contract.funding_status !== 'PENDING' || !['PENDING', 'PENDING_SIGNATURE'].includes(contract.contract_status);

  return (
    <div className="theme-liff theme-investor min-h-screen bg-background px-4 py-6 mb-12 flex flex-col items-center">
      <div className="mb-5 w-full max-w-sm rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
        <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
          <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-s2/70">
            Offer Detail
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-s2">
            รายละเอียดข้อเสนอ
          </div>
          <p className="mt-2 text-xs text-foreground-subtle">ตรวจสอบรายละเอียดสัญญาและผลตอบแทนก่อนตอบรับข้อเสนอ</p>
        </div>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-s2-border bg-background-white p-4 mb-4 shadow-soft">
        <div className="w-full aspect-square bg-s2-soft/45 rounded-lg overflow-hidden mb-6">
          <ImageCarousel
            images={contract.items?.image_urls}
            className="w-full h-full gap-0 no-scrollbar"
            itemClassName="w-full h-full flex-shrink-0"
            emptyLabel="No Image"
            emptyClassName="w-full h-full flex items-center justify-center text-sm text-foreground-subtle"
          />
        </div>

        {/* Details List */}
        <div className="space-y-1 mb-4">
          <InfoRow label="ผู้ขอสินเชื่อ" value="ไม่เปิดเผย" valueColor="text-foreground-subtle" />
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
                <div className="text-xs text-foreground-subtle">
                  นักลงทุน {investorRatePercent.toFixed(2)}% {investorInterest.toLocaleString()}
                </div>
                <div className="text-xs text-foreground-subtle">
                  ค่าธรรมเนียมระบบ {feeRatePercent.toFixed(1)}% {platformFeeAmount.toLocaleString()}
                </div>
              </div>
            )}
          />
          <InfoRow label="ระยะเวลา" value={`${contract.contract_duration_days} วัน`} />
        </div>

        {!isOfferAccepted && (
          <div className="rounded-lg border border-s2-border bg-s2-soft/60 p-3 mb-4 shadow-soft">
            <div className="space-y-1">
              <InfoRow label="Posted at" value={formatPostedAt(offerPostedAt)} />
              <InfoRow label="Offer end in" value={offerEndInLabel} isBoldValue />
            </div>
          </div>
        )}

        <div className="h-px bg-s2-border my-3 opacity-60"></div>

        {/* Remarks */}
        <div className="mb-2">
          <h3 className="font-bold text-foreground text-sm mb-1">หมายเหตุ</h3>
          <p className="text-sm text-foreground-subtle">{contract.items?.notes || 'ไม่มี'}</p>
        </div>

      </div>

      {/* Action Buttons */}
      <div className="w-full max-w-sm space-y-3">
        {/* Accept Button */}
        <button
          onClick={handleAccept}
          disabled={actionLoading || isOfferUnavailable}
          className="btn-transition btn-sheen w-full rounded-full bg-s2 py-2 flex flex-col items-center justify-center shadow-soft transition-colors disabled:cursor-not-allowed disabled:opacity-50 text-s2-fg"
        >
          <span className="text-base font-medium">
            {isOfferAccepted
              ? 'ข้อเสนอนี้ถูกรับไปแล้ว'
              : actionLoading
                ? 'กำลังดำเนินการ...'
                : 'รับข้อเสนอ'}
          </span>
          {isOfferAccepted ? (
            <span className="text-xs font-light opacity-90">Offer unavailable</span>
          ) : (
            <span className="text-xs font-light opacity-90">Accept</span>
          )}
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
      <div className="theme-liff theme-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    }>
      <OfferDetailContent />
    </Suspense>
  );
}
