'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { Wallet } from 'lucide-react';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';
import {
  getMockInvestorPortfolioContracts,
  getMockInvestorProfile,
  getMockPrincipalIncreaseRequestForContract,
  INVESTOR_PRINCIPAL_INCREASE_APPROVAL_STATUSES,
  isInvestorPreviewMode,
} from '@/lib/mock-investment';
import {
  formatInvestorContractRemainingDays,
  getInvestorContractDisplayStatus,
  getInvestorContractRemainingDays,
  getInvestorContractStatusMeta,
  type InvestorContractDisplayStatus,
} from '@/lib/investor-contract-status';

const resolveNetInvestorRate = (contract: {
  investor_rate?: number | null;
  interest_rate?: number | null;
  platform_fee_rate?: number | null;
}) => {
  if (typeof contract.investor_rate === 'number' && Number.isFinite(contract.investor_rate)) {
    return Math.max(contract.investor_rate, 0);
  }

  const grossRate = typeof contract.interest_rate === 'number'
    ? contract.interest_rate
    : 0;
  const feeRate = typeof contract.platform_fee_rate === 'number'
    ? contract.platform_fee_rate
    : 0.01;

  return Math.max(grossRate - feeRate, 0);
};

function InvestorDashboardContent() {
  const router = useRouter();
  const { profile, isLoading: liffLoading } = useLiff();

  const [loading, setLoading] = useState(true);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [investor, setInvestor] = useState<any>(null);
  const [myContracts, setMyContracts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (!profile?.userId) return;

    if (isInvestorPreviewMode()) {
      setPinVerified(true);
      setInvestor(getMockInvestorProfile());
      setMyContracts(getMockInvestorPortfolioContracts());
      setLoading(false);
      return;
    }

    const session = getPinSession('INVESTOR', profile.userId);
    if (session?.token) {
      setPinVerified(true);
      fetchInvestorData();
      return;
    }

    setPinVerified(false);
    setPinModalOpen(true);
    setLoading(false);
  }, [profile?.userId]);

  const fetchInvestorData = async () => {
    try {
      setLoading(true);

      if (isInvestorPreviewMode()) {
        setInvestor(getMockInvestorProfile());
        setMyContracts(getMockInvestorPortfolioContracts());
        return;
      }

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

  const getPrincipalIncreaseRequestForContract = (contract: any) => {
    if (isInvestorPreviewMode()) {
      return getMockPrincipalIncreaseRequestForContract(contract.contract_id);
    }

    return (
      contract.principalIncreaseRequest ||
      contract.principal_increase_request ||
      contract.pending_principal_increase_request ||
      null
    );
  };

  const getDashboardDisplayStatus = (contract: any) => {
    const requestStatus = getPrincipalIncreaseRequestForContract(contract)?.request_status;
    const hasPrincipalIncreaseApproval = INVESTOR_PRINCIPAL_INCREASE_APPROVAL_STATUSES.has(requestStatus);

    return getInvestorContractDisplayStatus(contract, hasPrincipalIncreaseApproval);
  };

  const getStatusGroup = (status: InvestorContractDisplayStatus) => {
    const meta = getInvestorContractStatusMeta(status);
    return { key: meta.groupKey, label: meta.label };
  };

  const statusTabs = [
    { key: 'all', label: 'ทั้งหมด', count: myContracts.length },
    ...Array.from(
      new Map(
        myContracts.map((contract) => {
          const group = getStatusGroup(getDashboardDisplayStatus(contract));
          const count = myContracts.filter((item) => getStatusGroup(getDashboardDisplayStatus(item)).key === group.key).length;
          return [group.key, { ...group, count }];
        })
      ).values()
    ),
  ];

  const filteredContracts = activeTab === 'all'
    ? myContracts
    : myContracts.filter((contract) => getStatusGroup(getDashboardDisplayStatus(contract)).key === activeTab);

  const renderContractCard = (contract: any) => {
    const principalIncreaseRequest = getPrincipalIncreaseRequestForContract(contract);
    const principalIncreaseRequestId = principalIncreaseRequest?.request_id || principalIncreaseRequest?.requestId || principalIncreaseRequest?.id;
    const displayStatus = getDashboardDisplayStatus(contract);
    const badge = getInvestorContractStatusMeta(displayStatus);
    const daysRemaining = getInvestorContractRemainingDays(contract, displayStatus);
    const daysRemainingLabel = formatInvestorContractRemainingDays(daysRemaining);
    const principal = Number(contract.loan_principal_amount || 0);
    const durationDays = Number(contract.contract_duration_days || 0);
    const investorRate = resolveNetInvestorRate(contract);
    const investorRatePercent = investorRate * 100;
    const investorInterest = Math.round(principal * investorRate * (durationDays / 30) * 100) / 100;

    return (
      <div
        key={contract.contract_id}
        onClick={() => router.push(
          principalIncreaseRequestId
            ? `/investor-dashboard/contract/${contract.contract_id}?requestId=${principalIncreaseRequestId}`
            : `/investor-dashboard/contract/${contract.contract_id}`
        )}
        className="hover-card cursor-pointer rounded-xl border border-s2-border bg-s2-soft p-4 shadow-soft transition-colors hover:bg-s2-soft/80"
      >
        <div className="mb-1 flex items-center justify-between gap-3 flex-nowrap">
          <h3 className="min-w-0 flex-1 truncate whitespace-nowrap text-md font-medium text-foreground">
            {contract.items?.brand} {contract.items?.model}
          </h3>
          <div className="shrink-0 rounded-full px-2 py-1 bg-background-white">
            <span className={`${badge.tone} whitespace-nowrap text-xs font-medium px-4 py-1.5 rounded-full`}>
              {badge.label}
            </span>
          </div>
        </div>

        <div className="mb-1 space-y-1">
          <div className="text-sm text-foreground-subtle">
            เงินต้น: <span className="text-foreground-muted">{principal.toLocaleString()} บาท</span>
          </div>
          <div className="text-sm text-foreground-subtle">
            ดอกเบี้ยรับ: <span className="text-s2">{investorInterest.toLocaleString()} บาท ({investorRatePercent.toFixed(2)}%)</span>
          </div>
          <div className="text-sm text-foreground-subtle">
            วันครบกำหนด:{' '}
            <span className="text-foreground-muted">
              {new Date(contract.contract_end_date).toLocaleDateString('th-TH')}
              {daysRemainingLabel ? ` (${daysRemainingLabel})` : ''}
            </span>
          </div>
        </div>

        <div className="mt-3 w-full rounded-full bg-s2/20 px-3 py-1 text-center text-xs font-light text-s2">
          {contract.contract_number || contract.contract_id}
        </div>
      </div>
    );
  };

  if (liffLoading || loading) {
    return (
      <div className="page-investor min-h-dvh w-full bg-background flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (!pinVerified) {
    return (
      <div className="theme-liff theme-investor min-h-dvh w-full bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white px-6 py-6 text-center shadow-soft">
            <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-s2">
              Secure Portfolio
            </div>
            <h2 className="mt-4 text-lg font-bold text-foreground">ยืนยัน PIN ก่อนเข้าดูรายการ</h2>
            <p className="mt-2 text-sm text-foreground-subtle">
              เพื่อความปลอดภัย กรุณายืนยัน PIN 6 หลักก่อนดูรายการสินเชื่อของคุณ
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
              fetchInvestorData();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="theme-liff theme-investor min-h-dvh w-full bg-background px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col">

        <div className="mb-5 rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
            <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-s2/70">
              Investor Portfolio
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-s2">
                  พอร์ตการลงทุน
                </div>
                <p className="mt-2 text-xs text-foreground-subtle">
                  Investor: คุณ{investor?.firstname || profile?.displayName} {investor?.lastname || ''}
                </p>
              </div>
              <div className="text-right text-sm font-light text-foreground-subtle">
                {myContracts.length} รายการ
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-3 pb-8 no-scrollbar">
          {myContracts.length === 0 ? (
            <div className="rounded-xl border border-s2-border bg-background p-8 text-center">
              <Wallet className="mx-auto mb-3 h-12 w-12 text-s2/45" />
              <p className="text-foreground-subtle">คุณยังไม่มีสัญญาการลงทุน</p>
              <button
                onClick={() => router.push('/investor-offers')}
                className="btn-transition mt-5 inline-flex min-h-12 items-center justify-center rounded-full border border-s2 bg-s2-soft px-5 py-3 text-sm font-medium text-s2"
              >
                ดูข้อเสนอใหม่
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto pb-1 no-scrollbar scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex gap-2 min-w-max">
                  {statusTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`btn-transition rounded-full border px-4 py-2 text-sm ${
                        activeTab === tab.key
                          ? 'border-s2 bg-s2 text-s2-fg'
                          : 'border-s2-border bg-background-white text-s2'
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="min-w-0 flex-1 truncate whitespace-nowrap text-lg font-medium text-foreground">
                    {activeTab === 'all'
                      ? 'สัญญาทั้งหมด'
                      : statusTabs.find((tab) => tab.key === activeTab)?.label || 'รายการสัญญา'}
                  </h2>
                  <div className="text-sm font-light text-foreground-subtle">
                    {filteredContracts.length} รายการ
                  </div>
                </div>
                {filteredContracts.length === 0 ? (
                  <div className="rounded-xl border border-s2-border bg-background p-8 text-center">
                    <p className="text-foreground-subtle">ไม่มีสัญญาในหมวดนี้</p>
                  </div>
                ) : (
                  filteredContracts.map(renderContractCard)
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InvestorDashboardPage() {
  return (
    <Suspense fallback={
      <div className="theme-liff theme-investor min-h-dvh w-full bg-background flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    }>
      <InvestorDashboardContent />
    </Suspense>
  );
}
