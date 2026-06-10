'use client';

import { useState, useEffect, Suspense, use, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { ArrowRight, Download, TrendingUp } from 'lucide-react';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';
import { openLiffEntry } from '@/lib/liff/navigation';
import {
  getInvestorPrincipalIncreaseStatusMeta,
  getMockContractById,
  getMockPrincipalIncreaseRequestForContract,
  INVESTOR_PRINCIPAL_INCREASE_APPROVAL_STATUSES,
  isInvestorPreviewMode,
} from '@/lib/mock-investment';

const resolveNetInvestorRate = (contract: {
  investor_rate?: number | null;
  interest_rate?: number | null;
  platform_fee_rate?: number | null;
}) => {
  if (typeof contract.investor_rate === 'number' && Number.isFinite(contract.investor_rate)) {
    return Math.max(contract.investor_rate, 0);
  }

  const grossRate = typeof contract.interest_rate === 'number' ? contract.interest_rate : 0;
  const feeRate = typeof contract.platform_fee_rate === 'number' ? contract.platform_fee_rate : 0.01;
  return Math.max(grossRate - feeRate, 0);
};

function InvestorContractDetailContent({ contractId }: { contractId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading } = useLiff();

  const [contract, setContract] = useState<any>(null);
  const [principalIncreaseRequest, setPrincipalIncreaseRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectToInvestorVerification = () => {
    openLiffEntry({
      liffIdCandidates: [
        process.env.NEXT_PUBLIC_LIFF_ID_INVEST_REGISTER,
        process.env.NEXT_PUBLIC_LIFF_ID_INVEST,
      ],
      fallbackPath: '/ekyc-invest',
    });
  };

  useEffect(() => {
    if (liffLoading || !profile?.userId || !contractId) return;

    if (isInvestorPreviewMode()) {
      setPinVerified(true);
      fetchContractDetails();
      return;
    }

    const session = getPinSession('INVESTOR', profile.userId);
    if (session?.token) {
      setPinVerified(true);
      fetchContractDetails();
      return;
    }

    setPinVerified(false);
    setPinModalOpen(true);
    setLoading(false);
  }, [liffLoading, profile?.userId, contractId]);

  useEffect(() => {
    if (!contractId) return;

    if (isInvestorPreviewMode()) {
      setPrincipalIncreaseRequest(getMockPrincipalIncreaseRequestForContract(contractId));
      return;
    }

    const requestId = searchParams.get('requestId');
    if (!requestId) {
      setPrincipalIncreaseRequest(null);
      return;
    }

    const fetchPrincipalIncreaseRequest = async () => {
      try {
        const response = await axios.get(`/api/contract-actions/${requestId}?viewer=investor`);
        const request = response.data?.request;
        if (response.data?.success && request?.request_type === 'PRINCIPAL_INCREASE' && request?.contract_id === contractId) {
          setPrincipalIncreaseRequest(request);
          return;
        }
        setPrincipalIncreaseRequest(null);
      } catch (requestError) {
        console.error('Error fetching principal increase request:', requestError);
        setPrincipalIncreaseRequest(null);
      }
    };

    fetchPrincipalIncreaseRequest();
  }, [contractId, searchParams]);

  const fetchContractDetails = async () => {
    try {
      setLoading(true);
      if (isInvestorPreviewMode()) {
        setContract(getMockContractById(contractId));
        setError(null);
        return;
      }
      const response = await axios.get(`/api/contracts/${contractId}?viewer=investor&lineId=${profile?.userId}`);
      setContract(response.data.contract);
    } catch (fetchError: any) {
      console.error('Error fetching contract:', fetchError);
      if (fetchError.response?.data?.kycRequired) {
        redirectToInvestorVerification();
        return;
      }
      setError(fetchError.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      if (isInvestorPreviewMode()) {
        alert('Mock mode: เปิดหน้า ticket เพื่อดูตัวอย่างเอกสารได้');
        return;
      }

      const response = await fetch(`/api/contracts/pawn-ticket/${contractId}?viewer=investor&format=pdf`);
      if (!response.ok) {
        throw new Error('ไม่สามารถสร้าง PDF ได้');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${contract?.contract_number || `pawn-ticket-${contractId}`}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (downloadError: any) {
      console.error('Error downloading PDF:', downloadError);
      alert(downloadError.message || 'ไม่สามารถดาวน์โหลด PDF ได้');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_INVESTOR_APPROVAL':
      case 'AWAITING_INVESTOR_APPROVAL':
        return { text: 'รออนุมัติ', color: 'text-warning' };
      case 'CONFIRMED':
        return { text: 'กำลังดำเนินการ', color: 'text-s2' };
      case 'PENDING':
      case 'ACTIVE':
      case 'EXTENDED':
        return { text: 'ปกติ', color: 'text-success' };
      case 'COMPLETED':
        return { text: 'เสร็จสิ้น', color: 'text-foreground-subtle' };
      case 'PENDING_SIGNATURE':
        return { text: 'รอลงนาม', color: 'text-warning' };
      case 'DEFAULTED':
        return { text: 'เลยกำหนด', color: 'text-error' };
      case 'TERMINATED':
        return { text: 'ยกเลิก', color: 'text-foreground-subtle' };
      default:
        return { text: status, color: 'text-foreground-subtle' };
    }
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const InfoRow = ({ label, value, valueColor = 'text-foreground-muted' }: { label: string; value: ReactNode; valueColor?: string }) => (
    <div className="flex justify-between items-start mb-2">
      <div className="w-1/3 text-sm font-medium text-foreground">{label}</div>
      <div className={`text-right w-2/3 text-sm text-foreground-subtle ${valueColor}`}>{value}</div>
    </div>
  );

  const getPrincipalIncreaseRequestId = (request: any) =>
    request?.request_id ||
    request?.requestId ||
    request?.id ||
    null;

  const navigateToPrincipalIncreaseUpload = (path: string) => {
    if (typeof window !== 'undefined') {
      window.location.href = path;
      return;
    }

    router.push(path);
  };

  if (liffLoading || loading) {
    return (
      <div className="page-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (!pinVerified) {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background-white flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white px-6 py-6 text-center shadow-soft">
            <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-s2">
              Secure Contract
            </div>
            <h2 className="mt-4 text-lg font-bold text-foreground">ยืนยัน PIN ก่อนเข้าดูสัญญา</h2>
            <p className="mt-2 text-sm text-foreground-subtle">
              เพื่อความปลอดภัย กรุณายืนยัน PIN 6 หลักก่อนดูรายละเอียดสัญญา
            </p>
            <button
              type="button"
              onClick={() => setPinModalOpen(true)}
              className="btn-transition btn-sheen mt-5 w-full rounded-full bg-[image:var(--background-image-grad-investor)] py-3 text-sm font-bold text-s2-fg shadow-soft"
            >
              ยืนยัน PIN
            </button>
          </div>
        </div>

        {profile?.userId && (
          <PinModal
            open={pinModalOpen}
            role="INVESTOR"
            lineId={profile.userId}
            onClose={() => setPinModalOpen(false)}
            onVerified={() => {
              setPinVerified(true);
              setPinModalOpen(false);
              fetchContractDetails();
            }}
          />
        )}
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background px-4 py-6">
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <div className="w-full max-w-sm rounded-xl border border-s2-border bg-s2-soft px-6 py-8 text-center shadow-soft">
            <p className="mb-4 text-error">{error || 'ไม่พบข้อมูลสัญญา'}</p>
            <button
              onClick={() => router.back()}
              className="btn-transition inline-flex min-h-12 items-center justify-center rounded-full border border-s2 bg-background-white px-6 py-3 text-sm font-medium text-s2"
            >
              กลับ
            </button>
          </div>
        </div>
      </div>
    );
  }

  const principalIncreaseStatus = principalIncreaseRequest?.request_status;
  const principalIncreaseStatusMeta = getInvestorPrincipalIncreaseStatusMeta(principalIncreaseStatus);
  const displayContractStatus = INVESTOR_PRINCIPAL_INCREASE_APPROVAL_STATUSES.has(principalIncreaseStatus)
    ? principalIncreaseStatus
    : contract.contract_status;
  const badge = getStatusBadge(displayContractStatus);
  const daysRemaining = getDaysRemaining(contract.contract_end_date);
  const interestAmount = Number(contract.interest_amount) || 0;
  const platformFeeRate = typeof contract.platform_fee_rate === 'number' ? contract.platform_fee_rate : 0.01;
  const interestRatePercent = typeof contract.interest_rate === 'number' ? contract.interest_rate * 100 : 0;
  const feeRatePercent = platformFeeRate * 100;
  const principal = Number(contract.loan_principal_amount || 0);
  const durationDays = Number(contract.contract_duration_days || 0);
  const platformFeeRaw = Number(contract.platform_fee_amount);
  const platformFeeAmount = Number.isFinite(platformFeeRaw) && platformFeeRaw > 0
    ? platformFeeRaw
    : Math.round(principal * platformFeeRate * (durationDays / 30) * 100) / 100;
  const investorRate = resolveNetInvestorRate(contract);
  const investorRatePercent = investorRate * 100;
  const investorReward = Math.round(principal * investorRate * (durationDays / 30) * 100) / 100;
  const principalIncreaseRequestId = getPrincipalIncreaseRequestId(principalIncreaseRequest);
  const shouldShowPrincipalIncreaseRequest =
    ['ACTIVE', 'EXTENDED'].includes(contract.contract_status) &&
    INVESTOR_PRINCIPAL_INCREASE_APPROVAL_STATUSES.has(principalIncreaseStatus) &&
    Boolean(principalIncreaseRequestId);
  const principalIncreaseCtaPath = shouldShowPrincipalIncreaseRequest && principalIncreaseRequestId
    ? `/investor/principal-increase/${principalIncreaseRequestId}/upload`
    : null;

  return (
    <div className="theme-liff theme-investor min-h-screen bg-background-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <div className="mb-5 rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
            <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-s2/70">
              Contract Detail
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-s2">
              รายการขอสินเชื่อ
            </div>
            <p className="mt-2 text-xs text-foreground-subtle">{contract.contract_number}</p>
          </div>
        </div>

        <div className="space-y-4 pb-8">

          {/* Privacy Notice */}
          <div className="mb-4 p-4 pb-3 rounded-lg bg-background-white text-sm text-warning border border-warning">
            ข้อมูลส่วนบุคคลของผู้ขอสินเชื่อถูกปกปิดตามนโยบายความเป็นส่วนตัว
          </div>

          {/* Contract Details */}
          <div className="mb-4 p-4 pb-2 rounded-lg bg-background-subtle">
            <h2 className="mb-2 text-base font-bold text-foreground">รายละเอียดสัญญา</h2>
            <div className="space-y-1 text-sm">
              <InfoRow label="หมายเลขสัญญา" value={contract.contract_number || '-'} />
              <InfoRow label="สินค้า" value={`${[contract.items?.brand, contract.items?.model].filter(Boolean).join(' ') || '-'}`} />
              <InfoRow label="สถานะ" value={badge.text} valueColor={badge.color} />
              <InfoRow label="มูลค่า" value={`${contract.loan_principal_amount?.toLocaleString() || 0} บาท`} />
              <InfoRow
                label="ดอกเบี้ย"
                value={(
                  <div className="text-right">
                    <div>{`${interestAmount.toLocaleString()} บาท (${interestRatePercent.toFixed(1)}%)`}</div>
                    <div className="text-xs text-foreground-subtle">
                      นักลงทุน {investorRatePercent.toFixed(2)}% {investorReward.toLocaleString()} บาท
                    </div>
                    <div className="text-xs text-foreground-subtle">
                      ค่าธรรมเนียมระบบ {feeRatePercent.toFixed(1)}% {platformFeeAmount.toLocaleString()} บาท
                    </div>
                  </div>
                )}
              />
              <InfoRow label="ระยะเวลา" value={`${contract.contract_duration_days || 0} วัน`} />
              <InfoRow
                label="วันเริ่มต้น"
                value={contract.contract_start_date ? new Date(contract.contract_start_date).toLocaleDateString('th-TH') : '-'}
              />
              <InfoRow
                label="วันสิ้นสุด"
                value={contract.contract_end_date ? new Date(contract.contract_end_date).toLocaleDateString('th-TH') : '-'}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="mb-4 p-4 rounded-lg bg-background-subtle">
            <h2 className="mb-1 text-base font-bold text-foreground">หมายเหตุ</h2>
            <p className="text-sm text-foreground-subtle">{contract.items?.notes || 'ไม่มี'}</p>
          </div>

          {shouldShowPrincipalIncreaseRequest && principalIncreaseRequest && principalIncreaseCtaPath && (
            <button
              type="button"
              onClick={() => navigateToPrincipalIncreaseUpload(principalIncreaseCtaPath)}
              className="mb-4 w-full rounded-lg border border-red-200 bg-red-50 p-4 text-left shadow-soft transition-transform active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-red-500 shadow-soft">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-base font-bold text-red-700">คำขอเพิ่มเงินต้น</div>
                    <div className="mt-1 inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-600">
                      {principalIncreaseStatusMeta.label}
                    </div>
                    <p className="mt-2 text-sm text-red-700/80">
                      {principalIncreaseStatusMeta.description}
                    </p>
                    <p className="mt-2 text-sm font-medium text-red-700">
                      จำนวนเงิน {Number(principalIncreaseRequest.increase_amount || 0).toLocaleString()} บาท
                    </p>
                  </div>
                </div>
                <ArrowRight className="mt-1 h-5 w-5 text-red-500" />
              </div>
            </button>
          )}

          {/* Remaining Days */}
          <div className="relative mb-4 flex items-center justify-between overflow-hidden rounded-lg border border-s2-border bg-s2-soft p-4 text-s2 shadow-soft">
            <div className="absolute inset-0 bg-[image:var(--background-image-grad-investor)] opacity-8"></div>
            <div className="relative z-10">
              <div className="font-bold text-xl mb-1 text-s2">ระยะเวลาคงเหลือ</div>
              <div className="text-xs opacity-80 font-light text-s2">Remaining days</div>
            </div>
            <div className="relative z-10 text-right">
              <div className="text-xs opacity-80 mb-1 text-s2">วัน</div>
              <div className="text-5xl font-bold leading-none text-s2">{daysRemaining > 0 ? daysRemaining : 0}</div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => router.push(`/investor-pawn-ticket/${contractId}`)}
              className="btn-transition w-full rounded-full border border-s2 bg-background py-2 text-s2"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-base font-medium">ดูสัญญา</span>
              </div>
              <span className="text-xs opacity-70 font-light">See contract</span>
            </button>

            {/* Download PDF */}
            {/* <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="btn-transition w-full rounded-full border border-s2-border bg-s2-soft py-2 text-s2 disabled:opacity-60"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-base font-medium">{downloadingPdf ? 'กำลังสร้าง PDF...' : 'ดาวน์โหลด PDF'}</span>
              </div>
              <span className="text-xs opacity-70 font-light">Download PDF</span>
            </button> */}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvestorContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);

  return (
    <Suspense fallback={
      <div className="theme-liff theme-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    }>
      <InvestorContractDetailContent contractId={resolvedParams.id} />
    </Suspense>
  );
}
