'use client';

import { useState, useEffect, Suspense, use, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { ChevronLeft, Download, FileText } from 'lucide-react';

function InvestorContractDetailContent({ contractId }: { contractId: string }) {
  const router = useRouter();
  const { profile, isLoading: liffLoading } = useLiff();

  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (liffLoading || !profile?.userId || !contractId) return;
    fetchContractDetails();
  }, [liffLoading, profile?.userId, contractId]);

  const fetchContractDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/contracts/${contractId}?viewer=investor&lineId=${profile?.userId}`);
      setContract(response.data.contract);
    } catch (error: any) {
      console.error('Error fetching contract:', error);
      if (error.response?.data?.kycRequired) {
        router.replace('/ekyc-invest');
        return;
      }
      setError(error.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return { text: 'ปกติ', color: 'text-[#7CAB4A]' };
      case 'COMPLETED':
        return { text: 'เสร็จสิ้น', color: 'text-[#1E40AF]' };
      case 'DEFAULTED':
        return { text: 'เกินกำหนด', color: 'text-[#991B1B]' };
      default:
        return { text: status, color: 'text-gray-600' };
    }
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const InfoRow = ({ label, value, valueColor = 'text-gray-600' }: { label: string; value: ReactNode; valueColor?: string }) => (
    <div className="flex justify-between items-start mb-2">
      <div className="font-bold text-gray-700 w-1/3">{label}</div>
      <div className={`text-right w-2/3 ${valueColor}`}>{value}</div>
    </div>
  );

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'ไม่พบข้อมูลสัญญา'}</p>
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

  const badge = getStatusBadge(contract.contract_status);
  const daysRemaining = getDaysRemaining(contract.contract_end_date);
  const totalInterest = Number(contract.interest_amount) || 0;
  const platformFeeRate = typeof contract.platform_fee_rate === 'number'
    ? contract.platform_fee_rate
    : 0.5;
  const investorShare = Math.max(0, 1 - platformFeeRate);
  const investorReward = Math.round(totalInterest * investorShare * 100) / 100;
  const platformFee = Math.round(totalInterest * platformFeeRate * 100) / 100;
  const interestRatePercent = typeof contract.interest_rate === 'number'
    ? contract.interest_rate * 100
    : 0;
  const investorRatePercent = interestRatePercent * investorShare;
  const platformRatePercent = interestRatePercent * platformFeeRate;

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans px-4 py-6 pb-20">

      {/* Back Button */}
      <button
        onClick={() => router.back()}
        className="flex items-center text-[#1E3A8A] mb-4"
      >
        <ChevronLeft className="w-5 h-5" />
        <span className="text-sm font-medium">กลับ</span>
      </button>

      {/* Privacy Notice */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-800 mb-2">ข้อมูลผู้จำนำ</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
          ข้อมูลส่วนบุคคลของผู้จำนำถูกปกปิดตามนโยบายความเป็นส่วนตัว
        </div>
        <div className="h-px bg-gray-300 my-4 opacity-50"></div>
      </div>

      {/* Contract Details Section */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-800 mb-3">รายละเอียดสัญญา</h2>
        <div className="space-y-1 text-sm">
          <InfoRow label="หมายเลขสัญญา" value={contract.contract_number || '-'} />
          <InfoRow label="สินค้า" value={`${contract.items?.brand || ''} ${contract.items?.model || ''}`} />
          <InfoRow label="สถานะ" value={badge.text} valueColor={badge.color} />
          <InfoRow label="มูลค่า" value={`${contract.loan_principal_amount?.toLocaleString() || 0} บาท`} />
          <InfoRow
            label="ดอกเบี้ย"
            value={(
              <div className="text-right">
                <div>{`${totalInterest.toLocaleString()} บาท (${interestRatePercent.toFixed(0)}%)`}</div>
                <div className="text-xs text-gray-500">
                  นักลงทุน {investorRatePercent.toFixed(1)}% {investorReward.toLocaleString()} บาท
                </div>
                <div className="text-xs text-gray-500">
                  ค่าธรรมเนียมระบบ {platformRatePercent.toFixed(1)}% {platformFee.toLocaleString()} บาท
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
        <div className="h-px bg-gray-300 my-4 opacity-50"></div>
      </div>

      {/* Remarks */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-800 mb-1">หมายเหตุ</h2>
        <p className="text-gray-600 text-sm">{contract.items?.notes || 'ไม่มี'}</p>
      </div>

      {/* Remaining Days Card */}
      <div className="bg-[#DCE4F0] rounded-2xl p-6 mb-8 flex justify-between items-center text-[#1E3A8A] relative overflow-hidden shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-[#DCE4F0] to-[#E9EFF6]"></div>

        <div className="relative z-10">
          <div className="font-bold text-xl mb-1">ระยะเวลาคงเหลือ</div>
          <div className="text-xs opacity-80 font-light">Remaining days</div>
        </div>

        <div className="relative z-10 text-right">
          <div className="text-xs opacity-80 mb-1">วัน</div>
          <div className="text-5xl font-bold leading-none">{daysRemaining}</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        {/* See Contract */}
        <button
          onClick={() => router.push(`/investor-pawn-ticket/${contractId}`)}
          className="w-full bg-white border border-[#1E3A8A] hover:bg-gray-50 text-[#1E3A8A] rounded-2xl py-3 flex flex-col items-center justify-center transition-colors shadow-sm active:scale-[0.98]"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            <span className="text-base font-bold">ดูสัญญา</span>
          </div>
          <span className="text-[10px] opacity-70 font-light">See contract</span>
        </button>

        {/* Download PDF (if exists) */}
        {contract.signed_contract_url && (
          <a
            href={contract.signed_contract_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#E9EFF6] hover:bg-[#DCE4F0] text-[#1E3A8A] rounded-2xl py-3 flex flex-col items-center justify-center transition-colors shadow-sm active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              <span className="text-base font-bold">ดาวน์โหลด PDF</span>
            </div>
            <span className="text-[10px] opacity-70 font-light">Download PDF</span>
          </a>
        )}
      </div>

    </div>
  );
}

export default function InvestorContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <InvestorContractDetailContent contractId={resolvedParams.id} />
    </Suspense>
  );
}
