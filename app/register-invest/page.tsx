'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import type { StaticImageData } from 'next/image';
import { ChevronDown, X } from 'lucide-react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';
import { loadMockInvestor } from '@/lib/mock-investor';
import pawnlyWelcomeLogo from '@/app/Image-logos/Pawnly logo - No BG,Full - Off-White.png';
import investorTierSilver from '@/Assets/image-tiers/investortiersilver.png';
import investorTierGold from '@/Assets/image-tiers/investortiergold.png';
import investorTierPlatinum from '@/Assets/image-tiers/investortierplatinum.png';

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

const TIER_IMAGES: Record<string, StaticImageData> = {
  SILVER: investorTierSilver,
  GOLD: investorTierGold,
  PLATINUM: investorTierPlatinum,
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

type RegistrationSetupPayload = {
  maxInvestmentAmount: number;
  preferences: Record<string, { enabled: boolean; sub: string[]; limitAmount: number }>;
};

type RegistrationSubmission = {
  formData: RegisterFormData;
  registrationSetup?: RegistrationSetupPayload;
};

const INVESTOR_REGISTRATION_EKYC_STORAGE_KEY = 'pawn360_investor_registration_ekyc_active';

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

function normalizeRegisteredInvestor(raw: any, overrides?: Partial<InvestorData>): InvestorData {
  return {
    investor_id: raw?.investor_id || 'temp-investor',
    line_id: raw?.line_id || '',
    firstname: raw?.firstname || '',
    lastname: raw?.lastname || '',
    kyc_status: raw?.kyc_status || 'NOT_VERIFIED',
    referral_code: raw?.referral_code ?? null,
    max_investment_amount: raw?.max_investment_amount ?? null,
    investor_tier: raw?.investor_tier || 'SILVER',
    total_active_principal: Number(raw?.total_active_principal || 0),
    auto_invest_enabled: !!raw?.auto_invest_enabled,
    auto_liquidation_enabled: !!raw?.auto_liquidation_enabled,
    investment_preferences: raw?.investment_preferences || null,
    stats: {
      totalContracts: Number(raw?.stats?.totalContracts || 0),
      activeContracts: Number(raw?.stats?.activeContracts || 0),
      endedContracts: Number(raw?.stats?.endedContracts || 0),
      totalInvestedAmount: Number(raw?.stats?.totalInvestedAmount || 0),
      currentInvestedAmount: Number(raw?.stats?.currentInvestedAmount || 0),
    },
    ...overrides,
  };
}

function buildJuzmatchAutoFilledFormData(displayName: string | null | undefined, referralCode: string): RegisterFormData {
  const cleanedName = String(displayName || '').trim();
  const nameParts = cleanedName ? cleanedName.split(/\s+/) : [];
  const firstname = nameParts[0] || 'ลูกค้า';
  const lastname = nameParts.slice(1).join(' ') || 'JUZMATCH';

  return {
    firstname,
    lastname,
    phoneNumber: '0812345678',
    nationalId: '0000000000000',
    referralCode,
    address: {
      houseNo: 'ข้อมูลจาก JUZMATCH',
      village: '-',
      street: '-',
      subDistrict: 'ดึงจาก JUZMATCH console',
      district: 'ดึงจาก JUZMATCH console',
      province: 'ดึงจาก JUZMATCH console',
      country: 'Thailand',
      postcode: '10110',
    },
    bankInfo: {
      bankName: 'ธนาคารกสิกรไทย (KBANK)',
      accountNo: '0000000000',
      accountType: 'บัญชีออมทรัพย์',
      accountName: `${firstname} ${lastname}`.trim(),
    },
  };
}

export default function InvestorRegister() {
  const { profile, isLoading: liffLoading, error: liffError, liffObject } = useLiff();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [investorData, setInvestorData] = useState<InvestorData | null>(null);
  const [registeredEkycInvestor, setRegisteredEkycInvestor] = useState<InvestorData | null>(null);
  const [postRegistrationView, setPostRegistrationView] = useState<'verified' | 'pending' | null>(null);
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
      // if (process.env.NEXT_PUBLIC_LIFF_MOCK === 'true') {
      //   console.info('[Mock] Using mock investor data for UI preview');
      //   setInvestorData(loadMockInvestor());
      //   setPinVerified(true); // ข้าม PIN modal ไปเลยตอน mock
      //   setLoading(false);
      //   return;
      // }

      // ── Real API ─────────────────────────────────────────────────────────────
      try {
        const response = await axios.get(`/api/investors/check?lineId=${profile.userId}`);
        if (response.data.exists) {
          const investor = response.data.investor;
          setInvestorData(investor);
          const hasPostRegistrationEkycFlow = typeof window !== 'undefined'
            && window.localStorage.getItem(INVESTOR_REGISTRATION_EKYC_STORAGE_KEY) === 'active';

          if (hasPostRegistrationEkycFlow) {
            setPinVerified(true);
            if (investor.kyc_status === 'VERIFIED') {
              setPostRegistrationView('verified');
            } else {
              setPostRegistrationView('pending');
            }
          } else {
            const session = getPinSession('INVESTOR', profile.userId);
            if (session?.token) {
              setPinVerified(true);
            } else {
              setPinVerified(false);
              setPinModalOpen(true);
            }
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

  const handleSubmit = async ({ formData: submittedFormData, registrationSetup }: RegistrationSubmission) => {
    if (!profile?.userId) { setError('กรุณาเข้าสู่ระบบ LINE'); return null; }
    if (!submittedFormData.firstname || !submittedFormData.lastname || !submittedFormData.phoneNumber || !submittedFormData.nationalId) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน'); return null;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await axios.post('/api/investors/register', {
        lineId: profile.userId,
        ...submittedFormData,
        referralCode: submittedFormData.referralCode || null,
        maxInvestmentAmount: registrationSetup?.maxInvestmentAmount || null,
        preferences: registrationSetup ? {
          categories: registrationSetup.preferences,
          referral: classifyReferralCode(submittedFormData.referralCode),
        } : submittedFormData.referralCode ? {
          referral: classifyReferralCode(submittedFormData.referralCode),
        } : null,
      });
      if (response.data.success) {
        return normalizeRegisteredInvestor(response.data.investor, {
          kyc_status: response.data.investor?.kyc_status || 'NOT_VERIFIED',
        });
      }
      return null;
    } catch (error: any) {
      console.error('Registration error:', error);
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการลงทะเบียน');
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const clearPostRegistrationEkycFlow = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(INVESTOR_REGISTRATION_EKYC_STORAGE_KEY);
    }
    setPostRegistrationView(null);
  };

  const handleStartRegistrationEkyc = async (submission: RegistrationSubmission) => {
    const investor = registeredEkycInvestor || await handleSubmit(submission);
    if (!investor?.investor_id) return;

    setRegisteredEkycInvestor(investor);
    setError(null);

    try {
      const response = await axios.post('/api/ekyc/initiate-invest', {
        investorId: investor.investor_id,
      });

      if (response.data.success && response.data.url) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(INVESTOR_REGISTRATION_EKYC_STORAGE_KEY, 'active');
          window.location.href = response.data.url;
        }
        return;
      }

      setError('ไม่สามารถเริ่มต้นการยืนยันตัวตนได้');
    } catch (ekycError: any) {
      console.error('eKYC start error:', ekycError);
      setError(ekycError.response?.data?.error || 'ไม่สามารถเริ่มต้นการยืนยันตัวตนได้');
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
    if (postRegistrationView === 'verified') {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-[30px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_22px_60px_rgba(11,59,130,0.14)]">
            <div className="rounded-[24px] border border-white/90 bg-white/80 px-4 py-6 text-center shadow-[0_10px_24px_rgba(11,59,130,0.06)]">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#0B3B82] text-3xl text-white">✓</div>
              <h2 className="mt-4 text-2xl font-semibold text-[#243B62]">ยืนยันตัวตนสำเร็จ</h2>
              <p className="mt-2 text-sm text-[#6F7E97]">
                บัญชีนักลงทุนของคุณพร้อมใช้งานแล้ว สามารถกลับสู่หน้าหลักเพื่อดูข้อมูลสมาชิกได้ทันที
              </p>
              <button
                type="button"
                onClick={() => {
                  clearPostRegistrationEkycFlow();
                  setPinVerified(true);
                }}
                className="mt-5 w-full rounded-2xl bg-gradient-to-r from-[#1E4FA3] to-[#0B3B82] py-3 text-sm font-medium text-white shadow-[0_12px_24px_rgba(11,59,130,0.18)] transition-transform active:scale-[0.98]"
              >
                กลับสู่หน้าหลัก
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (postRegistrationView === 'pending') {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-[30px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_22px_60px_rgba(11,59,130,0.14)]">
            <div className="rounded-[24px] border border-white/90 bg-white/80 px-4 py-6 text-center shadow-[0_10px_24px_rgba(11,59,130,0.06)]">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E6EBF2] text-3xl text-[#0B3B82]">…</div>
              <h2 className="mt-4 text-2xl font-semibold text-[#243B62]">Please wait for eKYC approving</h2>
              <p className="mt-2 text-sm text-[#6F7E97]">
                ระบบกำลังตรวจสอบผลการยืนยันตัวตนของคุณ กรุณารอผลอนุมัติภายใน 24 ชั่วโมง
              </p>
              <button
                type="button"
                onClick={() => {
                  if (liffObject?.closeWindow) {
                    liffObject.closeWindow();
                  } else if (typeof window !== 'undefined' && (window as any).liff?.closeWindow) {
                    (window as any).liff.closeWindow();
                  }
                }}
                className="mt-5 w-full rounded-2xl bg-gradient-to-r from-[#1E4FA3] to-[#0B3B82] py-3 text-sm font-medium text-white shadow-[0_12px_24px_rgba(11,59,130,0.18)] transition-transform active:scale-[0.98]"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      );
    }

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
          <button onClick={() => setTierModalOpen(true)} className="m-4 block overflow-hidden rounded-3xl active:scale-[0.98] transition-transform shadow-[0_10px_30px_rgba(30,58,138,0.15)]">
            <Image
              src={tierImage}
              alt={`${TIER_LABELS[investorTier]} tier`}
              priority
              className="block h-auto w-full"
            />
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
      profileName={profile?.displayName || ''}
      formData={formData}
      handleInputChange={handleInputChange}
      handleSubmit={handleSubmit}
      handleStartEkyc={handleStartRegistrationEkyc}
      onRegistered={(registeredInvestor) => {
        setInvestorData(registeredInvestor);
        setPinVerified(true);
      }}
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

const StaticInfoField = ({ labelEn, labelTh, value }: { labelEn: string; labelTh: string; value: string }) => (
  <div className="mb-4">
    <div className="mb-1">
      <div className="text-sm font-medium text-gray-800 md:text-base">{labelEn}</div>
      <div className="text-xs font-light text-[#6F7E97]">{labelTh}</div>
    </div>
    <div className="w-full rounded-xl border border-[#D9E3F2] bg-[#F3F6FB] px-3 py-3 text-gray-700">
      {value || '-'}
    </div>
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

function StepBar({ currentStep, steps }: { currentStep: number; steps: Array<{ id: number; label: string }> }) {
  return (
    <div className="mb-4 rounded-[24px] border border-[#D9E3F2] bg-white/90 p-2 shadow-[0_8px_18px_rgba(11,59,130,0.06)]">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
          {steps.map((step) => {
            const completed = currentStep > step.id;
            const current = currentStep === step.id;
            return (
                <div
                  key={step.id}
                  className={`flex min-h-[66px] flex-col items-center justify-center rounded-[18px] border px-2 py-3 text-center ${
                    completed
                      ? 'border-[#1E4FA3] bg-[#1E4FA3]'
                      : current
                      ? 'border-[#1E4FA3] bg-[rgba(30,79,163,0.5)]'
                      : 'border-[#D9E3F2] bg-white'
                  }`}
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                    completed || current
                      ? 'bg-white text-[#0B3B82]'
                      : 'bg-[#E6EBF2] text-[#6F7E97]'
                  }`}>
                    {step.id}
                  </div>
                  <span className={`mt-1 text-[11px] font-medium ${
                    completed || current
                      ? 'text-white'
                      : 'text-[#8A98B2]'
                  }`}>{step.label}</span>
                </div>
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

function RegisterForm({ profileName, formData, handleInputChange, handleSubmit, handleStartEkyc, onRegistered, submitting, error }: {
  profileName: string;
  formData: RegisterFormData;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>) => void;
  handleSubmit: (submission: RegistrationSubmission) => Promise<InvestorData | null>;
  handleStartEkyc: (submission: RegistrationSubmission) => Promise<void>;
  onRegistered: (investor: InvestorData) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [stepKey, setStepKey] = useState<'welcome' | 'referral' | 'details' | 'preferences' | 'limits' | 'ekyc' | 'success'>('welcome');
  const [stepDirection, setStepDirection] = useState<'forward' | 'backward'>('forward');
  const [poppingBubbleKey, setPoppingBubbleKey] = useState<string | null>(null);
  const [totalLimitInput, setTotalLimitInput] = useState('');
  const [divideEqually, setDivideEqually] = useState(true);
  const [preferenceState, setPreferenceState] = useState<RegistrationPreferenceState>(() => buildRegistrationPreferenceState());
  const [hasReferralCode, setHasReferralCode] = useState<boolean | null>(null);
  const [completedInvestor, setCompletedInvestor] = useState<InvestorData | null>(null);
  const [addPersonalBankAccount, setAddPersonalBankAccount] = useState(false);

  const referralPreview = classifyReferralCode(formData.referralCode);
  const isJuzmatchReferral = hasReferralCode === true && referralPreview.source === 'JUZMATCH' && referralPreview.isValid;
  const selectedPreferenceKeys = Object.keys(preferenceState).filter((key) => preferenceState[key]?.enabled);
  const juzmatchAutoFilledForm = buildJuzmatchAutoFilledFormData(profileName, formData.referralCode);
  const hasPersonalBankInfo = Boolean(
    formData.bankInfo.bankName &&
    formData.bankInfo.accountNo &&
    formData.bankInfo.accountType &&
    formData.bankInfo.accountName
  );
  const activeFormData = isJuzmatchReferral
    ? {
        ...juzmatchAutoFilledForm,
        bankInfo: addPersonalBankAccount && hasPersonalBankInfo
          ? formData.bankInfo
          : juzmatchAutoFilledForm.bankInfo,
      }
    : formData;

  useEffect(() => {
    if (isJuzmatchReferral && !totalLimitInput) {
      setTotalLimitInput('500,000');
    }
  }, [isJuzmatchReferral, totalLimitInput]);

  const computedPayload = buildCategoryLimitPayload(preferenceState, totalLimitInput, divideEqually);
  const equalPreviewAmount = selectedPreferenceKeys.length > 0 ? Math.floor(parseAmountInput(totalLimitInput) / selectedPreferenceKeys.length) : 0;
  const manualCategoryTotal = selectedPreferenceKeys.reduce((sum, key) => sum + parseAmountInput(preferenceState[key]?.limitAmount || ''), 0);

  const stepOrder = [
    { id: 1, key: 'welcome', label: 'เริ่มต้น' },
    { id: 2, key: 'referral', label: 'Referral' },
    { id: 3, key: 'details', label: 'ข้อมูล' },
    { id: 4, key: 'preferences', label: 'สินค้า' },
    { id: 5, key: 'limits', label: 'วงเงิน' },
    { id: 6, key: 'ekyc', label: 'eKYC' },
    { id: 7, key: 'success', label: 'สำเร็จ' },
  ];
  const currentStepIndex = stepOrder.findIndex((step) => step.key === stepKey);
  const visibleStepOrder = stepOrder.filter((step) => step.key !== 'welcome' && step.key !== 'success');
  const visibleStepIndex = visibleStepOrder.findIndex((step) => step.key === stepKey);
  const currentVisibleStep = visibleStepIndex >= 0 ? visibleStepIndex + 1 : visibleStepOrder.length;

  const goToStep = (nextStep: typeof stepKey, direction: 'forward' | 'backward') => {
    setStepDirection(direction);
    setStepKey(nextStep);
  };

  const goNext = () => {
    const next = stepOrder[currentStepIndex + 1];
    if (next) goToStep(next.key as typeof stepKey, 'forward');
  };

  const goBack = () => {
    const previous = stepOrder[currentStepIndex - 1];
    if (previous) goToStep(previous.key as typeof stepKey, 'backward');
  };

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

  const isReferralStepValid = hasReferralCode === false || (hasReferralCode === true && referralPreview.isValid);
  const isDetailsStepValid = isJuzmatchReferral
    ? !addPersonalBankAccount || hasPersonalBankInfo
    : (
      !!formData.firstname &&
      !!formData.lastname &&
      !!formData.phoneNumber &&
      !!formData.nationalId &&
      !!formData.bankInfo.bankName &&
      !!formData.bankInfo.accountNo &&
      !!formData.bankInfo.accountType &&
      !!formData.bankInfo.accountName
    );
  const isLimitsStepValid = computedPayload.totalLimit > 0 && computedPayload.categories !== null;

  const completeRegistration = async () => {
    if (!computedPayload.categories || computedPayload.totalLimit <= 0) return;
    const investor = await handleSubmit({
      formData: activeFormData,
      registrationSetup: {
        maxInvestmentAmount: computedPayload.totalLimit,
        preferences: computedPayload.categories,
      },
    });
    if (investor) {
      setCompletedInvestor(investor);
      goToStep('success', 'forward');
    }
  };

  const buildRegistrationSubmission = (): RegistrationSubmission | null => {
    if (!computedPayload.categories || computedPayload.totalLimit <= 0) return null;
    return {
      formData: activeFormData,
      registrationSetup: {
        maxInvestmentAmount: computedPayload.totalLimit,
        preferences: computedPayload.categories,
      },
    };
  };

  return (
    <div className={`min-h-screen font-sans ${stepKey === 'welcome' ? 'bg-gradient-to-br from-[#0F4FAE] via-[#2D69C7] to-[#8BB8F2]' : 'bg-white'}`}>
      <style jsx>{`
        @keyframes step-enter-up {
          from { opacity: 0; transform: translateY(28px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bubble-pop-in {
          from { opacity: 0; transform: scale(0.82) translateY(18px); }
          72% { opacity: 1; transform: scale(1.04) translateY(-2px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes bubble-select-pop {
          0% { transform: scale(1); }
          22% { transform: scale(0.94); }
          58% { transform: scale(1.05); }
          82% { transform: scale(0.985); }
          100% { transform: scale(1); }
        }
        @keyframes float-blob {
          0% { transform: translateY(0) translateX(0) scale(1); }
          50% { transform: translateY(-12px) translateX(8px) scale(1.05); }
          100% { transform: translateY(0) translateX(0) scale(1); }
        }
        @keyframes pulse-star {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.14); }
        }
        @keyframes referral-reveal {
          from { opacity: 0; transform: scale(0.84) translateY(12px); }
          72% { opacity: 1; transform: scale(1.04) translateY(-2px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes bank-fields-pop {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          70% { opacity: 1; transform: translateY(1px) scale(1.01); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div className={`flex justify-center ${stepKey === 'welcome' ? 'min-h-screen px-0 pt-0' : 'px-4 pt-6'}`}>
        <div className={`w-full ${stepKey === 'welcome' ? '' : 'max-w-md pb-10'}`}>
          {stepKey !== 'welcome' && stepKey !== 'success' && (
            <StepBar currentStep={currentVisibleStep} steps={visibleStepOrder.map((step, index) => ({ id: index + 1, label: step.label }))} />
          )}
          <div key={stepKey} style={{ animation: 'step-enter-up 250ms ease' }}>
            {stepKey === 'welcome' && (
              <div className="relative min-h-screen overflow-hidden px-6 py-10 text-white">
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute left-[-18px] top-8 h-28 w-28 rounded-full bg-white/14" style={{ animation: 'float-blob 6.2s ease-in-out infinite' }} />
                  <div className="absolute right-[-12px] top-16 h-24 w-24 rounded-full bg-[#DCEAFE]/18" style={{ animation: 'float-blob 7.1s ease-in-out infinite' }} />
                  <div className="absolute bottom-[-18px] left-16 h-32 w-32 rounded-full bg-white/10" style={{ animation: 'float-blob 8s ease-in-out infinite' }} />
                  <div className="absolute right-10 top-8 h-2.5 w-2.5 rounded-full bg-white/70" style={{ animation: 'pulse-star 3.1s ease-in-out infinite' }} />
                  <div className="absolute left-24 top-24 h-2 w-2 rounded-full bg-white/60" style={{ animation: 'pulse-star 2.7s ease-in-out infinite' }} />
                  <div className="absolute bottom-20 right-20 h-3 w-3 rounded-full bg-[#EAF4FF]/80" style={{ animation: 'pulse-star 3.4s ease-in-out infinite' }} />
                </div>
                <div className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-md flex-col justify-center">
                  <div className="mb-8 flex justify-center">
                    <Image
                      src={pawnlyWelcomeLogo}
                      alt="Pawnly"
                      priority
                      className="h-auto w-[180px]"
                    />
                  </div>
                  <div className="inline-flex w-fit rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/90">
                    Welcome To Pawnly
                  </div>
                  <h1 className="mt-4 text-3xl font-semibold leading-tight">เริ่มต้นเป็นสมาชิกนักลงทุนกับ Pawnly</h1>
                  <p className="mt-3 max-w-sm text-sm text-white/90">
                    เลือกเส้นทางที่เหมาะกับคุณก่อนเริ่มสมัครสมาชิก ระบบจะพาคุณไปทีละขั้นจนพร้อมเข้าสู่หน้าสมาชิก
                  </p>
                  <div className="mt-8 rounded-[26px] border border-white/20 bg-white/14 p-4 backdrop-blur-[1px]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/18 text-2xl">✦</div>
                      <div>
                        <div className="text-base font-medium">เส้นทางสมัครสมาชิกใหม่</div>
                        <div className="text-xs text-white/80">รองรับทั้งนักลงทุนทั่วไปและลูกค้า JUZMATCH</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {stepKey === 'referral' && (
              <div className="rounded-[32px] border border-[#D9E3F2] bg-gradient-to-br from-[#0F4FAE] via-[#2D69C7] to-[#8BB8F2] p-5 text-white shadow-[0_18px_45px_rgba(11,59,130,0.22)]">
                <div className="inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/90">
                  Referral Entry
                </div>
                <h2 className="mt-4 text-2xl font-semibold">คุณมี Referral code หรือไม่</h2>
                <p className="mt-2 text-sm text-white/85">หากมีรหัสจาก JUZMATCH หรือเพื่อน สามารถกรอกเพื่อกำหนดสิทธิ์และเส้นทางสมัครได้ทันที</p>
                <div className="mt-6 space-y-3">
                  {[
                    { value: true, title: 'มี Referral code', desc: 'ใช้สำหรับลูกค้า JUZMATCH หรือรหัสแนะนำจากเพื่อน' },
                    { value: false, title: 'ไม่มี Referral code', desc: 'สมัครเป็นนักลงทุนทั่วไปและดำเนินขั้นตอนมาตรฐาน' },
                  ].map((option) => (
                    <button
                      key={String(option.value)}
                      type="button"
                      onClick={() => setHasReferralCode(option.value)}
                      className={`w-full rounded-[24px] border px-4 py-4 text-left transition-all ${
                        hasReferralCode === option.value
                          ? 'border-white bg-white text-[#0B3B82] shadow-[0_10px_24px_rgba(11,59,130,0.18)]'
                          : 'border-white/25 bg-white/12 text-white'
                      }`}
                    >
                      <div className="text-base font-medium">{option.title}</div>
                      <div className={`mt-1 text-xs ${hasReferralCode === option.value ? 'text-[#5C76A6]' : 'text-white/78'}`}>{option.desc}</div>
                    </button>
                  ))}
                </div>
                {hasReferralCode && (
                  <div
                    className="mt-5 rounded-[24px] bg-white p-4 text-[#243B62] shadow-[0_10px_24px_rgba(11,59,130,0.18)]"
                    style={{ animation: 'referral-reveal 220ms ease' }}
                  >
                    <div className="text-sm font-medium">Referral code</div>
                    {/* <div className="mt-1 text-xs text-[#6F7E97]">ตัวอย่าง JUZMATCH: `JM260001` หรือรหัสเพื่อน: `FR260001`</div> */}
                    <input
                      type="text"
                      name="referralCode"
                      placeholder="AA260001"
                      value={formData.referralCode}
                      onChange={handleInputChange}
                      className="mt-3 w-full rounded-xl border border-[#CCD6E6] bg-white px-3 py-3 text-base text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-1 focus:ring-[#06367B]"
                    />
                    <div className={`mt-2 text-xs ${referralPreview.isValid ? 'text-[#1E4FA3]' : 'text-[#B42318]'}`}>
                      {referralPreview.isValid
                        ? referralPreview.source === 'JUZMATCH'
                          ? 'ตรวจพบรหัส JUZMATCH ระบบจะดึงข้อมูลที่ JUZMATCH บันทึกไว้มาแสดงแบบอัตโนมัติ'
                          : 'ตรวจพบรหัสแนะนำจากเพื่อน ระบบจะมอบสิทธิ์พิเศษที่คุณและเพื่อนจะได้รับเมื่อสมัครเสร็จ'
                        : ''}
                    </div>
                    {referralPreview.source === 'JUZMATCH' && referralPreview.isValid && (
                      <div className="mt-3 rounded-2xl border border-[#D9E3F2] bg-[#F4F8FD] px-3 py-3 text-xs text-[#5C76A6]">
                        รหัสนี้จะใช้ค้นหาข้อมูลนักลงทุนจาก JUZMATCH console ซึ่งทีมงาน JUZMATCH บันทึกไว้ล่วงหน้า แล้วนำมา Autofill ในขั้นตอนถัดไป
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {stepKey === 'details' && (
              <>
                <div className="rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 pb-0 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
                  <div className="mb-5 rounded-[24px] border border-white/80 bg-white/70 px-4 py-4">
                    <div className="inline-flex rounded-full border border-[#C8D6EC] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#5C76A6]">
                      {isJuzmatchReferral ? 'JUZMATCH Investor' : 'Investor Register'}
                    </div>
                    <div className="mt-3 bg-gradient-to-r from-[#0B3B82] via-[#1E4FA3] to-[#6D8FC8] bg-clip-text text-3xl font-semibold tracking-[0.08em] text-transparent">
                      {isJuzmatchReferral ? 'สมาชิกจาก JUZMATCH' : 'สมัครสมาชิก'}
                    </div>
                    <p className="mt-1 text-xs text-[#6F7E97]">
                      {isJuzmatchReferral ? 'ข้อมูลชุดนี้มาจาก JUZMATCH ด้วย referral code ที่คุณกรอกไว้ และไม่สามารถแก้ไขในหน้านี้ได้' : 'กรอกข้อมูลส่วนตัว ที่อยู่ และบัญชีธนาคารก่อนตั้งค่าการลงทุน'}
                    </p>
                    {/* {isJuzmatchReferral && (
                      <div className="mt-4 rounded-2xl border border-[#D9E3F2] bg-[#F4F8FD] px-4 py-3 text-xs text-[#5C76A6]">
                        ข้อมูลส่วนตัว ที่อยู่ บัญชีธนาคาร และวงเงินรวมในเส้นทางนี้ เป็นข้อมูลที่ JUZMATCH admin กรอกไว้ในระบบก่อนส่งรหัส `JMYYXXXX` ให้คุณ
                      </div>
                    )} */}
                  </div>

                  <div className="mb-2">
                    <h2 className="text-lg font-bold text-[#243B62]">Personal Information</h2>
                    <p className="text-xs text-[#6F7E97]">ข้อมูลส่วนตัว</p>
                  </div>
                  <div className="space-y-1">
                    {isJuzmatchReferral ? (
                      <>
                        <StaticInfoField labelEn="First name" labelTh="ชื่อจริง" value={activeFormData.firstname} />
                        <StaticInfoField labelEn="Last name" labelTh="นามสกุล" value={activeFormData.lastname} />
                        <StaticInfoField labelEn="Phone number" labelTh="เบอร์โทรศัพท์" value={activeFormData.phoneNumber} />
                        <StaticInfoField labelEn="ID" labelTh="เลขบัตรประชาชน 13 หลัก" value={activeFormData.nationalId} />
                      </>
                    ) : (
                      <>
                        <RegisterField labelEn="First name" labelTh="ชื่อจริง" placeholder="ชื่อจริง" name="firstname" value={formData.firstname} onChange={handleInputChange} />
                        <RegisterField labelEn="Last name" labelTh="นามสกุล" placeholder="นามสกุล" name="lastname" value={formData.lastname} onChange={handleInputChange} />
                        <RegisterField labelEn="Phone number" labelTh="เบอร์โทรศัพท์" placeholder="000-000-0000" name="phoneNumber" type="tel" value={formData.phoneNumber} onChange={handleInputChange} />
                        <RegisterField labelEn="ID" labelTh="เลขบัตรประชาชน 13 หลัก" placeholder="X-XXXX-XXXXX-XX-X" name="nationalId" value={formData.nationalId} onChange={handleInputChange} />
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 pb-0 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
                  <div className="mb-4">
                    <h2 className="text-lg font-bold text-[#243B62]">Address</h2>
                    <p className="text-xs text-[#6F7E97]">ที่อยู่</p>
                  </div>
                  <div className="space-y-1">
                    {isJuzmatchReferral ? (
                      <>
                        <StaticInfoField labelEn="Address (เลขที่)" labelTh="" value={activeFormData.address.houseNo} />
                        <StaticInfoField labelEn="Village/Building (หมู่บ้าน/อาคาร)" labelTh="" value={activeFormData.address.village} />
                        <StaticInfoField labelEn="Street (ตรอก/ซอย/ถนน)" labelTh="" value={activeFormData.address.street} />
                        <StaticInfoField labelEn="Sub-district (แขวง/ตำบล)" labelTh="" value={activeFormData.address.subDistrict} />
                        <StaticInfoField labelEn="District (เขต/อำเภอ)" labelTh="" value={activeFormData.address.district} />
                        <StaticInfoField labelEn="Province (จังหวัด)" labelTh="" value={activeFormData.address.province} />
                        <StaticInfoField labelEn="Country (ประเทศ)" labelTh="" value={activeFormData.address.country} />
                        <StaticInfoField labelEn="Postcode (รหัสไปรษณีย์)" labelTh="" value={activeFormData.address.postcode} />
                      </>
                    ) : (
                      [
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
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 pb-0 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
                  <div className="mb-4">
                    <h2 className="text-lg font-bold text-[#243B62]">Bank Account</h2>
                    <p className="text-xs text-[#6F7E97]">ข้อมูลบัญชีธนาคาร</p>
                  </div>
                  {isJuzmatchReferral ? (
                    <>
                      <div className="rounded-[24px] border border-[#D9E3F2] bg-white/80 px-4 py-4 shadow-[0_8px_18px_rgba(11,59,130,0.05)]">
                        <div className="inline-flex rounded-full border border-[#CFE0F5] bg-[#F4F8FD] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#5C76A6]">
                          JUZMATCH Pool
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[#42597D]">
                          บัญชีลงทุนหลักของคุณมีเงิน Escrow หรือวงเงินที่ถืออยู่ใน JUZMATCH Pool อยู่แล้ว หากต้องการเพิ่มวงเงินลงทุนให้มากกว่ายอดใน Pool คุณสามารถเพิ่มบัญชีส่วนตัวไว้ล่วงหน้าได้
                        </p>
                        {/* <p className="mt-2 text-xs leading-5 text-[#6F7E97]">
                          บัญชีนี้เป็นตัวเลือกเพิ่มเติม ระบบจะใช้ JUZMATCH Pool ก่อน และเมื่อ Pool ไม่พอ ระบบจะสลับไปใช้บัญชีส่วนตัวพร้อมแจ้งให้คุณโอนเงินเข้าดีลนั้นด้วยตนเอง หากยังไม่ต้องการเพิ่มตอนนี้ คุณสามารถกลับมาเพิ่มภายหลังได้ในหน้าแก้ไขข้อมูลสมาชิก
                        </p> */}
                      </div>

                      <button
                        type="button"
                        onClick={() => setAddPersonalBankAccount((prev) => !prev)}
                        className={`mt-4 flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left transition-all ${
                          addPersonalBankAccount
                            ? 'border-[#1E4FA3] bg-white shadow-[0_10px_22px_rgba(11,59,130,0.08)]'
                            : 'border-[#D9E3F2] bg-white/70'
                        }`}
                        aria-pressed={addPersonalBankAccount}
                      >
                        <div>
                          <div className="text-sm font-semibold text-[#243B62]">เพิ่มบัญชีส่วนตัว</div>
                          <div className="mt-1 text-xs text-[#6F7E97]">
                            ตัวเลือกเสริมสำหรับนักลงทุนที่ต้องการใช้วงเงินเกินจาก JUZMATCH Pool
                          </div>
                        </div>
                        <div className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors ${addPersonalBankAccount ? 'justify-end bg-[#1E4FA3]' : 'justify-start bg-[#D5DDE9]'}`}>
                          <span className="h-5 w-5 rounded-full bg-white transition-transform" />
                        </div>
                      </button>

                      <div className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-250 ease-in-out ${addPersonalBankAccount ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                        <div className="min-h-0">
                          <div className="space-y-1" style={addPersonalBankAccount ? { animation: 'bank-fields-pop 250ms ease' } : undefined}>
                            <DropdownField labelEn="Bank name" labelTh="ชื่อธนาคาร" name="bank_bankName" value={formData.bankInfo.bankName} placeholder="เลือกธนาคาร" options={BANKS} onChange={handleInputChange} />
                            <RegisterField labelEn="Account no." labelTh="หมายเลขบัญชี" placeholder="0000000000" name="bank_accountNo" type="tel" value={formData.bankInfo.accountNo} onChange={handleInputChange} />
                            <DropdownField labelEn="Account type" labelTh="ประเภทบัญชี" name="bank_accountType" value={formData.bankInfo.accountType} placeholder="เลือกประเภทบัญชี" options={ACCOUNT_TYPE_OPTIONS} onChange={handleInputChange} />
                            <RegisterField labelEn="Account name" labelTh="ชื่อบัญชี" placeholder="ชื่อ-นามสกุลเจ้าของบัญชี" name="bank_accountName" value={formData.bankInfo.accountName} onChange={handleInputChange} />
                            <div className="pb-4 text-xs text-[#6F7E97]">
                              ไม่บังคับเพิ่มบัญชีส่วนตัว แต่หากเปิดใช้งาน กรุณากรอกข้อมูลให้ครบถ้วน หรือจะข้ามไปก่อนแล้วค่อยมาเพิ่มภายหลังที่หน้าแก้ไขข้อมูลสมาชิกก็ได้
                            </div>
                          </div>
                        </div>
                      </div>
                      {!addPersonalBankAccount && (
                        <div className="my-4 rounded-[22px] border border-dashed border-[#C8D6EC] bg-white/75 px-4 py-4 text-sm text-[#5C76A6]">
                          ระบบจะใช้เงินใน JUZMATCH Pool ของคุณเป็นแหล่งวงเงินหลักก่อน โดยยังไม่จำเป็นต้องเพิ่มบัญชีส่วนตัวในขั้นตอนนี้ และคุณสามารถเพิ่มภายหลังได้ที่หน้าแก้ไขข้อมูลสมาชิก
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <DropdownField labelEn="Bank name" labelTh="ชื่อธนาคาร" name="bank_bankName" value={formData.bankInfo.bankName} placeholder="เลือกธนาคาร" options={BANKS} onChange={handleInputChange} />
                      <RegisterField labelEn="Account no." labelTh="หมายเลขบัญชี" placeholder="0000000000" name="bank_accountNo" type="tel" value={formData.bankInfo.accountNo} onChange={handleInputChange} />
                      <DropdownField labelEn="Account type" labelTh="ประเภทบัญชี" name="bank_accountType" value={formData.bankInfo.accountType} placeholder="เลือกประเภทบัญชี" options={ACCOUNT_TYPE_OPTIONS} onChange={handleInputChange} />
                      <RegisterField labelEn="Account name" labelTh="ชื่อบัญชี" placeholder="ชื่อ-นามสกุลเจ้าของบัญชี" name="bank_accountName" value={formData.bankInfo.accountName} onChange={handleInputChange} />
                    </>
                  )}
                </div>
              </>
            )}

            {stepKey === 'preferences' && (
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

            {stepKey === 'limits' && (
              <div className="rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
                <div className="mb-4">
                  <h2 className="text-2xl font-semibold text-[#243B62]">กำหนดวงเงินลงทุน</h2>
                  <p className="mt-1 text-sm text-[#6F7E97]">
                    {isJuzmatchReferral ? 'วงเงินรวมจะถูกดึงจากข้อมูล JUZMATCH และคุณสามารถกำหนดวงเงินรายหมวดหมู่ได้' : 'ระบุวงเงินรวมและวงเงินรายหมวดหมู่สำหรับรายการที่เลือกไว้'}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#D9E3F2] bg-white/80 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-base font-semibold text-gray-800">วงเงินรวม <span className="text-[#D92D20]">*</span></div>
                    <span className="text-sm text-gray-500">บาท</span>
                  </div>
                  <input
                    type="text"
                    value={totalLimitInput}
                    onChange={(e) => setTotalLimitInput(formatAmount(Math.min(parseAmountInput(e.target.value), MAX_CREDIT_LIMIT)))}
                    disabled={isJuzmatchReferral}
                    placeholder="100,000"
                    className="w-full rounded-xl border border-[#CCD6E6] bg-white px-3 py-3 text-center text-xl text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-1 focus:ring-[#06367B] disabled:bg-[#F3F6FB] disabled:text-[#6F7E97]"
                  />
                  <div className="mt-2 text-xs text-[#6F7E97]">สูงสุดไม่เกิน 1,000,000 บาท</div>
                  {isJuzmatchReferral && (
                    <div className="mt-2 text-xs text-[#6F7E97]">สำหรับลูกค้า JUZMATCH ระบบล็อกวงเงินรวมตามยอดในสัญญากระดาษจริงไว้แล้ว</div>
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

            {stepKey === 'ekyc' && (
              <div className="rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-5 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
                <div className="inline-flex rounded-full border border-[#C8D6EC] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#5C76A6]">
                  eKYC Preparation
                </div>
                <h2 className="mt-4 text-2xl font-semibold text-[#243B62]">เตรียมตัวก่อนยืนยันตัวตน</h2>
                <p className="mt-2 text-sm text-[#6F7E97]">ก่อนเข้าใช้งานเต็มรูปแบบ กรุณาเตรียมเอกสารและอุปกรณ์ให้พร้อมสำหรับ eKYC</p>
                <div className="mt-6 space-y-3">
                  {[
                    'บัตรประชาชนตัวจริงที่ยังไม่หมดอายุ',
                    'มือถือที่มีกล้องพร้อมถ่ายภาพใบหน้าและเอกสาร',
                    'แสงสว่างเพียงพอ และเครือข่ายอินเทอร์เน็ตที่เสถียร',
                    'เวลาทำรายการประมาณ 3-5 นาที',
                  ].map((item) => (
                    <div key={item} className="rounded-2xl border border-white/90 bg-white/80 px-4 py-3 text-sm text-[#35507A] shadow-[0_8px_18px_rgba(11,59,130,0.05)]">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stepKey === 'success' && (
              <div className="rounded-[32px] border border-[#D9E3F2] bg-gradient-to-br from-[#0F4FAE] via-[#2D69C7] to-[#8BB8F2] p-6 text-white shadow-[0_18px_45px_rgba(11,59,130,0.22)]">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/30 bg-white/15 text-4xl">
                  ✓
                </div>
                <h2 className="mt-5 text-center text-2xl font-semibold">
                  สมัครสมาชิกสำเร็จ
                </h2>
                <p className="mt-2 text-center text-sm text-white/85">
                  {isJuzmatchReferral
                    ? 'เราได้รับข้อมูลของคุณแล้ว กรุณารอการตรวจสอบ eKYC โดยปกติใช้เวลาประมาณ 1-3 วันทำการ หลังผ่านการยืนยันแล้ว JUZMATCH Pool จะแสดงในหน้าสมาชิก'
                    : 'เราได้รับข้อมูลของคุณแล้ว กรุณารอการตรวจสอบ eKYC โดยปกติใช้เวลาประมาณ 1-3 วันทำการ'}
                </p>
                <div className="mt-6 rounded-[24px] border border-white/20 bg-white/12 p-4">
                  <div className="text-sm font-medium">สถานะล่าสุด</div>
                  <div className="mt-2 text-xs text-white/80">
                    {isJuzmatchReferral
                      ? `รหัส ${formData.referralCode} ถูกผูกกับบัญชีแล้ว • สถานะยืนยันตัวตน: ${completedInvestor?.kyc_status || 'NOT_VERIFIED'}`
                      : `สถานะยืนยันตัวตน: ${completedInvestor?.kyc_status || 'NOT_VERIFIED'}`}
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <div className="my-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          <div className={`${stepKey === 'welcome' ? 'mx-auto mt-[-96px] w-full max-w-md px-6 pb-10' : 'my-4'}`}>
            {stepKey !== 'success' && (
              <button
                onClick={() => {
                  if (stepKey === 'welcome') goNext();
                  else if (stepKey === 'referral') goNext();
                  else if (stepKey === 'details') goNext();
                  else if (stepKey === 'preferences') goNext();
                  else if (stepKey === 'limits') goNext();
                  else if (stepKey === 'ekyc') {
                    const submission = buildRegistrationSubmission();
                    if (submission) handleStartEkyc(submission);
                  }
                }}
                disabled={
                  submitting ||
                  (stepKey === 'referral' && !isReferralStepValid) ||
                  (stepKey === 'details' && !isDetailsStepValid) ||
                  (stepKey === 'preferences' && selectedPreferenceKeys.length === 0) ||
                  (stepKey === 'limits' && !isLimitsStepValid)
                }
                className={`flex w-full flex-col items-center justify-center rounded-full py-2 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
                  stepKey === 'welcome'
                    ? 'bg-white text-[#0B3B82]'
                    : 'bg-gradient-to-r from-[#1E4FA3] to-[#0B3B82] text-white'
                }`}
              >
                <span className="text-base font-medium">
                  {submitting ? 'กำลังบันทึก...' : stepKey === 'ekyc' ? 'เริ่มดำเนินการยืนยันตัวตน' : 'ถัดไป'}
                </span>
                {!submitting && <span className="text-xs font-light opacity-80">Next</span>}
              </button>
            )}

            {stepKey === 'success' && completedInvestor && (
              <button
                type="button"
                onClick={() => onRegistered(completedInvestor)}
                className="flex w-full flex-col items-center justify-center rounded-full bg-gradient-to-r from-[#1E4FA3] to-[#0B3B82] py-2 text-white transition-all active:scale-[0.98]"
              >
                <span className="text-base font-medium">เข้าสู่หน้าสมาชิก</span>
                <span className="text-xs font-light opacity-90">Go to Member Page</span>
              </button>
            )}

            {currentStepIndex > 0 && stepKey !== 'success' && stepKey !== 'referral' && (
              <button type="button" onClick={goBack} className="mt-2 flex w-full flex-col items-center justify-center rounded-full bg-[#E6EBF2] py-2 text-[#06367B] transition-colors active:scale-[0.98]">
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
