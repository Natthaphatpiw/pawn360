'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { Search, ArrowLeft } from 'lucide-react';

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

function InvestorOffersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading } = useLiff();

  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState<any>(null);
  const [marketOffers, setMarketOffers] = useState<any[]>([]);
  const [kycStatus, setKycStatus] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.userId) {
      fetchData();
    }
  }, [profile]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch investor profile
      const investorRes = await axios.get(`/api/investors/by-line-id/${profile?.userId}`);
      setInvestor(investorRes.data.investor);
      setKycStatus(investorRes.data.investor?.kyc_status || null);

      // Fetch market offers (pending contracts)
      const offersRes = await axios.get('/api/contracts/market-offers');
      setMarketOffers(offersRes.data.offers || []);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
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
    <div className="min-h-screen bg-[#F5F7FA] font-sans px-4 py-6 flex flex-col pb-8">

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.push('/investor-dashboard')}
            className="p-2 -ml-2 text-[#1E3A8A] hover:bg-[#E9EFF6] rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-gray-400 text-xs font-light">
            {marketOffers.length} ข้อเสนอ
          </div>
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1E3A8A] leading-tight">
            ข้อเสนอใหม่
          </h1>
          <p className="text-gray-500 text-xs font-light mt-1">
            New Pawn Offers
          </p>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {marketOffers.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>ไม่มีข้อเสนอใหม่ในขณะนี้</p>
          </div>
        ) : (
          marketOffers.map((offer) => {
            const principal = Number(offer.loan_principal_amount || 0);
            const durationDays = Number(offer.contract_duration_days || 0);
            const currentTotal = Number(investor?.total_active_principal || 0);
            const projectedTotal = currentTotal + principal;
            const projectedTier = resolveInvestorTier(projectedTotal);
            const investorRate = INVESTOR_TIER_RATES[projectedTier];
            const investorRatePercent = investorRate * 100;
            const investorInterestAmount = Math.round(principal * investorRate * (durationDays / 30) * 100) / 100;

            const handleViewOffer = () => {
              if (kycStatus !== 'VERIFIED') {
                router.push('/ekyc-invest');
                return;
              }
              router.push(`/offer-detail?contractId=${offer.contract_id}`);
            };

            return (
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
                    <div className="text-sm font-bold text-gray-700">{investorRatePercent.toFixed(2)}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-gray-400">ดอกเบี้ยที่ได้รับ</div>
                    <div className="text-sm font-bold text-[#1E3A8A]">{investorInterestAmount.toLocaleString()} บาท</div>
                  </div>
                </div>

                <button
                  onClick={handleViewOffer}
                  className="w-full mt-3 py-2 rounded-lg border border-[#1E3A8A] text-[#1E3A8A] text-sm font-bold hover:bg-[#1E3A8A] hover:text-white transition-colors"
                >
                  ดูรายละเอียด
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function InvestorOffersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <InvestorOffersContent />
    </Suspense>
  );
}
