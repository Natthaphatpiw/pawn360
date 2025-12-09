'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { Search, Wallet, ChevronRight } from 'lucide-react';

function InvestorDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading } = useLiff();

  const [activeTab, setActiveTab] = useState<'market_offers' | 'my_contracts'>('my_contracts');
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState<any>(null);
  const [myContracts, setMyContracts] = useState<any[]>([]);
  const [marketOffers, setMarketOffers] = useState<any[]>([]);

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

      // Fetch market offers (pending contracts)
      const offersRes = await axios.get('/api/contracts/market-offers');
      setMarketOffers(offersRes.data.offers || []);

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
    <div className="min-h-screen bg-[#F5F7FA] font-sans px-4 py-6 flex flex-col relative pb-28">

      {/* Header & Tab Switcher */}
      <div className="mb-4">
        {/* Title */}
        <div className="flex justify-between items-end mb-4">
          <div>
            <h1 className="text-xl font-bold text-[#1E3A8A] leading-tight">
              {activeTab === 'my_contracts' ? 'พอร์ตการลงทุน' : 'ตลาดข้อเสนอ'}
            </h1>
            <p className="text-gray-500 text-xs font-light mt-1">
              Investor: คุณ{investor?.firstname || profile?.displayName} {investor?.lastname || ''}
            </p>
          </div>
          <div className="text-gray-400 text-xs font-light mb-1">
            {activeTab === 'my_contracts' ? `${myContracts.length} สัญญา` : `${marketOffers.length} ข้อเสนอ`}
          </div>
        </div>

        {/* Custom Tab Switcher */}
        <div className="bg-white p-1 rounded-2xl flex mb-2 shadow-sm border border-gray-100">
          <button
            onClick={() => setActiveTab('market_offers')}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
              activeTab === 'market_offers'
                ? 'bg-[#1E3A8A] text-white shadow-md'
                : 'text-gray-400 hover:text-[#1E3A8A] hover:bg-gray-50'
            }`}
          >
            ข้อเสนอใหม่
          </button>
          <button
            onClick={() => setActiveTab('my_contracts')}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
              activeTab === 'my_contracts'
                ? 'bg-[#1E3A8A] text-white shadow-md'
                : 'text-gray-400 hover:text-[#1E3A8A] hover:bg-gray-50'
            }`}
          >
            สัญญาของฉัน
          </button>
        </div>
      </div>

      {/* List Content Area */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">

        {/* VIEW 1: Market Offers (ข้อเสนอใหม่) */}
        {activeTab === 'market_offers' && (
          <>
            {marketOffers.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>ไม่มีข้อเสนอใหม่ในขณะนี้</p>
              </div>
            ) : (
              marketOffers.map((offer) => (
                <div
                  key={offer.contract_id}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 active:scale-[0.99] transition-transform"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#E9EFF6] flex items-center justify-center text-[#1E3A8A]">
                        <Search className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-800 text-base leading-tight">
                          {offer.items?.brand} {offer.items?.model}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                            {offer.items?.item_condition}%
                          </span>
                          <span className="text-[10px] text-gray-400">{offer.contract_duration_days} วัน</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[#1E3A8A] font-bold text-lg">{offer.loan_principal_amount?.toLocaleString()}</div>
                      <div className="text-[10px] text-gray-400">บาท</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2 bg-[#F8FAFC] p-3 rounded-xl">
                    <div>
                      <div className="text-[10px] text-gray-400">ดอกเบี้ย/เดือน</div>
                      <div className="text-sm font-bold text-gray-700">{(offer.interest_rate * 100).toFixed(1)}%</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400">ดอกเบี้ยที่ได้รับ</div>
                      <div className="text-sm font-bold text-[#1E3A8A]">{offer.interest_amount?.toLocaleString()} บาท</div>
                    </div>
                  </div>

                  <button
                    onClick={() => router.push(`/offer-detail?contractId=${offer.contract_id}`)}
                    className="w-full mt-3 py-2 rounded-lg border border-[#1E3A8A] text-[#1E3A8A] text-sm font-bold hover:bg-[#1E3A8A] hover:text-white transition-colors"
                  >
                    ดูรายละเอียด
                  </button>
                </div>
              ))
            )}
          </>
        )}

        {/* VIEW 2: My Contracts (สัญญาของฉัน) */}
        {activeTab === 'my_contracts' && (
          <>
            {myContracts.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>คุณยังไม่มีสัญญาการลงทุน</p>
                <button
                  onClick={() => setActiveTab('market_offers')}
                  className="mt-4 text-[#1E3A8A] font-medium"
                >
                  ดูข้อเสนอใหม่ &rarr;
                </button>
              </div>
            ) : (
              myContracts.map((contract) => {
                const badge = getStatusBadge(contract.contract_status);
                const daysRemaining = getDaysRemaining(contract.contract_end_date);

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
                        <span className="font-bold text-[#1E3A8A]">+{contract.interest_amount?.toLocaleString()} บาท</span>
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
          </>
        )}

      </div>

      {/* Bottom Navigation (Fixed) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 pb-8">
        <div className="flex gap-3 max-w-md mx-auto">
          {/* Explore Button */}
          <button
            onClick={() => setActiveTab('market_offers')}
            className={`flex-1 py-3 rounded-2xl flex flex-col items-center justify-center transition-all ${
              activeTab === 'market_offers'
                ? 'bg-[#E9EFF6] text-[#1E3A8A]'
                : 'bg-white text-gray-400 hover:bg-gray-50'
            }`}
          >
            <Search className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-bold">ค้นหาข้อเสนอ</span>
          </button>

          {/* Portfolio Button */}
          <button
            onClick={() => setActiveTab('my_contracts')}
            className={`flex-1 py-3 rounded-2xl flex flex-col items-center justify-center transition-all ${
              activeTab === 'my_contracts'
                ? 'bg-[#E9EFF6] text-[#1E3A8A]'
                : 'bg-white text-gray-400 hover:bg-gray-50'
            }`}
          >
            <Wallet className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-bold">พอร์ตของฉัน</span>
          </button>
        </div>
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
