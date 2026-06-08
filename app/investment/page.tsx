'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';
import { getMockInvestorContracts, isInvestorPreviewMode } from '@/lib/mock-investment';

type ContractItem = {
  item_type?: string;
  brand?: string;
  model?: string;
};

type Contract = {
  contract_id: string;
  contract_number?: string;
  contract_status?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  completed_at?: string;
  contract_duration_days?: number;
  loan_principal_amount?: number;
  interest_amount?: number;
  interest_rate?: number;
  platform_fee_rate?: number;
  investor_rate?: number;
  items?: ContractItem;
};

const CATEGORY_CONFIG = [
  { key: 'mobile', label: 'Mobile', color: '#3B82F6' },
  { key: 'tablet', label: 'Tablet', color: '#6366F1' },
  { key: 'laptop', label: 'Laptop', color: '#EF4444' },
  { key: 'camera', label: 'Camera', color: '#F59E0B' },
  { key: 'accessory', label: 'Mobile Acc.', color: '#22C55E' },
  { key: 'hardware', label: 'Hardware', color: '#14B8A6' },
  { key: 'other', label: 'Other', color: '#6B7280' },
];

const ENDED_STATUSES = ['COMPLETED', 'TERMINATED'];

const mapCategory = (item?: ContractItem) => {
  const normalized = [
    item?.item_type,
    item?.brand,
    item?.model,
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return 'other';
  }

  if (normalized.includes('ipad') || normalized.includes('tablet') || normalized.includes('แท็บเล็ต')) {
    return 'tablet';
  }
  if (normalized.includes('iphone') || normalized.includes('โทรศัพท์มือถือ') || normalized.includes('mobile') || normalized.includes('phone') || normalized.includes('smartphone')) {
    return 'mobile';
  }
  if (normalized.includes('macbook') || normalized.includes('โน้ตบุค') || normalized.includes('laptop') || normalized.includes('notebook')) {
    return 'laptop';
  }
  if (normalized.includes('กล้อง') || normalized.includes('camera')) {
    return 'camera';
  }
  if (normalized.includes('อุปกรณ์เสริมโทรศัพท์') || normalized.includes('accessory')) {
    return 'accessory';
  }
  if (normalized.includes('อุปกรณ์คอมพิวเตอร์') || normalized.includes('computer hardware') || normalized.includes('hardware')) {
    return 'hardware';
  }

  return 'other';
};

const formatCurrency = (value: number) => value.toLocaleString('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const round2 = (value: number) => Math.round(value * 100) / 100;

const resolveNetInvestorRate = (contract: Contract) => {
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

export default function InvestmentDashboard() {
  const { profile, isLoading: liffLoading } = useLiff();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);

  useEffect(() => {
    if (!profile?.userId) return;
    if (isInvestorPreviewMode()) {
      setPinVerified(true);
      setContracts(getMockInvestorContracts());
      setLoading(false);
      return;
    }
    const session = getPinSession('INVESTOR', profile.userId);
    if (session?.token) {
      setPinVerified(true);
      fetchData();
    } else {
      setPinVerified(false);
      setPinModalOpen(true);
      setLoading(false);
    }
  }, [profile?.userId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (isInvestorPreviewMode()) {
        setContracts(getMockInvestorContracts());
        setError(null);
        return;
      }
      const response = await axios.get(`/api/contracts/by-investor/${profile?.userId}`);
      setContracts(response.data.contracts || []);
    } catch (fetchError: any) {
      console.error('Error fetching investment data:', fetchError);
      setError('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const analytics = useMemo(() => {
    const allCounts: Record<string, number> = {
      mobile: 0,
      tablet: 0,
      laptop: 0,
      camera: 0,
      accessory: 0,
      hardware: 0,
      other: 0,
    };
    const currentCounts: Record<string, number> = {
      mobile: 0,
      tablet: 0,
      laptop: 0,
      camera: 0,
      accessory: 0,
      hardware: 0,
      other: 0,
    };

    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    let currentValue = 0;
    let currentProfit = 0;
    let accumulatedProfit = 0;
    let cumulativeValue = 0;

    const getTiming = (contract: Contract, referenceDate: Date) => {
      if (!contract.contract_start_date) {
        return { daysInContract: 0, daysElapsed: 0 };
      }

      const startDate = new Date(contract.contract_start_date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = contract.contract_end_date ? new Date(contract.contract_end_date) : null;
      endDate?.setHours(0, 0, 0, 0);
      const ref = new Date(referenceDate);
      ref.setHours(0, 0, 0, 0);

      const rawDaysInContract = Number(contract.contract_duration_days || 0)
        || (endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay) : 0);
      const daysInContract = Math.max(1, rawDaysInContract);
      const rawDaysElapsed = Math.floor((ref.getTime() - startDate.getTime()) / msPerDay) + 1;
      const daysElapsed = Math.min(daysInContract, Math.max(1, rawDaysElapsed));

      return { daysInContract, daysElapsed };
    };

    const notifications = contracts.map((contract) => {
      const endDate = contract.contract_end_date ? new Date(contract.contract_end_date) : null;
      const startDate = contract.contract_start_date ? new Date(contract.contract_start_date) : null;

      const daysRemaining = endDate
        ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      let statusLabel = '';
      let statusColor = '';
      if (daysRemaining < 0) {
        statusLabel = 'เลยกำหนด';
        statusColor = 'bg-[#FCE7E7] text-[#E06666]';
      } else if (daysRemaining === 0) {
        statusLabel = 'ครบกำหนด';
        statusColor = 'bg-[#FDE9D9] text-[#D97706]';
      } else if (daysRemaining <= 3) {
        statusLabel = 'ใกล้ครบกำหนด';
        statusColor = 'bg-[#FFF3E0] text-[#F59E0B]';
      }

      let unrealized = 0;
      if (startDate) {
        const { daysInContract, daysElapsed } = getTiming(contract, now);
        if (daysInContract > 0) {
          const principal = Number(contract.loan_principal_amount) || 0;
          const investorRate = resolveNetInvestorRate(contract);
          unrealized = round2(principal * investorRate * (daysElapsed / 30));
        }
      }

      return {
        contract,
        daysRemaining,
        statusLabel,
        statusColor,
        unrealized,
      };
    });

    contracts.forEach((contract) => {
      const category = mapCategory(contract.items);
      allCounts[category] += 1;

      const isEnded = ENDED_STATUSES.includes(contract.contract_status || '');
      if (!isEnded) {
        currentCounts[category] += 1;
        currentValue += Number(contract.loan_principal_amount) || 0;
      }

      const principal = Number(contract.loan_principal_amount) || 0;
      cumulativeValue += principal;
      const investorRate = resolveNetInvestorRate(contract);
      const referenceDate = isEnded && contract.completed_at
        ? new Date(contract.completed_at)
        : now;
      const { daysElapsed } = getTiming(contract, referenceDate);
      const investorInterest = round2(principal * investorRate * (daysElapsed / 30));
      if (isEnded) {
        accumulatedProfit += investorInterest;
      } else {
        currentProfit += investorInterest;
      }
    });

    return {
      allCounts,
      currentCounts,
      currentValue,
      currentProfit,
      accumulatedProfit,
      cumulativeValue,
      notifications: notifications.filter(item => item.statusLabel),
    };
  }, [contracts]);

  const buildDonutGradient = (counts: Record<string, number>) => {
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    if (total === 0) {
      return 'conic-gradient(#E5E7EB 0 100%)';
    }
    let cursor = 0;
    const segments = CATEGORY_CONFIG.map((category) => {
      const value = counts[category.key] || 0;
      const start = cursor;
      const slice = (value / total) * 100;
      const end = start + slice;
      cursor = end;
      return `${category.color} ${start}% ${end}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  };

  if (liffLoading || loading) {
    return (
      <div className="page-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background px-4 py-6">
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <div className="w-full max-w-sm rounded-xl border border-s2-border bg-s2-soft px-6 py-8 text-center shadow-soft">
            <p className="text-error mb-4">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!pinVerified) {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background-white flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white px-6 py-6 text-center shadow-soft">
            <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-s2">
              Secure Dashboard
            </div>
            <h2 className="mt-4 text-lg font-bold text-foreground">ยืนยัน PIN ก่อนเข้าดูรายการ</h2>
            <p className="mt-2 text-sm text-foreground-subtle">
              เพื่อความปลอดภัย กรุณายืนยัน PIN 6 หลักก่อนดูรายการขอสินเชื่อของคุณ
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
              fetchData();
            }}
          />
        )}
      </div>
    );
  }

  const totalAll = Object.values(analytics.allCounts).reduce((sum, value) => sum + value, 0);
  const totalCurrent = Object.values(analytics.currentCounts).reduce((sum, value) => sum + value, 0);

  return (
    <div className="theme-liff theme-investor min-h-screen bg-background-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col space-y-4 mb-12">
        <div className="rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
            <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-s2/70">
              Investment Dashboard
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-s2">
                  สรุปการลงทุน
                </div>
                <p className="mt-2 text-xs text-foreground-subtle">
                  ภาพรวมพอร์ตและกำไรของสัญญาลงทุน
                </p>
              </div>
              <div className="text-right text-sm font-light text-foreground-subtle">
                {contracts.length} รายการ
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-background-white p-4 border border-s2-border">
          <div className="rounded-lg border border-background-white">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-s2/70">สินค้าทั้งหมด</h2>
              <span className="rounded-full bg-s2-soft px-2 py-1 text-[10px] font-medium text-s2">All items</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-24 shrink-0">
                <div
                  className="h-24 w-24 rounded-full"
                  style={{ background: buildDonutGradient(analytics.allCounts) }}
                />
                <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-background-white text-[10px] text-foreground-subtle">
                  <span className="text-xl font-bold text-foreground">{totalAll}</span>
                  total
                </div>
              </div>
              <div className="flex-1 space-y-2 text-xs">
                {CATEGORY_CONFIG.map((category) => (
                  <div key={category.key} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: category.color }}></span>
                      <span className="text-foreground-subtle">{category.label}</span>
                    </div>
                    <span className="font-medium text-foreground">{analytics.allCounts[category.key]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-background-white p-4 border border-s2-border">
          <div className="rounded-lg border border-background-white">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-s2/70">สินค้าที่ลงทุนปัจจุบัน</h2>
              <span className="rounded-full bg-s2-soft px-2 py-1 text-[10px] font-medium text-s2">Current</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-24 shrink-0">
                <div
                  className="h-24 w-24 rounded-full"
                  style={{ background: buildDonutGradient(analytics.currentCounts) }}
                />
                <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-background-white text-[10px] text-foreground-subtle">
                  <span className="text-xl font-bold text-foreground">{totalCurrent}</span>
                  total
                </div>
              </div>
              <div className="flex-1 space-y-2 text-xs">
                {CATEGORY_CONFIG.map((category) => (
                  <div key={category.key} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: category.color }}></span>
                      <span className="text-foreground-subtle">{category.label}</span>
                    </div>
                    <span className="font-medium text-foreground">{analytics.currentCounts[category.key]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-background-white p-4 border border-s2-border">
          <div className="rounded-lg border border-background-white">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-s2/70">มูลค่า</h2>
              <span className="rounded-full bg-s2-soft px-2 py-1 text-[10px] font-medium text-s2">Value</span>
            </div>
            <div className="space-y-3">
              <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-purple-800">ยอดรวมสะสมทั้งหมด</div>
                    <div className="text-xs text-purple-700/70">Cumulative contract value</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-purple-700/70">THB</div>
                    <div className="text-lg font-bold text-purple-800">{formatCurrency(analytics.cumulativeValue)}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-s2-border bg-s2-soft px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-s2">มูลค่ารวมปัจจุบัน</div>
                    <div className="text-xs text-s2/70">Current total value</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-s2/70">THB</div>
                    <div className="text-lg font-bold text-s2">{formatCurrency(analytics.currentValue)}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-success">กำไรรวมปัจจุบัน</div>
                    <div className="text-xs text-success/70">Current total profit</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-success/70">THB</div>
                    <div className="text-lg font-bold text-success">{formatCurrency(analytics.currentProfit)}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-line-soft bg-background px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-foreground-muted">กำไรสะสม</div>
                    <div className="text-xs text-foreground-subtle">Accumulated profit</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-foreground-subtle">THB</div>
                    <div className="text-lg font-bold text-foreground">{formatCurrency(analytics.accumulatedProfit)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-background-white p-4 border border-s2-border">
          <div className="rounded-lg border border-background-white">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-s2/70">แจ้งเตือนสัญญา</h2>
              <span className="rounded-full bg-s2-soft px-2 py-1 text-[10px] font-medium text-s2">Notification</span>
            </div>
            {analytics.notifications.length === 0 ? (
              <div className="rounded-lg border border-s2-border bg-s2-soft px-4 py-6 text-center text-sm text-foreground-subtle">
                ไม่มีสัญญาที่ใกล้ครบกำหนด
              </div>
            ) : (
              <div className="space-y-3">
                {analytics.notifications.map(({ contract, statusLabel, statusColor, unrealized }) => {
                  const itemName = contract.items?.brand && contract.items?.model
                    ? `${contract.items.brand} ${contract.items.model}`
                    : 'ไม่ระบุสินค้า';
                  const dueDate = contract.contract_end_date
                    ? new Date(contract.contract_end_date).toLocaleDateString('th-TH')
                    : '-';
                  const value = Number(contract.loan_principal_amount) || 0;
                  return (
                    <div key={contract.contract_id} className="rounded-lg border border-s2-border bg-s2-soft/45 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{itemName}</div>
                          <div className="mt-1 text-xs text-foreground-subtle">มูลค่า: {formatCurrency(value)} บาท</div>
                          <div className="text-xs text-foreground-subtle">ครบกำหนด: {dueDate}</div>
                          <div className="text-xs text-foreground-subtle">กำไรปัจจุบัน: {formatCurrency(unrealized)} บาท</div>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
