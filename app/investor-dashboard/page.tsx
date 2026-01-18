'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { Wallet, ChevronRight } from 'lucide-react';

function InvestorDashboardContent() {
  const router = useRouter();
  const { profile, isLoading: liffLoading } = useLiff();

  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState<any>(null);
  const [myContracts, setMyContracts] = useState<any[]>([]);

  useEffect(() => {
    if (profile?.userId) {
      fetchInvestorData();
    }
  }, [profile]);

  const fetchInvestorData = async () => {
    try {
      setLoading(true);

      console.log('LIFF Profile userId:', profile?.userId);

      // Fetch investor profile
      const investorRes = await axios.get(`/api/investors/by-line-id/${profile?.userId}`);
      console.log('Investor response:', investorRes.data);
      setInvestor(investorRes.data.investor);

      // Fetch contracts for this investor
      const contractsRes = await axios.get(`/api/contracts/by-investor/${profile?.userId}`);
      console.log('Contracts response:', contractsRes.data);
      setMyContracts(contractsRes.data.contracts || []);

    } catch (error) {
      console.error('Error fetching investor data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return { text: 'กำลังดำเนินการ', color: 'bg-[#D1FAE5] text-[#065F46]' };
      case 'ACTIVE':
        return { text: 'ปกติ', color: 'bg-[#D1FAE5] text-[#065F46]' };
      case 'PENDING_SIGNATURE':
        return { text: 'รอลงนาม', color: 'bg-[#FEF3C7] text-[#92400E]' };
      case 'COMPLETED':
        return { text: 'เสร็จสิ้น', color: 'bg-[#DBEAFE] text-[#1E40AF]' };
      case 'DEFAULTED':
        return { text: 'เกินกำหนด', color: 'bg-[#FEE2E2] text-[#991B1B]' };
      default:
        return { text: status, color: 'bg-gray-100 text-gray-600' };
    }
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] font-sans px-4 py-6 flex flex-col relative pb-6">

      {/* Header */}
      <div className="mb-4">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h1 className="text-xl font-bold text-[#1E3A8A] leading-tight">
              พอร์ตการลงทุน
            </h1>
            <p className="text-gray-500 text-xs font-light mt-1">
              Investor: คุณ{investor?.firstname || profile?.displayName} {investor?.lastname || ''}
            </p>
          </div>
          <div className="text-gray-400 text-xs font-light mb-1">
            {myContracts.length} สัญญา
          </div>
        </div>
      </div>

      {/* List Content Area */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {myContracts.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>คุณยังไม่มีสัญญาการลงทุน</p>
            <button
              onClick={() => router.push('/investor-offers')}
              className="mt-4 text-[#1E3A8A] font-medium"
            >
              ดูข้อเสนอใหม่
            </button>
          </div>
        ) : (
          myContracts.map((contract) => {
            const badge = getStatusBadge(contract.contract_status);
            const daysRemaining = getDaysRemaining(contract.contract_end_date);
            const totalInterest = Number(contract.interest_amount) || 0;
            const platformFeeRate = typeof contract.platform_fee_rate === 'number'
              ? contract.platform_fee_rate
              : 0.5;
            const investorShare = Math.max(0, 1 - platformFeeRate);
            const investorInterest = Math.round(totalInterest * investorShare * 100) / 100;
            const investorRate = typeof contract.interest_rate === 'number'
              ? contract.interest_rate * investorShare * 100
              : 0;

            return (
              <div
                key={contract.contract_id}
                onClick={() => router.push(`/investor-dashboard/contract/${contract.contract_id}`)}
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer active:scale-[0.99] transition-transform"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#1E3A8A]"></div>
                    <h3 className="font-bold text-gray-800 text-base">
                      {contract.items?.brand} {contract.items?.model}
                    </h3>
                  </div>
                  <span className={`${badge.color} text-[10px] font-bold px-2.5 py-1 rounded-full`}>
                    {badge.text}
                  </span>
                </div>

                <div className="pl-4 border-l-2 border-gray-100 ml-1 my-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 text-xs">เงินต้น:</span>
                    <span className="font-bold text-gray-700">{contract.loan_principal_amount?.toLocaleString()} บาท</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 text-xs">ดอกเบี้ยรับ:</span>
                    <span className="font-bold text-[#1E3A8A]">
                      +{investorInterest.toLocaleString()} บาท ({investorRate.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex justify-between text-sm pt-1">
                    <span className="text-gray-400 text-[10px]">ครบกำหนด:</span>
                    <span className="text-gray-600 text-[10px]">
                      {new Date(contract.contract_end_date).toLocaleDateString('th-TH')}
                      {daysRemaining > 0 ? ` (อีก ${daysRemaining} วัน)` : daysRemaining === 0 ? ' (วันนี้)' : ` (เกิน ${Math.abs(daysRemaining)} วัน)`}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button className="flex-1 py-2 bg-[#E9EFF6] text-[#1E3A8A] rounded-lg text-xs font-bold flex items-center justify-center gap-1">
                    ดูสัญญา
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}

export default function InvestorDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <InvestorDashboardContent />
    </Suspense>
  );
}
