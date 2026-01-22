'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

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
  platform_fee_rate?: number;
  investor_rate?: number;
  items?: ContractItem;
};

const CATEGORY_CONFIG = [
  { key: 'mobile', label: 'Mobile', color: '#3B82F6' },
  { key: 'laptop', label: 'Laptop', color: '#EF4444' },
  { key: 'camera', label: 'Camera', color: '#F59E0B' },
  { key: 'accessory', label: 'Mobile Acc.', color: '#22C55E' },
];

const ENDED_STATUSES = ['COMPLETED', 'TERMINATED'];

const mapCategory = (itemType?: string) => {
  switch (itemType) {
    case 'โทรศัพท์มือถือ':
    case 'Apple':
      return 'mobile';
    case 'โน้ตบุค':
      return 'laptop';
    case 'กล้อง':
      return 'camera';
    case 'อุปกรณ์เสริมโทรศัพท์':
      return 'accessory';
    default:
      return 'mobile';
  }
};

const formatCurrency = (value: number) => value.toLocaleString('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const round2 = (value: number) => Math.round(value * 100) / 100;

export default function InvestmentDashboard() {
  const { profile, isLoading: liffLoading } = useLiff();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.userId) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/contracts/by-investor/${profile.userId}`);
        setContracts(response.data.contracts || []);
      } catch (fetchError: any) {
        console.error('Error fetching investment data:', fetchError);
        setError('ไม่สามารถโหลดข้อมูลได้');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.userId]);

  const analytics = useMemo(() => {
    const allCounts: Record<string, number> = {
      mobile: 0,
      laptop: 0,
      camera: 0,
      accessory: 0,
    };
    const currentCounts: Record<string, number> = {
      mobile: 0,
      laptop: 0,
      camera: 0,
      accessory: 0,
    };

    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    let currentValue = 0;
    let currentProfit = 0;
    let accumulatedProfit = 0;

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
        statusLabel = 'เกินกำหนด';
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
          const investorRate = typeof contract.investor_rate === 'number'
            ? contract.investor_rate
            : 0.015;
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
      const category = mapCategory(contract.items?.item_type);
      allCounts[category] += 1;

      const isEnded = ENDED_STATUSES.includes(contract.contract_status || '');
      if (!isEnded) {
        currentCounts[category] += 1;
        currentValue += Number(contract.loan_principal_amount) || 0;
      }

      const principal = Number(contract.loan_principal_amount) || 0;
      const investorRate = typeof contract.investor_rate === 'number'
        ? contract.investor_rate
        : 0.015;
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
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
        </div>
      </div>
    );
  }

  const totalAll = Object.values(analytics.allCounts).reduce((sum, value) => sum + value, 0);
  const totalCurrent = Object.values(analytics.currentCounts).reduce((sum, value) => sum + value, 0);

  return (
    <div className="min-h-screen bg-[#F5F7FA] font-sans px-4 py-6">
      <div className="max-w-sm mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-800">สินค้าทั้งหมด</h2>
            <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">All items</span>
          </div>
          <div className="flex gap-4 items-center">
            <div className="relative w-20 h-20">
              <div
                className="w-20 h-20 rounded-full"
                style={{ background: buildDonutGradient(analytics.allCounts) }}
              />
              <div className="absolute inset-2 rounded-full bg-white flex flex-col items-center justify-center text-xs text-gray-500">
                <span className="text-lg font-bold text-gray-700">{totalAll}</span>
                total
              </div>
            </div>
            <div className="flex-1 space-y-2 text-xs">
              {CATEGORY_CONFIG.map((category) => (
                <div key={category.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: category.color }}></span>
                    <span className="text-gray-600">{category.label}</span>
                  </div>
                  <span className="text-gray-700 font-medium">{analytics.allCounts[category.key]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-800">สินค้าที่ลงทุนปัจจุบัน</h2>
            <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Current items in portfolio</span>
          </div>
          <div className="flex gap-4 items-center">
            <div className="relative w-20 h-20">
              <div
                className="w-20 h-20 rounded-full"
                style={{ background: buildDonutGradient(analytics.currentCounts) }}
              />
              <div className="absolute inset-2 rounded-full bg-white flex flex-col items-center justify-center text-xs text-gray-500">
                <span className="text-lg font-bold text-gray-700">{totalCurrent}</span>
                total
              </div>
            </div>
            <div className="flex-1 space-y-2 text-xs">
              {CATEGORY_CONFIG.map((category) => (
                <div key={category.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: category.color }}></span>
                    <span className="text-gray-600">{category.label}</span>
                  </div>
                  <span className="text-gray-700 font-medium">{analytics.currentCounts[category.key]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-gray-800">มูลค่า</span>
            <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Value</span>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl bg-[#BFD1EA] px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-[#1E3A8A]">มูลค่ารวมปัจจุบัน</div>
                <div className="text-[10px] text-[#1E3A8A]/70">Current total value</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-[#1E3A8A]/70">THB</div>
                <div className="text-lg font-bold text-[#1E3A8A]">{formatCurrency(analytics.currentValue)}</div>
              </div>
            </div>
            <div className="rounded-xl bg-[#CDEECE] px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-[#207B2A]">กำไรรวมปัจจุบัน</div>
                <div className="text-[10px] text-[#207B2A]/70">Current total profit</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-[#207B2A]/70">THB</div>
                <div className="text-lg font-bold text-[#207B2A]">{formatCurrency(analytics.currentProfit)}</div>
              </div>
            </div>
            <div className="rounded-xl bg-[#E5E5E5] px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-gray-600">กำไรสะสม</div>
                <div className="text-[10px] text-gray-500">Accumulated profit</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">THB</div>
                <div className="text-lg font-bold text-gray-700">{formatCurrency(analytics.accumulatedProfit)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-gray-800">แจ้งเตือนสัญญา</span>
            <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Contract notification</span>
          </div>
          {analytics.notifications.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-6">ไม่มีสัญญาที่ใกล้ครบกำหนด</div>
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
                  <div key={contract.contract_id} className="border-b border-gray-100 pb-3 last:border-none last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-gray-800">{itemName}</div>
                        <div className="text-xs text-gray-500">มูลค่า: {formatCurrency(value)} บาท</div>
                        <div className="text-xs text-gray-500">รับครบกำหนด: {dueDate}</div>
                        <div className="text-xs text-gray-500">กำไรปัจจุบัน: {formatCurrency(unrealized)} บาท</div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${statusColor}`}>
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
  );
}
