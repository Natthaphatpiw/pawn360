'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { isMockMode, loadMockInvestor, updateMockInvestor } from '@/lib/mock-investor';

interface InvestorData {
  investor_id: string;
  investor_tier?: string | null;
  total_active_principal?: number | null;
  max_investment_amount?: number | null;
  referral_code?: string | null;
  auto_invest_enabled?: boolean | null;
  auto_liquidation_enabled?: boolean | null;
  investment_preferences?: any;
  phone_number?: string | null;
  addr_house_no?: string | null;
  addr_village?: string | null;
  addr_street?: string | null;
  addr_sub_district?: string | null;
  addr_district?: string | null;
  addr_province?: string | null;
  addr_postcode?: string | null;
  bank_name?: string | null;
  bank_account_no?: string | null;
  bank_account_type?: string | null;
  bank_account_name?: string | null;
}

type PreferenceState = Record<string, { enabled: boolean; sub: string[]; limitAmount: string }>;

type PreferenceCategory = {
  key: string;
  labelTh: string;
  labelEn: string;
  subLabelTh: string;
  subLabelEn: string;
  options: string[];
};

const CATEGORY_OPTIONS: PreferenceCategory[] = [
  {
    key: 'Apple',
    labelTh: 'สินค้า Apple',
    labelEn: 'Apple products',
    subLabelTh: 'ประเภท',
    subLabelEn: 'Category',
    options: ['iPhone', 'iPad', 'MacBook', 'Apple Watch', 'AirPods', 'iMac', 'Mac mini', 'Mac Studio', 'Mac Pro'],
  },
  {
    key: 'โทรศัพท์มือถือ',
    labelTh: 'โทรศัพท์มือถือ',
    labelEn: 'Mobile',
    subLabelTh: 'ยี่ห้อ',
    subLabelEn: 'Brand',
    options: ['Samsung', 'Huawei', 'Xiaomi', 'OPPO', 'Vivo', 'Realme', 'OnePlus', 'Google', 'Sony', 'Nokia', 'ASUS', 'อื่นๆ'],
  },
  {
    key: 'โน้ตบุค',
    labelTh: 'คอมพิวเตอร์โน้ตบุ๊ค',
    labelEn: 'Computer laptop',
    subLabelTh: 'ยี่ห้อ',
    subLabelEn: 'Brand',
    options: ['Dell', 'HP', 'Lenovo', 'ASUS', 'Acer', 'MSI', 'Samsung', 'Microsoft', 'Razer', 'อื่นๆ'],
  },
  {
    key: 'กล้อง',
    labelTh: 'กล้องถ่ายรูป',
    labelEn: 'Camera',
    subLabelTh: 'ยี่ห้อ',
    subLabelEn: 'Brand',
    options: ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Panasonic', 'GoPro', 'DJI', 'อื่นๆ'],
  },
  {
    key: 'อุปกรณ์เสริมโทรศัพท์',
    labelTh: 'อุปกรณ์เสริมโทรศัพท์มือถือ',
    labelEn: 'Mobile accessory',
    subLabelTh: 'ยี่ห้อ',
    subLabelEn: 'Brand',
    options: ['Apple', 'Samsung', 'Anker', 'Baseus', 'Belkin', 'JBL', 'Sony', 'อื่นๆ'],
  },
];

const TIER_THRESHOLDS = {
  GOLD: 400000,
  PLATINUM: 1000000,
};

const TIER_LABELS: Record<string, string> = {
  SILVER: 'Silver',
  GOLD: 'Gold',
  PLATINUM: 'Platinum',
};

const MAX_CREDIT_LIMIT = 1_000_000;

const classifyReferralCode = (value: string | null | undefined) => {
  const code = String(value || '').trim().toUpperCase();
  const match = code.match(/^([A-Z]{2})(\d{2})([A-Z0-9]{4})$/);
  if (!match) return { code, source: 'UNKNOWN' as const, isValid: false };
  const source = match[1] === 'JM' ? 'JUZMATCH' : match[1] === 'FR' ? 'FRIEND' : 'UNKNOWN';
  return { code, source, isValid: source !== 'UNKNOWN' };
};

const buildDefaultPreferences = () => {
  const base: PreferenceState = {};
  CATEGORY_OPTIONS.forEach((category) => {
    base[category.key] = { enabled: false, sub: [], limitAmount: '' };
  });
  return base;
};

const formatAmount = (value: string | number) => {
  const digits = String(value).replace(/[^0-9]/g, '');
  return digits.length ? Math.min(Number(digits), MAX_CREDIT_LIMIT).toLocaleString('en-US') : '';
};

const normalizePreferences = (raw: any): PreferenceState => {
  const base = buildDefaultPreferences();
  if (!raw || typeof raw !== 'object') return base;
  const source = raw.categories && typeof raw.categories === 'object' ? raw.categories : raw;

  Object.keys(base).forEach((key) => {
    const entry = source?.[key];
    if (!entry) return;
    const sub = Array.isArray(entry.sub)
      ? entry.sub.filter((value: unknown): value is string => typeof value === 'string')
      : [];
    const enabled = typeof entry.enabled === 'boolean' ? entry.enabled : sub.length > 0;
    const rawAmount = entry.limitAmount ?? entry.amount ?? entry.limit_amount;
    const limitAmount = typeof rawAmount === 'number'
      ? formatAmount(rawAmount)
      : typeof rawAmount === 'string'
      ? formatAmount(rawAmount)
      : '';
    base[key] = { enabled, sub, limitAmount };
  });

  return base;
};

export default function CreditLimitPage() {
  const router = useRouter();
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState<InvestorData | null>(null);
  const [limitInput, setLimitInput] = useState('');
  const [preferences, setPreferences] = useState<PreferenceState>(() => buildDefaultPreferences());
  const [autoMatchEnabled, setAutoMatchEnabled] = useState(false);
  const [autoLiquidationEnabled, setAutoLiquidationEnabled] = useState(false);
  const [autoMatchInfoOpen, setAutoMatchInfoOpen] = useState(false);
  const [liquidationInfoOpen, setLiquidationInfoOpen] = useState(false);
  const [returnAddressMode, setReturnAddressMode] = useState<'registered' | 'custom'>('registered');
  const [returnAddress, setReturnAddress] = useState({
    houseNo: '',
    village: '',
    street: '',
    subDistrict: '',
    district: '',
    province: '',
    postcode: '',
  });
  const [returnContactPhone, setReturnContactPhone] = useState('');
  const [saving, setSaving] = useState(false);
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

    const fetchInvestor = async () => {

      // ── Mock data for UI preview ──
      // ----------------------------------------------------
      if (process.env.NEXT_PUBLIC_LIFF_MOCK === 'true') {
        const mockData = loadMockInvestor();
        setInvestor(mockData);
        setLimitInput(formatAmount(mockData.max_investment_amount || 0));
        setLoading(false);
        return;
      }
      // ----------------------------------------------------

      try {
        setLoading(true);
        const response = await axios.get(`/api/investors/check?lineId=${profile.userId}`);
        if (response.data.exists) {
          const data = response.data.investor;
          setInvestor(data);
          const currentLimit = data?.max_investment_amount || 0;
          const normalized = normalizePreferences(data?.investment_preferences);
          setPreferences(normalized);
          setLimitInput(formatAmount(currentLimit));
          setAutoMatchEnabled(!!data?.auto_invest_enabled);
          setAutoLiquidationEnabled(!!data?.auto_liquidation_enabled);
          const returnDelivery = data?.investment_preferences?.return_delivery;
          if (returnDelivery?.mode === 'custom') {
            setReturnAddressMode('custom');
            if (returnDelivery.address) {
              setReturnAddress({
                houseNo: returnDelivery.address.houseNo || '',
                village: returnDelivery.address.village || '',
                street: returnDelivery.address.street || '',
                subDistrict: returnDelivery.address.subDistrict || '',
                district: returnDelivery.address.district || '',
                province: returnDelivery.address.province || '',
                postcode: returnDelivery.address.postcode || '',
              });
            }
          } else {
            setReturnAddressMode('registered');
          }
          setReturnContactPhone(returnDelivery?.phone || data?.phone_number || '');
        } else {
          setError('ไม่พบข้อมูลผู้ลงทุน');
        }
      } catch (fetchError: any) {
        console.error('Error fetching investor:', fetchError);
        setError('ไม่สามารถโหลดข้อมูลได้');
      } finally {
        setLoading(false);
      }
    };

    fetchInvestor();
  }, [liffLoading, liffError, profile?.userId]);

  const tier = useMemo(() => (investor?.investor_tier || 'SILVER').toUpperCase(), [investor]);
  const tierLabel = TIER_LABELS[tier] || tier;
  const totalActive = Number(investor?.total_active_principal || 0);
  const autoMatchAllowed = tier === 'GOLD' || tier === 'PLATINUM';
  const nextTarget = tier === 'SILVER' ? TIER_THRESHOLDS.GOLD : tier === 'GOLD' ? TIER_THRESHOLDS.PLATINUM : null;
  const remainingToNext = nextTarget ? Math.max(0, nextTarget - totalActive) : 0;
  const registeredAddressLabel = useMemo(() => {
    if (!investor) return '-';
    const parts = [
      investor.addr_house_no,
      investor.addr_village,
      investor.addr_street,
      investor.addr_sub_district,
      investor.addr_district,
      investor.addr_province,
      investor.addr_postcode,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '-';
  }, [investor]);

  const parseAmount = (value: string) => {
    const digits = value.replace(/[^0-9]/g, '');
    return digits.length ? Math.min(Number(digits), MAX_CREDIT_LIMIT) : 0;
  };

  const getTotalCategoryLimit = (prefs: PreferenceState) => {
    return Object.values(prefs).reduce((sum, entry) => {
      const isEnabled = entry.enabled || entry.sub.length > 0;
      if (!isEnabled) return sum;
      return sum + parseAmount(entry.limitAmount);
    }, 0);
  };

  const totalLimit = parseAmount(limitInput);
  const totalCategorySum = getTotalCategoryLimit(preferences);
  const hasSelectedCategory = Object.values(preferences).some((entry) => entry.enabled || entry.sub.length > 0);

  const toggleCategory = (key: string) => {
    setPreferences((prev) => {
      const next = { ...prev };
      const current = next[key] || { enabled: false, sub: [], limitAmount: '' };
      const enabled = !current.enabled;
      next[key] = {
        enabled,
        sub: enabled ? current.sub : [],
        limitAmount: current.limitAmount || '',
      };
      return next;
    });
  };

  const toggleSubOption = (key: string, option: string) => {
    setPreferences((prev) => {
      const next = { ...prev };
      const current = next[key] || { enabled: false, sub: [], limitAmount: '' };
      const exists = current.sub.includes(option);
      const sub = exists
        ? current.sub.filter((value) => value !== option)
        : [...current.sub, option];
      next[key] = {
        enabled: true,
        sub,
        limitAmount: current.limitAmount || '',
      };
      return next;
    });
  };

  const setCategoryLimitAmount = (key: string, value: string) => {
    setPreferences((prev) => {
      const next = { ...prev };
      const current = next[key] || { enabled: false, sub: [], limitAmount: '' };
      const otherTotal = getTotalCategoryLimit(prev) - parseAmount(current.limitAmount);
      const parsed = parseAmount(value);
      const maxAllowed = totalLimit > 0 ? Math.max(totalLimit - otherTotal, 0) : parsed;
      next[key] = {
        ...current,
        limitAmount: formatAmount(parsed > maxAllowed ? maxAllowed : value),
      };
      return next;
    });
  };

  const handleSave = async () => {
    if (!profile?.userId) return;
    const effectivePreferences = hasSelectedCategory ? preferences : {};
    const categoryTotal = getTotalCategoryLimit(effectivePreferences);
    const parsed = parseAmount(limitInput);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError('กรุณากรอกวงเงินให้ถูกต้อง');
      return;
    }
    if (categoryTotal > 0 && categoryTotal > parsed) {
      setError('ยอดรวมวงเงินหมวดหมู่ต้องไม่เกินวงเงินรวม');
      return;
    }
    if (!autoLiquidationEnabled) {
      if (returnAddressMode === 'registered') {
        const hasRegistered = Boolean(
          investor?.addr_house_no ||
          investor?.addr_street ||
          investor?.addr_district ||
          investor?.addr_province ||
          investor?.addr_postcode
        );
        if (!hasRegistered) {
          setError('ไม่พบที่อยู่ที่ลงทะเบียนไว้ กรุณาใส่ที่อยู่อื่นสำหรับการจัดส่ง');
          return;
        }
      } else {
        if (!returnAddress.houseNo || !returnAddress.district || !returnAddress.province) {
          setError('กรุณากรอกที่อยู่สำหรับจัดส่งให้ครบถ้วน');
          return;
        }
      }
    }

    const returnDelivery = autoLiquidationEnabled ? null : {
      mode: returnAddressMode,
      address: returnAddressMode === 'custom' ? returnAddress : null,
      phone: returnContactPhone || investor?.phone_number || '',
    };

    if (process.env.NEXT_PUBLIC_LIFF_MOCK === 'true') {
      setSaving(true);
      setError(null);
      const updatedInvestor = updateMockInvestor({
        max_investment_amount: parsed,
        investment_preferences: {
          categories: effectivePreferences,
          return_delivery: returnDelivery,
        },
        auto_invest_enabled: autoMatchEnabled,
        auto_liquidation_enabled: autoLiquidationEnabled,
      });
      setInvestor(updatedInvestor);
      alert('บันทึกสำเร็จ');
      router.push('/register-invest');
      setSaving(false);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const response = await axios.put('/api/investors/credit-limit', {
        lineId: profile.userId,
        maxInvestmentAmount: parsed,
        preferences: {
          categories: effectivePreferences,
          return_delivery: returnDelivery,
        },
        autoMatchEnabled,
        autoLiquidationEnabled,
      });
      if (response.data.success) {
        const updatedInvestor = response.data.investor || (investor ? { ...investor, max_investment_amount: parsed } : null);
        if (updatedInvestor) {
          setInvestor(updatedInvestor);
          if (isMockMode()) {
            updateMockInvestor({
              max_investment_amount: parsed,
              investment_preferences: {
                categories: effectivePreferences,
                return_delivery: returnDelivery,
              },
              auto_invest_enabled: autoMatchEnabled,
              auto_liquidation_enabled: autoLiquidationEnabled,
            });
          }
        }
        alert('บันทึกสำเร็จ');
        router.push('/register-invest');
      }
    } catch (saveError: any) {
      console.error('Error saving investment settings:', saveError);
      const payload = saveError.response?.data;
      if (payload?.remainingAmount) {
        setError(`ยังไม่สามารถเปิด Auto matching ได้ ต้องเพิ่มยอดสัญญาอีก ${Number(payload.remainingAmount).toLocaleString()} บาท`);
      } else {
        setError(payload?.error || 'ไม่สามารถบันทึกได้');
      }
    } finally {
      setSaving(false);
    }
  };

  if (liffLoading || loading) {
    return (
      <div className="page-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks"></div>
      </div>
    );
  }

  if (error && !investor) {
    return (
      <div className="min-h-screen bg-background-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-error mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="register-primary-btn rounded-lg px-6 py-3"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  const currentLimit = investor?.max_investment_amount || 0;
  const referral = classifyReferralCode(
    investor?.referral_code
      ?? investor?.investment_preferences?.referral?.code
      ?? investor?.investment_preferences?.referral_code
  );
  const isJuzmatchInvestor = referral.source === 'JUZMATCH' && referral.isValid;
  const storedPoolAmount = Number(
    investor?.investment_preferences?.juzmatch_pool_amount
    ?? investor?.investment_preferences?.juzmatchPoolAmount
    ?? investor?.investment_preferences?.pool_amount
    ?? 0
  );
  const juzmatchPoolAmount = isJuzmatchInvestor
    ? Math.min(MAX_CREDIT_LIMIT, storedPoolAmount > 0 ? storedPoolAmount : currentLimit)
    : 0;
  const topUpAmount = isJuzmatchInvestor ? Math.max(0, totalLimit - juzmatchPoolAmount) : 0;
  const poolFirstCoverage = isJuzmatchInvestor ? Math.min(totalLimit, juzmatchPoolAmount) : 0;
  const hasPersonalBankAccount = Boolean(
    investor?.bank_name ||
    investor?.bank_account_no ||
    investor?.bank_account_name
  );

  return (
    <div className="min-h-screen bg-background-white font-sans text-foreground">
      <div className="px-4 pt-6 flex justify-center">
        <div className="w-full max-w-md pb-10 space-y-4">
          <div className="register-shell rounded-xl p-4">
            <div className="register-inner-card mb-5 rounded-lg px-4 py-4">
              <div className="register-pill inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]">
                Configure Investment
              </div>
              <div className="register-title mt-3 text-3xl font-semibold tracking-[0.08em]">
                ตั้งค่าการลงทุน
              </div>
              <p className="register-subtle mt-1 text-xs">กำหนดวงเงินรวม วงเงินรายหมวดหมู่ และการจัดการคำขออัตโนมัติ</p>
            </div>

            <div className="register-inner-card rounded-lg p-4 text-center">
              <h2 className="register-accent mb-1 text-lg font-medium">วงเงินปัจจุบัน</h2>
              <div className="register-accent text-2xl font-bold">{currentLimit.toLocaleString()}</div>
            </div>
          </div>

          <div className="register-shell rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-foreground font-semibold text-base">วงเงินใหม่</span>
              <span className="register-pill rounded-full px-3 py-1 text-xs">
                New credit limit
              </span>
            </div>
            <span className="text-foreground-subtle text-sm">บาท</span>
          </div>

          <input
            type="text"
            value={limitInput}
            onChange={(e) => setLimitInput(formatAmount(e.target.value))}
            placeholder="100,000"
            className="register-input w-full rounded-xl px-3 py-3 text-center text-xl"
          />
          <div className="register-subtle mt-2 text-xs">สูงสุดไม่เกิน 1,000,000 บาท</div>
          {isJuzmatchInvestor && (
            <div className="register-panel mt-3 rounded-[20px] px-4 py-4 text-sm text-foreground-muted">
              <div className="register-heading font-semibold">การใช้วงเงินสำหรับลูกค้า JUZMATCH</div>
              <p className="mt-2 leading-6">
                คุณสามารถตั้งวงเงินรวมมากกว่ายอดใน JUZMATCH Pool ได้ ระบบจะใช้วงเงินจาก Pool ก่อนเสมอ และหากวงเงินรวมสูงกว่า Pool ระบบจะสลับไปใช้บัญชีส่วนตัวของคุณโดยอัตโนมัติ
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="register-panel rounded-lg px-3 py-3">
                  <div className="register-subtle">ยอดใน JUZMATCH Pool</div>
                  <div className="register-accent mt-1 text-base font-semibold">{juzmatchPoolAmount.toLocaleString()} บาท</div>
                </div>
                <div className="register-panel rounded-lg px-3 py-3">
                  <div className="register-subtle">วงเงินจากบัญชีส่วนตัว</div>
                  <div className="register-accent mt-1 text-base font-semibold">{topUpAmount.toLocaleString()} บาท</div>
                </div>
              </div>
              {topUpAmount > 0 && (
                <div className="register-surface rounded-xl mt-3 px-3 py-3 text-xs leading-5 register-accent-soft border border-s2-border">
                  ระบบจะหักจาก JUZMATCH Pool ก่อนจำนวน {poolFirstCoverage.toLocaleString()} บาท และเมื่อ Pool ใช้ครบแล้ว จะสลับไปยังบัญชีส่วนตัว{hasPersonalBankAccount ? 'ที่บันทึกไว้' : ''}อีก {topUpAmount.toLocaleString()} บาท พร้อมแจ้งให้คุณโอนเงินเข้าหาผู้จำนำในดีลนั้นด้วยตนเอง
                </div>
              )}
            </div>
          )}
          </div>

          <div className="register-shell rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-base text-foreground font-semibold">ยอดรวมวงเงินจากหมวดหมู่</div>
            <span className="text-sm text-foreground-subtle">บาท</span>
          </div>
          <input
            type="text"
            value={totalCategorySum.toLocaleString()}
            readOnly
            className="register-input w-full rounded-xl px-3 py-3 text-center text-xl text-foreground-muted focus:ring-0"
          />
          {totalLimit > 0 && totalCategorySum > totalLimit && (
            <p className="mt-2 text-xs text-error">ยอดรวมหมวดหมู่เกินวงเงินรวมแล้ว กรุณาปรับแก้</p>
          )}
          </div>

          <div className="register-shell rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-foreground font-bold text-lg">สินค้าที่ต้องการ</span>
            <span className="register-pill rounded-full px-3 py-1 text-xs">Item preferences</span>
          </div>

          <div className="space-y-3">
            {!hasSelectedCategory && (
              <div className="register-panel rounded-lg border-dashed px-4 py-3 text-sm register-accent-soft">
                หากไม่เลือกหมวดหมู่ ระบบจะเปิดรับทุกข้อเสนอและใช้วงเงินรวมก้อนเดียว โดยไม่แยกวงเงินตามหมวดหมู่
              </div>
            )}
            {CATEGORY_OPTIONS.map((category) => {
              const entry = preferences[category.key] || { enabled: false, sub: [], limitAmount: '' };
              const isEnabled = entry.enabled || entry.sub.length > 0;
              const categoryAmount = parseAmount(entry.limitAmount);
              const remainingForCategory = totalLimit > 0
                ? Math.max(0, totalLimit - (totalCategorySum - categoryAmount))
                : 0;
              const exceedsNewLimit = isEnabled && totalLimit > 0 && categoryAmount > remainingForCategory;
              const noCreditLeft = isEnabled && totalLimit > 0 && remainingForCategory <= 0;
              const showLimitWarning = exceedsNewLimit || noCreditLeft;
              return (
                <div
                  key={category.key}
                  className={`rounded-lg border p-4 transition-colors ${
                    showLimitWarning
                      ? 'border-error-border bg-error-soft'
                      : isEnabled
                      ? 'border-s2/80 register-surface-strong'
                      : 'border-s2-border bg-background-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-foreground">{category.labelTh}</div>
                      <div className="text-xs text-foreground-subtle">{category.labelEn}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCategory(category.key)}
                      className={`h-6 w-11 rounded-full p-1 transition-colors bg-background-subtle ${isEnabled ? 'bg-s2-active' : 'bg-line-soft'}`}
                      aria-pressed={isEnabled}
                    >
                      <span
                        className={`block h-4 w-4 rounded-full bg-background-white transition-transform ${isEnabled ? 'translate-x-5' : ''}`}
                      ></span>
                    </button>
                  </div>

                  <div className="mt-3 text-[10px] text-foreground-subtle">
                    เลือกย่อย ({category.subLabelTh} / {category.subLabelEn}) หากไม่เลือกย่อย = ทั้งหมด
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {category.options.map((option) => {
                      const selected = entry.sub.includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleSubOption(category.key, option)}
                          className={`px-3 py-1 rounded-full text-xs border transition-colors bg-background-subtle ${selected ? 'register-chip-selected' : 'register-chip-unselected'}`}
                          aria-pressed={selected}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>

                  {isEnabled && (
                    <div className="mt-4">
                      <label className="text-sm font-medium text-foreground-muted">วงเงินสำหรับหมวดนี้</label>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9,]*"
                          value={entry.limitAmount}
                          onChange={(e) => setCategoryLimitAmount(category.key, e.target.value)}
                          placeholder="0"
                          className={`w-full rounded-xl px-4 py-3 text-sm ${showLimitWarning ? 'border-error-border bg-background-white text-foreground focus:outline-none focus:ring-1 focus:ring-error' : 'register-input'}`}
                        />
                        <span className="text-sm text-foreground-subtle">บาท</span>
                      </div>
                      <div className={`mt-2 text-xs ${showLimitWarning ? 'text-error' : 'text-foreground-subtle'}`}>
                        {totalLimit > 0 ? `เหลืออีก ${remainingForCategory.toLocaleString()} บาท สำหรับหมวดนี้` : 'กรุณากรอกวงเงินรวมก่อนเพื่อดูยอดที่เหลือ'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>

          <div className="register-shell rounded-xl p-4 space-y-2">
          <div
            className={`cursor-pointer rounded-lg border px-4 py-3 ${autoMatchAllowed ? 'border-s2-border bg-background-white' : 'border-error-border bg-error-soft'}`}
            onClick={() => setAutoMatchInfoOpen((prev) => !prev)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-foreground">จับคู่อัตโนมัติ</div>
                <div className="text-xs text-foreground-subtle">Auto matching</div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!autoMatchAllowed) return;
                  setAutoMatchEnabled((prev) => !prev);
                }}
                className={`h-7 w-12 rounded-full p-1 transition-colors bg-background-subtle ${autoMatchAllowed ? (autoMatchEnabled ? 'bg-s2-active' : 'bg-line-soft') : 'bg-background-subtle cursor-not-allowed'}`}
                aria-pressed={autoMatchEnabled}
                disabled={!autoMatchAllowed}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-background-white transition-transform ${autoMatchEnabled ? 'translate-x-5' : ''}`}
                ></span>
              </button>
            </div>

            {!autoMatchAllowed && (
              <div className="mt-2 text-[11px] text-error">
                คุณอยู่ระดับ {tierLabel} ต้องปล่อยสัญญาอีก {remainingToNext.toLocaleString()} บาทเพื่อปลดล็อก Auto matching และรับผลตอบแทนเพิ่มขึ้น
              </div>
            )}

            {autoMatchInfoOpen && (
              <div className="mt-3 text-xs text-foreground-muted">
                เมื่อเปิด ระบบจะจับคู่สินค้าที่ตรงกับ Item preferences และวงเงินคงเหลือเพียงพอ แล้วสร้างสัญญาให้อัตโนมัติทันที
              </div>
            )}
          </div>

          <div
            className="cursor-pointer rounded-lg border border-s2-border bg-background-white px-4 py-3"
            onClick={() => setLiquidationInfoOpen((prev) => !prev)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-foreground">ขายทอดตลาดโดย Pawnly</div>
                <div className="text-xs text-foreground-subtle">Liquidated by Pawnly</div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setAutoLiquidationEnabled((prev) => !prev);
                }}
                className={`h-7 w-12 rounded-full p-1 transition-colors bg-background-subtle ${autoLiquidationEnabled ? 'bg-s2-active' : 'bg-line-soft'}`}
                aria-pressed={autoLiquidationEnabled}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-background-white transition-transform ${autoLiquidationEnabled ? 'translate-x-5' : ''}`}
                ></span>
              </button>
            </div>
            {liquidationInfoOpen && (
              <div className="mt-3 text-xs text-foreground-muted">
                เมื่อเปิด หากสัญญาเกินกำหนด Pawnly จะดำเนินการขายทอดตลาดให้โดยอัตโนมัติ ลดภาระการจัดการของคุณ
              </div>
            )}
          </div>
          </div>

          {!autoLiquidationEnabled && (
            <div className="register-shell rounded-xl p-4 space-y-4">
            <div>
              <div className="font-semibold text-foreground">ที่อยู่สำหรับส่งคืนสินค้า</div>
              <div className="text-xs text-foreground-subtle">ใช้เมื่อปิดการขายทอดตลาดโดย Pawnly</div>
            </div>

            <div className="space-y-2 text-sm">
              <label className={`flex items-start gap-2 rounded-lg border p-3 ${returnAddressMode === 'registered' ? 'border-s2 register-surface-muted' : 'border-s2-border bg-background-white'}`}>
                <input
                  type="radio"
                  name="returnAddressMode"
                  value="registered"
                  checked={returnAddressMode === 'registered'}
                  onChange={() => setReturnAddressMode('registered')}
                  className="mt-1 accent-s2-active"
                />
                <div>
                  <p className="font-semibold text-foreground">จัดส่งตามที่อยู่ที่ลงทะเบียนไว้</p>
                  <p className="mt-1 text-xs text-foreground-subtle">{registeredAddressLabel}</p>
                </div>
              </label>

              <label className={`flex items-start gap-2 rounded-lg border p-3 ${returnAddressMode === 'custom' ? 'border-s2 register-surface-muted' : 'border-s2-border bg-background-white'}`}>
                <input
                  type="radio"
                  name="returnAddressMode"
                  value="custom"
                  checked={returnAddressMode === 'custom'}
                  onChange={() => setReturnAddressMode('custom')}
                  className="mt-1 accent-s2-active"
                />
                <div>
                  <p className="font-semibold text-foreground">ใส่ที่อยู่อื่น</p>
                  <p className="mt-1 text-xs text-foreground-subtle">กรอกที่อยู่สำหรับส่งคืนสินค้า</p>
                </div>
              </label>
            </div>

            {returnAddressMode === 'custom' && (
              <div className="space-y-2 text-sm">
                <input
                  type="text"
                  placeholder="บ้านเลขที่ *"
                  value={returnAddress.houseNo}
                  onChange={(e) => setReturnAddress((prev) => ({ ...prev, houseNo: e.target.value }))}
                  className="register-input w-full rounded-xl px-4 py-3"
                />
                <input
                  type="text"
                  placeholder="หมู่บ้าน/คอนโด"
                  value={returnAddress.village}
                  onChange={(e) => setReturnAddress((prev) => ({ ...prev, village: e.target.value }))}
                  className="register-input w-full rounded-xl px-4 py-3"
                />
                <input
                  type="text"
                  placeholder="ถนน/ซอย"
                  value={returnAddress.street}
                  onChange={(e) => setReturnAddress((prev) => ({ ...prev, street: e.target.value }))}
                  className="register-input w-full rounded-xl px-4 py-3"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="ตำบล/แขวง *"
                    value={returnAddress.subDistrict}
                    onChange={(e) => setReturnAddress((prev) => ({ ...prev, subDistrict: e.target.value }))}
                    className="register-input w-full rounded-xl px-4 py-3"
                  />
                  <input
                    type="text"
                    placeholder="อำเภอ/เขต *"
                    value={returnAddress.district}
                    onChange={(e) => setReturnAddress((prev) => ({ ...prev, district: e.target.value }))}
                    className="register-input w-full rounded-xl px-4 py-3"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="จังหวัด *"
                    value={returnAddress.province}
                    onChange={(e) => setReturnAddress((prev) => ({ ...prev, province: e.target.value }))}
                    className="register-input w-full rounded-xl px-4 py-3"
                  />
                  <input
                    type="text"
                    placeholder="รหัสไปรษณีย์ *"
                    value={returnAddress.postcode}
                    onChange={(e) => setReturnAddress((prev) => ({ ...prev, postcode: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={5}
                    className="register-input w-full rounded-xl px-4 py-3"
                  />
                </div>
              </div>
            )}

            <input
              type="tel"
              placeholder="0812345678"
              value={returnContactPhone}
              onChange={(e) => setReturnContactPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
              inputMode="tel"
              pattern="[0-9]*"
              maxLength={10}
              className="register-input w-full rounded-xl px-4 py-3 text-sm"
            />
            </div>
          )}

          {error && (
            <div className="register-status-error rounded-xl p-3 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="register-primary-btn flex w-full flex-col items-center justify-center rounded-full py-2 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <span className="text-base font-medium">{saving ? 'กำลังบันทึก...' : 'บันทึก'}</span>
            <span className="text-xs opacity-80 font-light">Save</span>
          </button>
        </div>
      </div>
    </div>
  );
}
