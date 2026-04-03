'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { ChevronDown, X } from 'lucide-react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';
import { loadMockInvestor } from '@/lib/mock-investor';

// ─────────────────────────────────────────────────────────────────────────────
// เปิดใช้ด้วย NEXT_PUBLIC_LIFF_MOCK=true ใน .env.local
// Mock investor data persist across pages in mock mode
// ─────────────────────────────────────────────────────────────────────────────

interface InvestorData {
  investor_id: string;
  line_id: string;
  firstname: string;
  lastname: string;
  kyc_status: string;
  referral_code?: string | null;
  max_investment_amount?: number | null;
  investor_tier?: string | null;
  total_active_principal?: number | null;
  auto_invest_enabled?: boolean | null;
  auto_liquidation_enabled?: boolean | null;
  investment_preferences?: any;
  stats: {
    totalContracts: number;
    activeContracts: number;
    endedContracts: number;
    totalInvestedAmount: number;
    currentInvestedAmount?: number;
  };
}

interface RegisterFormData {
  firstname: string;
  lastname: string;
  phoneNumber: string;
  nationalId: string;
  referralCode: string;
  address: {
    houseNo: string;
    village: string;
    street: string;
    subDistrict: string;
    district: string;
    province: string;
    country: string;
    postcode: string;
  };
  bankInfo: {
    bankName: string;
    accountNo: string;
    accountType: string;
    accountName: string;
  };
}

type RegistrationPreferenceState = Record<string, { enabled: boolean; limitAmount: string }>;

const TIER_IMAGES: Record<string, string> = {
  SILVER: '/tier-image/silver-pawnlytier.png',
  GOLD: '/tier-image/gold-pawnlytier.png',
  PLATINUM: '/tier-image/plattinam-pawnlytier.png',
};

const TIER_LABELS: Record<string, string> = {
  SILVER: 'Silver',
  GOLD: 'Gold',
  PLATINUM: 'Platinum',
};

const TIER_MONTHLY_RATES: Record<string, number> = {
  SILVER: 0.015,
  GOLD: 0.0153,
  PLATINUM: 0.016,
};

const TIER_THRESHOLDS = {
  GOLD: 400000,
  PLATINUM: 1000000,
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  'โทรศัพท์มือถือ': 'Mobile',
  'อุปกรณ์เสริมโทรศัพท์': 'Mobile acc.',
  'กล้อง': 'Camera',
  'Apple': 'Apple',
  'โน้ตบุค': 'Laptop',
};

const CREDIT_LIMIT_COLORS: Record<string, string> = {
  Apple: '#0B3C8C',
  'โทรศัพท์มือถือ': '#1F5FBF',
  'โน้ตบุค': '#3E7FE0',
  'กล้อง': '#6AA5F5',
  'อุปกรณ์เสริมโทรศัพท์': '#9CC8FF',
};

const CREDIT_LIMIT_CATEGORIES = [
  'Apple',
  'โทรศัพท์มือถือ',
  'โน้ตบุค',
  'กล้อง',
  'อุปกรณ์เสริมโทรศัพท์',
];

const REGISTER_CATEGORY_OPTIONS = [
  { key: 'Apple', labelTh: 'สินค้า Apple', labelEn: 'Apple products' },
  { key: 'โทรศัพท์มือถือ', labelTh: 'โทรศัพท์มือถือ', labelEn: 'Mobile' },
  { key: 'โน้ตบุค', labelTh: 'คอมพิวเตอร์โน้ตบุ๊ค', labelEn: 'Laptop' },
  { key: 'กล้อง', labelTh: 'กล้องถ่ายรูป', labelEn: 'Camera' },
  { key: 'อุปกรณ์เสริมโทรศัพท์', labelTh: 'อุปกรณ์เสริมโทรศัพท์', labelEn: 'Accessories' },
] as const;

const buildRegistrationPreferenceState = () => {
  const base: RegistrationPreferenceState = {};
  REGISTER_CATEGORY_OPTIONS.forEach((category) => {
    base[category.key] = { enabled: false, limitAmount: '' };
  });
  return base;
};

const formatAmount = (value: string | number) => {
  const digits = String(value).replace(/[^0-9]/g, '');
  return digits.length ? Number(digits).toLocaleString('en-US') : '';
};

const parseAmountInput = (value: string) => {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits.length ? Number(digits) : 0;
};

function buildCategoryLimitPayload(
  preferenceState: RegistrationPreferenceState,
  totalLimitInput: string,
  divideEqually: boolean,
) {
  const totalLimit = Math.min(parseAmountInput(totalLimitInput), MAX_CREDIT_LIMIT);
  const selectedKeys = Object.keys(preferenceState).filter((key) => preferenceState[key]?.enabled);
  if (selectedKeys.length === 0) {
    return {
      totalLimit,
      categoryTotal: 0,
      categories: {},
    };
  }

  let computedAmounts: Record<string, number> = {};

  if (divideEqually) {
    const baseAmount = selectedKeys.length > 0 ? Math.floor(totalLimit / selectedKeys.length) : 0;
    let remaining = totalLimit;
    selectedKeys.forEach((key, index) => {
      const amount = index === selectedKeys.length - 1 ? remaining : baseAmount;
      computedAmounts[key] = Math.max(0, amount);
      remaining -= amount;
    });
  } else {
    const explicitAmounts: Record<string, number> = {};
    selectedKeys.forEach((key) => {
      explicitAmounts[key] = Math.min(parseAmountInput(preferenceState[key]?.limitAmount || ''), MAX_CREDIT_LIMIT);
    });

    const explicitTotal = selectedKeys.reduce((sum, key) => sum + explicitAmounts[key], 0);
    const missingKeys = selectedKeys.filter((key) => explicitAmounts[key] <= 0);
    const remaining = Math.max(0, totalLimit - selectedKeys.reduce((sum, key) => sum + (missingKeys.includes(key) ? 0 : explicitAmounts[key]), 0));

    computedAmounts = { ...explicitAmounts };
    if (missingKeys.length > 0) {
      const evenAmount = missingKeys.length > 1 ? Math.floor(remaining / missingKeys.length) : remaining;
      missingKeys.forEach((key, index) => {
        computedAmounts[key] = missingKeys.length <= 1
          ? remaining
          : index === missingKeys.length - 1
          ? Math.max(0, remaining - evenAmount * index)
          : evenAmount;
      });
    }

    if (explicitTotal > totalLimit && totalLimit > 0) {
      return {
        totalLimit,
        categoryTotal: explicitTotal,
        categories: null,
      };
    }
  }

  const categories = selectedKeys.reduce((result, key) => {
    result[key] = {
      enabled: true,
      sub: [],
      limitAmount: computedAmounts[key] || 0,
    };
    return result;
  }, {} as Record<string, { enabled: boolean; sub: string[]; limitAmount: number }>);

  return {
    totalLimit,
    categoryTotal: Object.values(computedAmounts).reduce((sum, amount) => sum + amount, 0),
    categories,
  };
}

type ReferralClassification = {
  code: string;
  source: 'JUZMATCH' | 'FRIEND' | 'UNKNOWN';
  year: number | null;
  isValid: boolean;
};

function classifyReferralCode(value: string | null | undefined): ReferralClassification {
  const code = String(value || '').trim().toUpperCase();
  const match = code.match(/^([A-Z]{2})(\d{2})([A-Z0-9]{4})$/);

  if (!match) {
    return { code, source: 'UNKNOWN', year: null, isValid: false };
  }

  const [, prefix, yearPart] = match;
  const source = prefix === 'JM' ? 'JUZMATCH' : prefix === 'FR' ? 'FRIEND' : 'UNKNOWN';

  return {
    code,
    source,
    year: Number(`20${yearPart}`),
    isValid: source !== 'UNKNOWN',
  };
}

export default function InvestorRegister() {
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [investorData, setInvestorData] = useState<InvestorData | null>(null);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [creditLimitsOpen, setCreditLimitsOpen] = useState(false);
  const [formData, setFormData] = useState<RegisterFormData>({
    firstname: '',
    lastname: '',
    phoneNumber: '',
    nationalId: '',
    referralCode: '',
    address: { houseNo: '', village: '', street: '', subDistrict: '', district: '', province: '', country: 'Thailand', postcode: '' },
    bankInfo: { bankName: '', accountNo: '', accountType: '', accountName: '' },
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (liffLoading) return;

    if (liffError) {
      setError('ไม่สามารถเชื่อมต่อ LINE LIFF ได้ กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
      return;
    }

    if (!profile?.userId) {
      setError('ไม่พบ LINE profile กรุณาเปิดลิงก์ผ่าน LINE LIFF');
      setLoading(false);
      return;
    }

    const checkUser = async () => {
      // ── Mock mode ────────────────────────────────────────────────────────────
      if (process.env.NEXT_PUBLIC_LIFF_MOCK === 'true') {
        console.info('[Mock] Using mock investor data for UI preview');
        setInvestorData(loadMockInvestor());
        setPinVerified(true); // ข้าม PIN modal ไปเลยตอน mock
        setLoading(false);
        return;
      }

      // ── Real API ─────────────────────────────────────────────────────────────
      try {
        const response = await axios.get(`/api/investors/check?lineId=${profile.userId}`);
        if (response.data.exists) {
          const investor = response.data.investor;
          setInvestorData(investor);
          const session = getPinSession('INVESTOR', profile.userId);
          if (session?.token) {
            setPinVerified(true);
          } else {
            setPinVerified(false);
            setPinModalOpen(true);
          }
        }
      } catch (error: any) {
        console.error('Error checking investor:', error);
        setError('เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ใช้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, [liffLoading, liffError, profile?.userId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('addr_')) {
      const addressField = name.replace('addr_', '');
      setFormData(prev => ({ ...prev, address: { ...prev.address, [addressField]: value } }));
    } else if (name.startsWith('bank_')) {
      const bankField = name.replace('bank_', '');
      setFormData(prev => ({ ...prev, bankInfo: { ...prev.bankInfo, [bankField]: value } }));
    } else if (name === 'referralCode') {
      setFormData(prev => ({ ...prev, referralCode: value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (registrationSetup?: {
    maxInvestmentAmount: number;
    preferences: Record<string, { enabled: boolean; sub: string[]; limitAmount: number }>;
  }) => {
    if (!profile?.userId) { setError('กรุณาเข้าสู่ระบบ LINE'); return; }
    if (!formData.firstname || !formData.lastname || !formData.phoneNumber || !formData.nationalId) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน'); return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await axios.post('/api/investors/register', {
        lineId: profile.userId,
        ...formData,
        referralCode: formData.referralCode || null,
        maxInvestmentAmount: registrationSetup?.maxInvestmentAmount || null,
        preferences: registrationSetup ? {
          categories: registrationSetup.preferences,
          referral: classifyReferralCode(formData.referralCode),
        } : formData.referralCode ? {
          referral: classifyReferralCode(formData.referralCode),
        } : null,
      });
      if (response.data.success) router.push('/ekyc-invest');
    } catch (error: any) {
      console.error('Registration error:', error);
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการลงทะเบียน');
    } finally {
      setSubmitting(false);
    }
  };

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center page-investor">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (investorData) {
    if (!pinVerified) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-[30px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_22px_60px_rgba(11,59,130,0.14)]">
            <div className="rounded-[24px] border border-white/90 bg-white/80 px-4 py-5 text-center shadow-[0_10px_24px_rgba(11,59,130,0.06)]">
              <div className="inline-flex rounded-full border border-[#C8D6EC] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#5C76A6]">
                Secure Access
              </div>
              <h2 className="mt-3 text-xl font-semibold text-[#243B62]">ยืนยัน PIN ก่อนเข้าดูข้อมูลสมาชิก</h2>
              <p className="mt-2 text-sm text-[#6F7E97]">
                เพื่อความปลอดภัย กรุณายืนยัน PIN 6 หลักก่อนดูข้อมูลบัญชีผู้ลงทุน
              </p>
              <button
                type="button"
                onClick={() => setPinModalOpen(true)}
                className="mt-5 w-full rounded-2xl bg-gradient-to-r from-[#6D8FC8] via-[#1E4FA3] to-[#0B3B82] py-3 text-sm font-medium text-white shadow-[0_12px_24px_rgba(11,59,130,0.18)] transition-transform active:scale-[0.98]"
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
              onVerified={() => { setPinVerified(true); setPinModalOpen(false); }}
            />
          )}
        </div>
      );
    }

    const currentLimit = investorData.stats.currentInvestedAmount ?? investorData.stats.totalInvestedAmount;
    const maxLimit = investorData.max_investment_amount || 0;
    const usedPercent = maxLimit > 0 ? Math.min(100, Math.max(0, (currentLimit / maxLimit) * 100)) : 0;
    const usedPercentDisplay = usedPercent.toFixed(1);
    const transferredAmount = Math.min(maxLimit, Math.max(0, currentLimit));
    const leftInJuzMatchPool = Math.max(0, maxLimit - transferredAmount);
    const transferredPercent = maxLimit > 0 ? (transferredAmount / maxLimit) * 100 : 0;
    const transferredPercentDisplay = transferredPercent.toFixed(1);
    const investorTier = (investorData.investor_tier || 'SILVER').toUpperCase();
    const tierImage = TIER_IMAGES[investorTier] || TIER_IMAGES.SILVER;
    const monthlyRate = TIER_MONTHLY_RATES[investorTier] || TIER_MONTHLY_RATES.SILVER;
    const annualRate = monthlyRate * 12 * 100;
    const totalActivePrincipal = Number(investorData.total_active_principal || 0);
    const nextTier = investorTier === 'SILVER' ? 'GOLD' : investorTier === 'GOLD' ? 'PLATINUM' : null;
    const nextTarget = nextTier === 'GOLD' ? TIER_THRESHOLDS.GOLD : nextTier === 'PLATINUM' ? TIER_THRESHOLDS.PLATINUM : null;
    const remainingToNext = nextTarget ? Math.max(0, nextTarget - totalActivePrincipal) : 0;
    const preferences = investorData.investment_preferences?.categories || {};
    const selectedCategories = Object.keys(ITEM_TYPE_LABELS).filter((key) => {
      const entry = preferences?.[key];
      if (!entry) return false;
      return !!entry.enabled || (Array.isArray(entry.sub) && entry.sub.length > 0);
    });
    const configuredCategoryLimits = CREDIT_LIMIT_CATEGORIES
      .map((key) => {
        const entry = preferences?.[key];
        const rawAmount = entry?.limitAmount ?? entry?.amount ?? entry?.limit_amount ?? 0;
        const amount = typeof rawAmount === 'number'
          ? rawAmount
          : Number(String(rawAmount).replace(/[^0-9]/g, '')) || 0;
        return {
          key,
          label: ITEM_TYPE_LABELS[key] || key,
          amount,
          color: CREDIT_LIMIT_COLORS[key] || '#9DB5D9',
        };
      })
      .filter((category) => category.amount > 0);
    const configuredCategoryMap = new Map(configuredCategoryLimits.map((category) => [category.key, category]));
    const selectedWithoutLimit = selectedCategories.filter((key) => !configuredCategoryMap.has(key));
    const configuredCategoryTotal = configuredCategoryLimits.reduce((sum, category) => sum + category.amount, 0);
    const remainingAllocation = Math.max(0, maxLimit - configuredCategoryTotal);
    const evenAllocation = selectedWithoutLimit.length > 1 ? Math.floor(remainingAllocation / selectedWithoutLimit.length) : remainingAllocation;
    const inferredCategoryLimits = selectedWithoutLimit.map((key, index) => {
      const amount = selectedWithoutLimit.length <= 1
        ? remainingAllocation
        : index === selectedWithoutLimit.length - 1
        ? Math.max(0, remainingAllocation - (evenAllocation * index))
        : evenAllocation;
      return {
        key,
        label: ITEM_TYPE_LABELS[key] || key,
        amount,
        color: CREDIT_LIMIT_COLORS[key] || '#9DB5D9',
      };
    });
    const categoryLimits = [...configuredCategoryLimits, ...inferredCategoryLimits].filter((category) => category.amount > 0);
    const totalCategoryLimit = categoryLimits.reduce((sum, category) => sum + category.amount, 0);
    const unallocatedAmount = Math.max(0, maxLimit - totalCategoryLimit);
    const chartCategories = unallocatedAmount > 0
      ? [
          ...categoryLimits,
          {
            key: 'unallocated',
            label: 'Unallocated',
            amount: unallocatedAmount,
            color: '#D3DCEB',
          },
        ]
      : categoryLimits;
    const referral = classifyReferralCode(
      investorData.referral_code ?? investorData.investment_preferences?.referral_code ?? investorData.investment_preferences?.referral?.code
    );
    const showJuzmatchPool = referral.source === 'JUZMATCH';
    const autoMatchAllowed = investorTier === 'GOLD' || investorTier === 'PLATINUM';
    const autoMatchEnabled = !!investorData.auto_invest_enabled;
    const autoLiquidationEnabled = !!investorData.auto_liquidation_enabled;

    return (
      <div className="min-h-screen bg-white font-sans p-4 flex flex-col items-center pb-8">
        <div className="w-full max-w-sm my-3 rounded-[28px] bg-gradient-to-br from-white via-[#E6EBF2] to-[#E4ECF8] shadow-[0_10px_30px_rgba(30,58,138,0.08)] border border-[#E4ECF8]">
          <div className="inline-flex rounded-full border border-[#C8D6EC] bg-white/90 mt-4 ml-4 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#5C76A6]">
            Investor Profile
          </div>
          <button onClick={() => setTierModalOpen(true)} className="mt-2 w-full rounded-3xl overflow-hidden active:scale-[0.98] transition-transform">
            <div className="relative h-24 w-full">
              <Image src={tierImage} alt={`${TIER_LABELS[investorTier]} tier`} fill className="object-cover" priority />
            </div>
          </button>
          <div className="bg-white/80 border border-white/90 rounded-2xl mx-4 p-4 text-center mb-4 shadow-[0_10px_24px_rgba(11,59,130,0.06)]">
              <p className="text-xl font-medium text-gray-800 mb-2">{investorData.firstname} {investorData.lastname}</p>
              <p className="text-[#393939] text-sm font-light">Member ID: {investorData.investor_id.slice(0, 8)}</p>
            </div>
        </div>
        <div className="w-full max-w-sm space-y-3">
          {/* Current Limit */}
          <div className="w-full bg-[#E6EBF2] rounded-3xl p-4 text-center">
            <h2 className="text-gray-600 text-lg font-medium">วงเงินปัจจุบัน</h2>
            {/* <span className="bg-white text-gray-500 text-xs px-3 py-1 rounded-full">
                Credit limit
            </span> */}
            <div className="flex items-baseline justify-start gap-2 mt-3">
              <span className="text-3xl font-medium text-[#06367B]">{currentLimit.toLocaleString()}</span>
              <span className="text-gray-500 text-sm font-base">/ {maxLimit.toLocaleString()}</span>
            </div>
            <div className="mt-1 w-full mx-auto">
              <div className="mb-2 h-4 overflow-hidden rounded-full bg-[#D3DCEB]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#1E3A8A] to-[#4F78C6] transition-all duration-300"
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-[#5878A7]">
                <span>วงเงินที่ใช้อยู่</span>
                <span>{usedPercentDisplay}%</span>
              </div>
            </div>
            <div className="mt-4 border-t border-white/70 pt-4">
              <button
                type="button"
                onClick={() => setCreditLimitsOpen((prev) => !prev)}
                className="w-full rounded-2xl bg-white px-4 py-3 text-left transition-colors active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[#06367B]">วงเงินเครดิตแยกตามหมวดหมู่</div>
                    <div className="text-[11px] text-[#5878A7]">
                      {categoryLimits.length > 0 ? `${categoryLimits.length} categories configured` : 'No category limit set yet'}
                    </div>
                  </div>
                  <span className="rounded-full border border-[#B8C6DD] px-3 py-1 text-xs font-medium text-[#1E3A8A]">
                    {creditLimitsOpen ? 'ซ่อน' : 'แสดงเพิ่ม'}
                  </span>
                </div>
              </button>

              <div className={`grid transition-all duration-[250ms] ease-in-out ${creditLimitsOpen ? 'mt-3 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <div className="rounded-2xl bg-white p-4 text-left">
                    {chartCategories.length > 0 ? (
                      <>
                        <div className="flex items-center gap-4">
                          <CreditLimitDonutChart categories={chartCategories} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-[#7A8FB8]">Category total</div>
                            <div className="mt-1 text-2xl font-medium text-[#06367B]">
                              {totalCategoryLimit.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-500">
                              {unallocatedAmount.toLocaleString()} บาท คงเหลือจากวงเงินเครดิตทั้งหมด
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          {chartCategories.map((category) => {
                            const percentage = maxLimit > 0 ? (category.amount / maxLimit) * 100 : 0;
                            return (
                              <div key={category.key} className="flex items-center justify-between rounded-2xl bg-[#F5F7FA] px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: category.color }}
                                  />
                                  <span className="truncate text-sm text-gray-700">{category.label}</span>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-medium text-[#06367B]">{category.amount.toLocaleString()}</div>
                                  <div className="text-[11px] text-gray-500">{percentage.toFixed(1)}%</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl bg-[#F5F7FA] px-4 py-6 text-center text-sm text-gray-500">
                        ยังไม่ได้กำหนดวงเงินแยกตามหมวดหมู่
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Investor Info */}
          <div className="w-full bg-[#E6EBF2] rounded-3xl p-3 text-center">

            <h2 className="text-gray-600 text-lg font-medium">สัญญาและการลงทุน</h2>
            <div className="my-4 grid grid-cols-3 gap-2 text-center divide-x divide-[#B2C1D6]">
              {[
                { value: investorData.stats.totalContracts,  label: 'สัญญาทั้งหมด' },
                { value: investorData.stats.activeContracts, label: 'สัญญายังไม่สิ้นสุด' },
                { value: investorData.stats.endedContracts,  label: 'สัญญาสิ้นสุดแล้ว' },
              ].map((stat) => (
                <div key={stat.label} className="px-2">
                  <div className="text-2xl font-bold text-gray-700 mb-1">{stat.value}</div>
                  <div className="text-xs text-gray-600 font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 bg-white rounded-2xl p-4">
              <div className="text-center text-gray-600 font-medium mb-3">Item preferences</div>
              <div className="flex flex-wrap gap-2 justify-center">
                {selectedCategories.length === 0 ? (
                  <span className="text-xs text-gray-400">ยังไม่ได้ตั้งค่า</span>
                ) : (
                  selectedCategories.map((key) => (
                    <span key={key} className="px-3 py-1 rounded-full text-xs font-medium bg-[#5D79B4] text-white">
                      {ITEM_TYPE_LABELS[key] || key}
                    </span>
                  ))
                )}
              </div>

            <div className="h-px bg-gray-300 my-3"></div>
            
              <div className="mt-4 space-y-2 text-xs text-gray-600">
                <div className="flex items-center justify-between">
                  <span>Auto matching</span>
                  <span className={`px-2 py-0.5 rounded-full ${autoMatchAllowed ? (autoMatchEnabled ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-gray-100 text-gray-500') : 'bg-[#FEF3C7] text-[#92400E]'}`}>
                    {autoMatchAllowed ? (autoMatchEnabled ? 'เปิดใช้งาน' : 'ปิด') : 'ยังไม่ปลดล็อก'}
                  </span>
                </div>
                {!autoMatchAllowed && remainingToNext > 0 && (
                  <div className="text-[10px] text-gray-400 text-right">ปล่อยสัญญาเพิ่มอีก {remainingToNext.toLocaleString()} บาท เพื่อปลดล็อก</div>
                )}
                <div className="flex items-center justify-between">
                  <span>Liquidated by Pawnly</span>
                  <span className={`px-2 py-0.5 rounded-full ${autoLiquidationEnabled ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-gray-100 text-gray-500'}`}>
                    {autoLiquidationEnabled ? 'เปิดใช้งาน' : 'ปิด'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* JUZMATCH Pool */}
          {showJuzmatchPool && (
            <div className="w-full bg-[#E6EBF2] rounded-3xl p-3">
              <h2 className="text-gray-600 text-lg font-medium text-center">JUZMATCH Pool</h2>
              <div className="mt-4 flex items-center gap-4">
                <JuzmatchPoolDonut transferredPercentDisplay={transferredPercentDisplay} transferredPercent={transferredPercent} />
                <div className="flex-1 space-y-2">
                  <div className="rounded-2xl bg-white px-3 py-2">
                    <div className="text-xs text-gray-500">เหลือใน JuzMatch pool</div>
                    <div className="text-base font-medium text-[#06367B]">{leftInJuzMatchPool.toLocaleString()} บาท</div>
                  </div>
                  <div className="rounded-2xl bg-white px-3 py-2">
                    <div className="text-xs text-gray-500">โอนเข้าแพลตฟอร์มแล้ว</div>
                    <div className="text-base font-medium text-[#06367B]">{transferredAmount.toLocaleString()} บาท</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Button group */}
          <div className="space-y-2 pt-4">
            <button onClick={() => router.push('/register-invest/credit-limit')} className="w-full bg-white border border-[#3B5BA5] text-[#1E3A8A] rounded-full py-2 flex flex-col items-center justify-center transition-colors active:scale-[0.98]">
              <span className="text-base font-medium">ตั้งค่าการลงทุน</span>
              <span className="text-xs opacity-80 font-light">Configure investment</span>
            </button>
            <button onClick={() => router.push('/register-invest/edit')} className="w-full bg-[#E9EFF6] text-[#1E3A8A] rounded-full py-2 flex flex-col items-center justify-center transition-colors active:scale-[0.98]">
              <span className="text-base font-medium">แก้ไขข้อมูล</span>
              <span className="text-xs opacity-80 font-light">Edit profile</span>
            </button>
            {investorData.kyc_status !== 'VERIFIED' && (
              <button
                onClick={() => router.push(investorData.kyc_status === 'PENDING' ? '/ekyc-invest/waiting' : '/ekyc-invest')}
                className="w-full bg-[#1E3A8A] hover:bg-[#152C6B] text-white rounded-full py-2 flex flex-col items-center justify-center transition-colors active:scale-[0.98]"
              >
                <span className="text-base font-medium">ยืนยันตัวตน</span>
                <span className="text-xs opacity-80 font-light">Verify identity</span>
              </button>
            )}
          </div>
        </div>

        {tierModalOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setTierModalOpen(false)}
          >
            <div
              className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-xs text-gray-400">Tier ของคุณ</div>
                  <div className="text-xl font-bold text-gray-800">{TIER_LABELS[investorTier]}</div>
                  <div className="text-sm text-[#1E3A8A] mt-1">{`${(monthlyRate * 100).toFixed(2)}% / เดือน • ${annualRate.toFixed(2)}% / ปี`}</div>
                </div>
                <button
                  onClick={() => setTierModalOpen(false)}
                  aria-label="Close tier modal"
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                {[
                  { tier: 'SILVER', label: 'Silver', desc: 'เริ่มต้น • ผลตอบแทน 1.50%/เดือน (18%/ปี)', sub: 'รับข้อเสนอสินเชื่อทั่วไป', highlight: 'border-[#CBD6EA] bg-[#F5F7FA]' },
                  { tier: 'GOLD',   label: 'Gold',   desc: 'ยอดสัญญารวม ≥ 400,000 บาท', sub: 'ผลตอบแทน 1.53%/เดือน (18.36%/ปี) + เปิดใช้ Auto matching', highlight: 'border-[#C9A33B] bg-[#FFF8E7]' },
                  { tier: 'PLATINUM', label: 'Platinum', desc: 'ยอดสัญญารวม ≥ 1,000,000 บาท', sub: 'ผลตอบแทน 1.60%/เดือน (19.20%/ปี) • สิทธิ์สูงสุด', highlight: 'border-[#B4B4B4] bg-[#F7F7F7]' },
                ].map((t) => (
                  <div key={t.tier} className={`rounded-2xl border px-4 py-3 ${investorTier === t.tier ? t.highlight : 'border-gray-200'}`}>
                    <div className="font-semibold text-gray-800">{t.label}</div>
                    <div className="text-xs text-gray-500">{t.desc}</div>
                    <div className="text-xs text-gray-500 mt-1">{t.sub}</div>
                  </div>
                ))}
              </div>
              {nextTier && (
                <div className="mt-4 rounded-2xl bg-[#F1F5FB] px-4 py-3 text-xs text-gray-600">
                  <div className="font-semibold text-gray-800 mb-1">Tier ถัดไป: {TIER_LABELS[nextTier]}</div>
                  <div>เพิ่มยอดสัญญาอีก {remainingToNext.toLocaleString()} บาทเพื่อเลื่อนระดับ</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <RegisterForm
      formData={formData}
      handleInputChange={handleInputChange}
      handleSubmit={handleSubmit}
      submitting={submitting}
      error={error}
    />
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const RegisterField = ({ labelEn, labelTh, placeholder, value, onChange, name, type = 'text' }: {
  labelEn: string; labelTh: string; placeholder: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; name: string; type?: string;
}) => (
  <div className="mb-4">
    <div className="mb-1">
      <div className="text-sm font-medium text-gray-800 md:text-base">{labelEn}</div>
      <div className="text-xs font-light text-[#6F7E97]">{labelTh}</div>
    </div>
    <input type={type} name={name} placeholder={placeholder} value={value} onChange={onChange}
      className="w-full rounded-xl border border-[#CCD6E6] bg-white px-3 py-3 text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-1 focus:ring-[#06367B]" />
  </div>
);

function DropdownField({
  labelEn,
  labelTh,
  name,
  value,
  placeholder,
  options,
  onChange,
}: {
  labelEn: string;
  labelTh: string;
  name: string;
  value: string;
  placeholder: string;
  options: string[];
  onChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelect = (nextValue: string) => {
    const syntheticEvent = {
      target: { name, value: nextValue },
    } as React.ChangeEvent<HTMLSelectElement>;
    onChange(syntheticEvent);
    setOpen(false);
  };

  return (
    <div className="mb-4" ref={containerRef}>
      <div className="mb-1">
        <div className="text-sm font-medium text-gray-800 md:text-base">{labelEn}</div>
        <div className="text-xs font-light text-[#6F7E97]">{labelTh}</div>
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-xl border border-[#CCD6E6] bg-white px-3 py-3 text-left text-base text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-1 focus:ring-[#06367B]"
          aria-expanded={open}
        >
          <span className={value ? 'text-gray-800' : 'text-gray-400'}>{value || placeholder}</span>
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="max-h-60 overflow-y-auto py-1">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`block w-full px-3 py-2 text-left text-sm transition-colors ${value === option ? 'bg-[#E8F0FF] text-[#1E3A8A]' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepBar({ currentStep }: { currentStep: number }) {
  const steps = [
    { id: 1, label: 'ข้อมูล' },
    { id: 2, label: 'สินค้า' },
    { id: 3, label: 'วงเงิน' },
  ];

  return (
    <div className="mb-4 rounded-[22px] border border-[#D9E3F2] bg-white/90 px-4 py-3 shadow-[0_8px_18px_rgba(11,59,130,0.06)]">
      <div className="flex items-start gap-2">
        {steps.map((step, index) => {
          const active = currentStep >= step.id;
          return (
            <React.Fragment key={step.id}>
              <div className="flex min-w-[56px] flex-col items-center text-center">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${active ? 'bg-[#0B3B82] text-white' : 'bg-[#E6EBF2] text-[#6F7E97]'}`}>
                  {step.id}
                </div>
                <span className={`mt-1 text-[11px] font-medium ${active ? 'text-[#0B3B82]' : 'text-[#8A98B2]'}`}>{step.label}</span>
              </div>
              {index < steps.length - 1 && <div className={`mt-4 h-[2px] flex-1 rounded-full ${currentStep > step.id ? 'bg-[#0B3B82]' : 'bg-[#D9E3F2]'}`} />}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function CreditLimitDonutChart({ categories }: { categories: Array<{ key: string; amount: number; color: string }> }) {
  const size = 120;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = categories.reduce((sum, category) => sum + category.amount, 0);
  const gap = circumference * 0.018;
  let cursor = 0;
  const segments = categories.map((category) => {
    const rawLength = total > 0 ? (category.amount / total) * circumference : 0;
    const segmentLength = Math.max(rawLength - gap, 0);
    const dashArray = `${segmentLength} ${circumference}`;
    const dashOffset = -cursor;
    cursor += rawLength;

    return {
      ...category,
      dashArray,
      dashOffset,
    };
  });

  return (
    <div className="relative h-[120px] w-[120px] shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#D8E0ED"
          strokeWidth={strokeWidth}
        />
        {[...segments].reverse().map((category) => (
          <circle
            key={category.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={category.color}
            strokeWidth={strokeWidth}
            strokeDasharray={category.dashArray}
            strokeDashoffset={category.dashOffset}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="absolute inset-[22px] rounded-full bg-white flex flex-col items-center justify-center">
        <span className="text-xl font-medium text-[#06367B]">{categories.length}</span>
        <span className="text-[10px] text-gray-500 text-center leading-tight">Categories</span>
      </div>
    </div>
  );
}

function JuzmatchPoolDonut({ transferredPercentDisplay, transferredPercent }: { transferredPercentDisplay: string; transferredPercent: number }) {
  const size = 112;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const segmentLength = Math.max(0, Math.min(circumference, (transferredPercent / 100) * circumference));

  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#C7D1E3"
          strokeWidth={strokeWidth}
        />
        {segmentLength > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1E3A8A"
            strokeWidth={strokeWidth}
            strokeDasharray={`${segmentLength} ${circumference}`}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-[10px] rounded-full bg-[#D3DCEB] flex flex-col items-center justify-center">
        <span className="text-xl font-medium text-[#06367B]">{transferredPercentDisplay}%</span>
        <span className="text-[10px] text-gray-500">Transferred</span>
      </div>
    </div>
  );
}

const BANKS = [
  'ธนาคารกสิกรไทย (KBANK)', 'ธนาคารไทยพาณิชย์ (SCB)', 'ธนาคารกรุงเทพ (BBL)',
  'ธนาคารกรุงไทย (KTB)', 'ธนาคารกรุงศรีอยุธยา (BAY)', 'ธนาคารทหารไทยธนชาต (TTB)',
  'ธนาคารออมสิน (GSB)', 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (BAAC)',
  'ธนาคารอาคารสงเคราะห์ (GH Bank)', 'ธนาคารเกียรตินาคินภัทร (KKP)',
  'ธนาคารซีไอเอ็มบี ไทย (CIMB)', 'ธนาคารยูโอบี (UOB)',
  'ธนาคารแลนด์ แอนด์ เฮ้าส์ (LH Bank)', 'ธนาคารทิสโก้ (TISCO)', 'พร้อมเพย์ (PromptPay)',
];

const ACCOUNT_TYPE_OPTIONS = [
  'บัญชีออมทรัพย์',
  'บัญชีเงินฝากประจำ',
  'บัญชีกระแสรายวัน',
  'บัญชีเงินตราต่างประเทศ',
];

const MAX_CREDIT_LIMIT = 1_000_000;

function RegisterForm({ formData, handleInputChange, handleSubmit, submitting, error }: {
  formData: RegisterFormData;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>) => void;
  handleSubmit: (registrationSetup?: {
    maxInvestmentAmount: number;
    preferences: Record<string, { enabled: boolean; sub: string[]; limitAmount: number }>;
  }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [step, setStep] = useState(1);
  const [stepDirection, setStepDirection] = useState<'forward' | 'backward'>('forward');
  const [poppingBubbleKey, setPoppingBubbleKey] = useState<string | null>(null);
  const [totalLimitInput, setTotalLimitInput] = useState('');
  const [divideEqually, setDivideEqually] = useState(true);
  const [preferenceState, setPreferenceState] = useState<RegistrationPreferenceState>(() => buildRegistrationPreferenceState());
  const selectedPreferenceKeys = Object.keys(preferenceState).filter((key) => preferenceState[key]?.enabled);
  const computedPayload = buildCategoryLimitPayload(preferenceState, totalLimitInput, divideEqually);
  const equalPreviewAmount = selectedPreferenceKeys.length > 0 ? Math.floor(parseAmountInput(totalLimitInput) / selectedPreferenceKeys.length) : 0;
  const referralPreview = classifyReferralCode(formData.referralCode);
  const isJuzmatchReferral = referralPreview.source === 'JUZMATCH';
  const manualCategoryTotal = selectedPreferenceKeys.reduce((sum, key) => sum + parseAmountInput(preferenceState[key]?.limitAmount || ''), 0);

  const handleCategoryLimitChange = (key: string, value: string) => {
    setPreferenceState((prev) => {
      const totalLimit = Math.min(parseAmountInput(totalLimitInput), MAX_CREDIT_LIMIT);
      const otherTotal = selectedPreferenceKeys.reduce((sum, selectedKey) => {
        if (selectedKey === key) return sum;
        return sum + parseAmountInput(prev[selectedKey]?.limitAmount || '');
      }, 0);
      const parsed = Math.min(parseAmountInput(value), MAX_CREDIT_LIMIT);
      const maxAllowed = totalLimit > 0 ? Math.max(0, totalLimit - otherTotal) : parsed;
      return {
        ...prev,
        [key]: {
          ...prev[key],
          limitAmount: formatAmount(Math.min(parsed, maxAllowed)),
        },
      };
    });
  };

  const handleNextFromDetails = () => {
    if (!formData.firstname || !formData.lastname || !formData.phoneNumber || !formData.nationalId) return;
    setStepDirection('forward');
    setStep(2);
  };

  const handleFinalSubmit = () => {
    if (computedPayload.totalLimit <= 0 || computedPayload.categories === null) return;
    handleSubmit({
      maxInvestmentAmount: computedPayload.totalLimit,
      preferences: computedPayload.categories,
    });
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      <style jsx>{`
        @keyframes step-enter-up {
          from {
            opacity: 0;
            transform: translateY(28px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes bubble-pop-in {
          from {
            opacity: 0;
            transform: scale(0.82) translateY(18px);
          }
          72% {
            opacity: 1;
            transform: scale(1.04) translateY(-2px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes bubble-select-pop {
          0% {
            transform: scale(1);
          }
          22% {
            transform: scale(0.94);
          }
          58% {
            transform: scale(1.05);
          }
          82% {
            transform: scale(0.985);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
      <div className="px-4 pt-6 flex justify-center">
        <div className="w-full max-w-md pb-10">
          <StepBar currentStep={step} />
          <div
            key={step}
            style={{
              animation: 'step-enter-up 250ms ease',
            }}
          >
            {step === 1 && (
              <>
              <div className="rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 pb-0 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
                <div className="mb-5 rounded-[24px] border border-white/80 bg-white/70 px-4 py-4">
                  <div className="inline-flex rounded-full border border-[#C8D6EC] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#5C76A6]">
                    Investor Register
                  </div>
                  <div className="mt-3 bg-gradient-to-r from-[#0B3B82] via-[#1E4FA3] to-[#6D8FC8] bg-clip-text text-3xl font-semibold tracking-[0.08em] text-transparent">
                    สมัครสมาชิก
                  </div>
                  <p className="mt-1 text-xs text-[#6F7E97]">กรอกข้อมูลส่วนตัวและบัญชีธนาคารก่อนตั้งค่าการลงทุน</p>
                </div>

                <div className="mb-2">
                  <h2 className="text-lg font-bold text-[#243B62]">Personal Information</h2>
                  <p className="text-xs text-[#6F7E97]">ข้อมูลส่วนตัว</p>
                </div>
                <div className="space-y-1">
                  <RegisterField labelEn="First name" labelTh="ชื่อจริง" placeholder="ชื่อจริง" name="firstname" value={formData.firstname} onChange={handleInputChange} />
                  <RegisterField labelEn="Last name" labelTh="นามสกุล" placeholder="นามสกุล" name="lastname" value={formData.lastname} onChange={handleInputChange} />
                  <RegisterField labelEn="Phone number" labelTh="เบอร์โทรศัพท์" placeholder="000-000-0000" name="phoneNumber" type="tel" value={formData.phoneNumber} onChange={handleInputChange} />
                  <RegisterField labelEn="ID" labelTh="เลขบัตรประชาชน 13 หลัก" placeholder="X-XXXX-XXXXX-XX-X" name="nationalId" value={formData.nationalId} onChange={handleInputChange} />
                </div>
              </div>

              <div className="mt-4 rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 pb-0 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-[#243B62]">Address</h2>
                  <p className="text-xs text-[#6F7E97]">ที่อยู่</p>
                </div>
                <div className="space-y-1">
                  {[
                    { labelEn: 'Address (เลขที่)', placeholder: 'บ้านเลขที่', name: 'addr_houseNo', value: formData.address.houseNo },
                    { labelEn: 'Village/Building (หมู่บ้าน/อาคาร)', placeholder: 'ชื่อหมู่บ้าน/อาคาร', name: 'addr_village', value: formData.address.village },
                    { labelEn: 'Street (ตรอก/ซอย/ถนน)', placeholder: 'ถนน/ตรอก/ซอย', name: 'addr_street', value: formData.address.street },
                    { labelEn: 'Sub-district (แขวง/ตำบล)', placeholder: 'แขวง/ตำบล', name: 'addr_subDistrict', value: formData.address.subDistrict },
                    { labelEn: 'District (เขต/อำเภอ)', placeholder: 'เขต/อำเภอ', name: 'addr_district', value: formData.address.district },
                    { labelEn: 'Province (จังหวัด)', placeholder: 'จังหวัด', name: 'addr_province', value: formData.address.province },
                    { labelEn: 'Country (ประเทศ)', placeholder: 'ประเทศ', name: 'addr_country', value: formData.address.country },
                    { labelEn: 'Postcode (รหัสไปรษณีย์)', placeholder: 'XXXXX', name: 'addr_postcode', value: formData.address.postcode },
                  ].map((f) => (
                    <RegisterField key={f.name} labelEn={f.labelEn} labelTh="" placeholder={f.placeholder} name={f.name} value={f.value} onChange={handleInputChange} />
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 pb-0 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-[#243B62]">Bank Account</h2>
                  <p className="text-xs text-[#6F7E97]">ข้อมูลบัญชีธนาคาร</p>
                </div>
                <DropdownField labelEn="Bank name" labelTh="ชื่อธนาคาร" name="bank_bankName" value={formData.bankInfo.bankName} placeholder="เลือกธนาคาร" options={BANKS} onChange={handleInputChange} />
                <RegisterField labelEn="Account no." labelTh="หมายเลขบัญชี" placeholder="0000000000" name="bank_accountNo" type="tel" value={formData.bankInfo.accountNo} onChange={handleInputChange} />
                <DropdownField labelEn="Account type" labelTh="ประเภทบัญชี" name="bank_accountType" value={formData.bankInfo.accountType} placeholder="เลือกประเภทบัญชี" options={ACCOUNT_TYPE_OPTIONS} onChange={handleInputChange} />
                <RegisterField labelEn="Account name" labelTh="ชื่อบัญชี" placeholder="ชื่อ-นามสกุลเจ้าของบัญชี" name="bank_accountName" value={formData.bankInfo.accountName} onChange={handleInputChange} />
              </div>

              <div className="mt-4 rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 pb-0 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
                <div className="mb-2">
                  <h2 className="text-lg font-bold text-[#243B62]">Referral Code</h2>
                  <p className="text-xs text-[#6F7E97]">โค้ดสำหรับกำหนดสิทธิ์การเข้าถึงฟังก์ชัน</p>
                </div>
                <RegisterField labelEn=" " labelTh=" " placeholder="AA260001" name="referralCode" value={formData.referralCode} onChange={handleInputChange}/>
              </div>
              </>
            )}

            {step === 2 && (
              <div className="rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-6 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
              <div className="text-center">
                <h2 className="mt-0 text-2xl font-semibold text-[#243B62]">เลือกสินค้าที่ต้องการลงทุน</h2>
                <p className="mt-1 text-sm text-[#6F7E97]">แตะเลือกเป็นฟองรายการที่สนใจได้หลายหมวดหมู่</p>
              </div>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {REGISTER_CATEGORY_OPTIONS.map((category, index) => {
                  const selected = preferenceState[category.key]?.enabled;
                  return (
                    <button
                      key={category.key}
                      type="button"
                      onClick={() => {
                        setPoppingBubbleKey(category.key);
                        setPreferenceState((prev) => ({ ...prev, [category.key]: { ...prev[category.key], enabled: !prev[category.key].enabled } }));
                        window.setTimeout(() => {
                          setPoppingBubbleKey((current) => (current === category.key ? null : current));
                        }, 320);
                      }}
                      style={{
                        animation: [
                          `bubble-pop-in 340ms cubic-bezier(0.22, 1, 0.36, 1) ${index * 60}ms both`,
                          poppingBubbleKey === category.key ? 'bubble-select-pop 320ms cubic-bezier(0.2, 0.9, 0.25, 1)' : '',
                        ].filter(Boolean).join(', '),
                      }}
                      className={`min-w-[132px] rounded-full px-5 py-3 text-center will-change-transform transition-[transform,colors,box-shadow,background-image] duration-300 ease-out focus:outline-none focus:ring-0 active:scale-[0.97] ${selected ? 'border border-[#0B3B82] bg-gradient-to-r from-[#1E4FA3] to-[#0B3B82] text-white shadow-[0_10px_24px_rgba(11,59,130,0.18)]' : 'border border-[#CCD6E6] bg-white text-[#35507A]'}`}
                    >
                      <div className="text-sm font-medium">{category.labelTh}</div>
                      <div className={`text-[11px] ${selected ? 'text-white/80' : 'text-[#6F7E97]'}`}>{category.labelEn}</div>
                    </button>
                  );
                })}
              </div>
              </div>
            )}

            {step === 3 && (
              <div className="rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
              <div className="mb-4">
                <h2 className="text-2xl font-semibold text-[#243B62]">กำหนดวงเงินลงทุน</h2>
                <p className="mt-1 text-sm text-[#6F7E97]">ระบุวงเงินรวมและวงเงินรายหมวดหมู่สำหรับรายการที่เลือกไว้</p>
              </div>
              <div className="rounded-2xl border border-[#D9E3F2] bg-white/80 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-base font-semibold text-gray-800">
                    วงเงินรวม <span className="text-[#D92D20]">*</span>
                  </div>
                  <span className="text-sm text-gray-500">บาท</span>
                </div>
                <input
                  type="text"
                  value={totalLimitInput}
                  onChange={(e) => setTotalLimitInput(formatAmount(Math.min(parseAmountInput(e.target.value), MAX_CREDIT_LIMIT)))}
                  placeholder="100,000"
                  className="w-full rounded-xl border border-[#CCD6E6] bg-white px-3 py-3 text-center text-xl text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-1 focus:ring-[#06367B]"
                />
                <div className="mt-2 text-xs text-[#6F7E97]">สูงสุดไม่เกิน 1,000,000 บาท</div>
                {isJuzmatchReferral && (
                  <div className="mt-2 text-xs text-[#6F7E97]">
                    หากคุณเป็นลูกค้า JUZMATCH กรุณาใส่วงเงินตามยอด Pool ที่เห็นในเอกสารสัญญากระดาษจริง
                  </div>
                )}
              </div>
              <div className="mt-4 rounded-2xl border border-[#D9E3F2] bg-white/80 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base font-semibold text-gray-800">แบ่งเท่ากันอัตโนมัติ</div>
                    <div className="text-xs text-[#6F7E97]">กระจายวงเงินรวมให้หมวดที่เลือกอย่างเท่า ๆ กัน</div>
                  </div>
                  <button type="button" onClick={() => setDivideEqually((prev) => !prev)} className={`h-7 w-12 rounded-full p-1 transition-colors ${divideEqually ? 'bg-[#0B3B82]' : 'bg-gray-200'}`} aria-pressed={divideEqually}>
                    <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${divideEqually ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {selectedPreferenceKeys.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#CCD6E6] bg-white/70 px-4 py-8 text-center text-sm text-[#6F7E97]">ยังไม่ได้เลือกหมวดหมู่ในขั้นตอนก่อนหน้า</div>
                ) : (
                  selectedPreferenceKeys.map((key) => (
                    <div key={key} className="rounded-2xl border border-[#D9E3F2] bg-white/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-gray-800">{REGISTER_CATEGORY_OPTIONS.find((item) => item.key === key)?.labelTh || key}</div>
                          <div className="text-xs text-[#6F7E97]">{ITEM_TYPE_LABELS[key] || key}</div>
                        </div>
                        <div className="w-[150px]">
                          <input
                            type="text"
                            value={divideEqually && parseAmountInput(totalLimitInput) > 0 ? formatAmount(equalPreviewAmount) : preferenceState[key]?.limitAmount || ''}
                            onChange={(e) => handleCategoryLimitChange(key, e.target.value)}
                            disabled={divideEqually}
                            placeholder="0"
                            className="w-full rounded-xl border border-[#CCD6E6] bg-white px-3 py-3 text-center text-sm text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-1 focus:ring-[#06367B] disabled:bg-[#F3F6FB] disabled:text-[#6F7E97]"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {computedPayload.categories === null && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">ยอดรวมวงเงินรายหมวดหมู่เกินวงเงินรวมแล้ว กรุณาปรับแก้</div>
              )}
              {!divideEqually && manualCategoryTotal > parseAmountInput(totalLimitInput) && parseAmountInput(totalLimitInput) > 0 && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">ยอดรวมวงเงินแต่ละหมวดหมู่ต้องไม่เกินวงเงินรวม</div>
              )}
              </div>
            )}
          </div>

          {error && (
            <div className="my-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}

          <div className="my-4">
            <button
              onClick={step === 1 ? handleNextFromDetails : step === 2 ? () => {
                setStepDirection('forward');
                setStep(3);
              } : handleFinalSubmit}
              disabled={submitting || (step === 1 && (!formData.firstname || !formData.lastname || !formData.phoneNumber || !formData.nationalId)) || (step === 2 && selectedPreferenceKeys.length === 0) || (step === 3 && (computedPayload.totalLimit <= 0 || computedPayload.categories === null))}
              className="flex w-full flex-col items-center justify-center rounded-full bg-gradient-to-r from-[#1E4FA3] to-[#0B3B82] py-2 text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:from-[#18448F] hover:to-[#08306A]"
            >
              <span className="text-base font-medium">{submitting ? 'กำลังบันทึก...' : step < 3 ? 'ถัดไป' : 'ดำเนินการต่อ'}</span>
              {!submitting && <span className="text-xs font-light opacity-90">Continue</span>}
            </button>
            {step > 1 && (
              <button type="button" onClick={() => {
                setStepDirection('backward');
                setStep((prev) => Math.max(1, prev - 1));
              }} className="mt-2 flex w-full flex-col items-center justify-center rounded-full bg-[#E6EBF2] py-2 text-[#06367B] transition-colors active:scale-[0.98]">
                <span className="text-base font-medium">ย้อนกลับ</span>
                <span className="text-xs font-light opacity-80">Back</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
