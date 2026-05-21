'use client';

import { useState, useEffect, Suspense } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { Search, SearchX } from 'lucide-react';
import { openLiffEntry } from '@/lib/liff/navigation';
import { getMockInvestorContracts, getMockInvestorProfile, isInvestorPreviewMode } from '@/lib/mock-investment';

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

  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState<any>(null);
  const [marketOffers, setMarketOffers] = useState<any[]>([]);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatItemName = (item?: { brand?: string | null; model?: string | null }) =>
    [item?.brand, item?.model].filter(Boolean).join(' ').trim() || 'รายการขอสินเชื่อ';

  useEffect(() => {
    if (profile?.userId) {
      fetchData();
    }
  }, [profile?.userId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isInvestorPreviewMode()) {
        setInvestor(getMockInvestorProfile());
        setKycStatus('VERIFIED');
        setMarketOffers(
          getMockInvestorContracts().filter((contract) =>
            ['PENDING', 'PENDING_SIGNATURE'].includes(String(contract.contract_status || ''))
          )
        );
        return;
      }

      const investorRes = await axios.get(`/api/investors/by-line-id/${profile?.userId}`);
      setInvestor(investorRes.data.investor);
      setKycStatus(investorRes.data.investor?.kyc_status || null);

      const offersRes = await axios.get('/api/contracts/market-offers');
      setMarketOffers(offersRes.data.offers || []);
    } catch (fetchError) {
      console.error('Error fetching data:', fetchError);
      setError('ไม่สามารถโหลดข้อเสนอใหม่ได้');
    } finally {
      setLoading(false);
    }
  };

  if (liffLoading || loading) {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  const visibleOffers = marketOffers.filter((offer) => (
    !offer?.investor_id
    && offer?.funding_status === 'PENDING'
    && ['PENDING', 'PENDING_SIGNATURE'].includes(String(offer?.contract_status || ''))
  ));

  return (
    <div className="theme-liff theme-investor min-h-screen bg-background-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <div className="mb-5 rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
            <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-s2/70">
              Market Offers
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-s2">
                  ข้อเสนอใหม่
                </div>
                <p className="mt-2 text-xs text-foreground-subtle">
                  Offers available for investment
                </p>
              </div>
              <div className="text-right text-sm font-light text-foreground-subtle">
                {visibleOffers.length} รายการ
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-3 pb-8">
          {error ? (
            <div className="rounded-xl border border-s2-border bg-s2-soft px-6 py-8 text-center shadow-soft">
              <div className="text-error">{error}</div>
            </div>
          ) : visibleOffers.length === 0 ? (
            <div className="rounded-xl border border-s2-border bg-background p-8 text-center">
              <SearchX className="mx-auto mb-3 h-12 w-12 text-s2-border" />
              <p className="text-foreground-subtle">ไม่มีข้อเสนอใหม่ในขณะนี้</p>
            </div>
          ) : (
            visibleOffers.map((offer) => {
              const principal = Number(offer.loan_principal_amount || 0);
              const durationDays = Number(offer.contract_duration_days || 0);
              const currentTotal = Number(investor?.total_active_principal || 0);
              const projectedTotal = currentTotal + principal;
              const projectedTier = resolveInvestorTier(projectedTotal);
              const investorRate = INVESTOR_TIER_RATES[projectedTier];
              const investorRatePercent = investorRate * 100;
              const investorInterestAmount = Math.round(principal * investorRate * (durationDays / 30) * 100) / 100;

              const handleViewOffer = () => {
                if (isInvestorPreviewMode()) {
                  if (typeof window !== 'undefined') {
                    window.location.assign(`/offer-detail?contractId=${offer.contract_id}`);
                  }
                  return;
                }
                if (kycStatus !== 'VERIFIED') {
                  redirectToInvestorVerification();
                  return;
                }
                openLiffEntry({
                  liffIdCandidates: [
                    process.env.NEXT_PUBLIC_LIFF_ID_INVEST_OFFER_DETAIL,
                  ],
                  fallbackPath: `/offer-detail?contractId=${offer.contract_id}`,
                  statePath: `/offer-detail?contractId=${offer.contract_id}`,
                });
              };

              return (
                <div
                  key={offer.contract_id}
                  className="hover-card rounded-xl border border-s2-border bg-s2-soft p-4 shadow-soft transition-colors hover:bg-s2-soft/80"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background-white text-s2 shadow-soft">
                        <Search className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-medium text-foreground">
                          {formatItemName(offer.items)}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-background-white px-2 py-1 text-[10px] font-medium text-s2">
                            สภาพ {offer.items?.item_condition || 0}%
                          </span>
                          <span className="text-[10px] text-foreground-subtle">
                            {offer.contract_duration_days} วัน
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-bold text-s2">
                        {principal.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-foreground-subtle">บาท</div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-s2-border bg-background-white p-4 shadow-soft">
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-foreground-subtle">ดอกเบี้ย/เดือน</span>
                      <span className="font-medium text-foreground">
                        {investorRatePercent.toFixed(2)}%
                      </span>
                    </div>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-foreground-subtle">ดอกเบี้ยที่ได้รับ</span>
                      <span className="font-medium text-s2">
                        {investorInterestAmount.toLocaleString()} บาท
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-foreground-subtle">ระดับหลังลงทุน</span>
                      <span className="font-medium text-foreground">
                        {projectedTier}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleViewOffer}
                    className="btn-transition mt-3 w-full rounded-full border border-s2 bg-background-white py-3 text-sm font-medium text-s2"
                  >
                    ดูรายละเอียด
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function InvestorOffersPage() {
  return (
    <Suspense fallback={
      <div className="theme-liff theme-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    }>
      <InvestorOffersContent />
    </Suspense>
  );
}
