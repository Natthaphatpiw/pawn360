'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { ChevronLeft } from 'lucide-react';
import { isMockMode, loadMockInvestor, updateMockInvestor } from '@/lib/mock-investor';

interface InvestorData {
  investor_id: string;
  investor_tier?: string | null;
  total_active_principal?: number | null;
  max_investment_amount?: number | null;
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
      <div className="min-h-screen bg-white flex items-center justify-center page-investor">
        <div className="dot-bricks"></div>
      </div>
    );
  }

  if (error && !investor) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="bg-[#1E3A8A] text-white px-6 py-3 rounded-lg"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  const currentLimit = investor?.max_investment_amount || 0;

  return (
    <div className="min-h-screen bg-white font-sans">
      <div className="px-4 pt-6 flex justify-center">
        <div className="w-full max-w-md pb-10 space-y-4">
          <div className="rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
            <div className="mb-5 rounded-[24px] border border-white/80 bg-white/70 px-4 py-4">
              <div className="inline-flex rounded-full border border-[#C8D6EC] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#5C76A6]">
                Configure Investment
              </div>
              <div className="mt-3 bg-gradient-to-r from-[#0B3B82] via-[#1E4FA3] to-[#6D8FC8] bg-clip-text text-3xl font-semibold tracking-[0.08em] text-transparent">
                ตั้งค่าการลงทุน
              </div>
              <p className="mt-1 text-xs text-[#6F7E97]">กำหนดวงเงินรวม วงเงินรายหมวดหมู่ และการจัดการคำขออัตโนมัติ</p>
            </div>

            <div className="rounded-[24px] border border-white/90 bg-white/80 p-4 text-center shadow-[0_8px_20px_rgba(11,59,130,0.06)]">
              <h2 className="text-lg font-medium text-[#1E4FA3] mb-1">วงเงินปัจจุบัน</h2>
              <div className="text-2xl font-bold text-[#0B3B82]">{currentLimit.toLocaleString()}</div>
            </div>
          </div>

          <div className="rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-gray-800 font-semibold text-base">วงเงินใหม่</span>
              <span className="bg-white text-[#6F7E97] text-xs px-3 py-1 rounded-full border border-[#D9E3F2]">
                New credit limit
              </span>
            </div>
            <span className="text-gray-500 text-sm">บาท</span>
          </div>

          <input
            type="text"
            value={limitInput}
            onChange={(e) => setLimitInput(formatAmount(e.target.value))}
            placeholder="100,000"
            className="w-full rounded-xl border border-[#CCD6E6] bg-white px-3 py-3 text-center text-xl text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-1 focus:ring-[#06367B]"
          />
          <div className="mt-2 text-xs text-[#6F7E97]">สูงสุดไม่เกิน 1,000,000 บาท</div>
          </div>

          <div className="rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-base text-gray-800 font-semibold">ยอดรวมวงเงินจากหมวดหมู่</div>
            <span className="text-sm text-gray-500">บาท</span>
          </div>
          <input
            type="text"
            value={totalCategorySum.toLocaleString()}
            readOnly
            className="w-full rounded-xl bg-white px-3 py-3 text-center text-xl text-gray-600 focus:outline-none focus:ring-0"
          />
          {totalLimit > 0 && totalCategorySum > totalLimit && (
            <p className="mt-2 text-xs text-red-600">ยอดรวมหมวดหมู่เกินวงเงินรวมแล้ว กรุณาปรับแก้</p>
          )}
          </div>

          <div className="rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-gray-800 font-bold text-lg">สินค้าที่ต้องการ</span>
            <span className="bg-white text-[#6F7E97] text-xs px-3 py-1 rounded-full border border-[#D9E3F2]">Item preferences</span>
          </div>

          <div className="space-y-3">
            {!hasSelectedCategory && (
              <div className="rounded-2xl border border-dashed border-[#C8D6EC] bg-white/75 px-4 py-3 text-sm text-[#5C76A6]">
                หากไม่เลือกหมวดหมู่ ระบบจะเปิดรับทุกข้อเสนอและใช้วงเงินรวมก้อนเดียว โดยไม่แยกวงเงินตามหมวดหมู่
              </div>
            )}
            {CATEGORY_OPTIONS.map((category) => {
              const entry = preferences[category.key] || { enabled: false, sub: [], limitAmount: '' };
              const isEnabled = entry.enabled || entry.sub.length > 0;
              return (
                <div
                  key={category.key}
                  className={`rounded-2xl border p-4 transition-colors ${isEnabled ? 'border-[#1E3A8A]/50 bg-[#E6EBF2]' : 'border-gray-200 bg-white'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-800">{category.labelTh}</div>
                      <div className="text-xs text-gray-500">{category.labelEn}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCategory(category.key)}
                      className={`w-11 h-6 rounded-full p-1 transition-colors ${isEnabled ? 'bg-[#1E3A8A]' : 'bg-gray-200'}`}
                      aria-pressed={isEnabled}
                    >
                      <span
                        className={`block h-4 w-4 rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-5' : ''}`}
                      ></span>
                    </button>
                  </div>

                  <div className="mt-3 text-[10px] text-gray-400">
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
                          className={`px-3 py-1 rounded-full text-xs border transition-colors ${selected ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]' : 'bg-white text-gray-600 border-gray-200'}`}
                          aria-pressed={selected}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>

                  {isEnabled && (
                    <div className="mt-4">
                      <label className="text-sm font-medium text-gray-700">วงเงินสำหรับหมวดนี้</label>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9,]*"
                          value={entry.limitAmount}
                          onChange={(e) => setCategoryLimitAmount(category.key, e.target.value)}
                          placeholder="0"
                          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1E3A8A] bg-white"
                        />
                        <span className="text-sm text-gray-500">บาท</span>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        {totalLimit > 0 ? `เหลืออีก ${Math.max(0, totalLimit - (totalCategorySum - parseAmount(entry.limitAmount))).toLocaleString()} บาท สำหรับหมวดนี้` : 'กรุณากรอกวงเงินรวมก่อนเพื่อดูยอดที่เหลือ'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>

          <div className="rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)] space-y-4">
          <div
            className={`rounded-2xl border px-4 py-3 cursor-pointer ${autoMatchAllowed ? 'border-[#DCE4F0] bg-white' : 'border-[#FAD7D7] bg-[#FEF2F2]'}`}
            onClick={() => setAutoMatchInfoOpen((prev) => !prev)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-800">จับคู่อัตโนมัติ</div>
                <div className="text-xs text-gray-500">Auto matching</div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!autoMatchAllowed) return;
                  setAutoMatchEnabled((prev) => !prev);
                }}
                className={`w-12 h-7 rounded-full p-1 transition-colors ${autoMatchAllowed ? (autoMatchEnabled ? 'bg-[#0B3B82]' : 'bg-gray-200') : 'bg-gray-100 cursor-not-allowed'}`}
                aria-pressed={autoMatchEnabled}
                disabled={!autoMatchAllowed}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white transition-transform ${autoMatchEnabled ? 'translate-x-5' : ''}`}
                ></span>
              </button>
            </div>

            {!autoMatchAllowed && (
              <div className="mt-2 text-[11px] text-[#B91C1C]">
                คุณอยู่ระดับ {tierLabel} ต้องปล่อยสัญญาอีก {remainingToNext.toLocaleString()} บาทเพื่อปลดล็อก Auto matching และรับผลตอบแทนเพิ่มขึ้น
              </div>
            )}

            {autoMatchInfoOpen && (
              <div className="mt-3 text-xs text-gray-600">
                เมื่อเปิด ระบบจะจับคู่สินค้าที่ตรงกับ Item preferences และวงเงินคงเหลือเพียงพอ แล้วสร้างสัญญาให้อัตโนมัติทันที
              </div>
            )}
          </div>

          <div
            className="rounded-2xl border border-[#DCE4F0] bg-white px-4 py-3 cursor-pointer"
            onClick={() => setLiquidationInfoOpen((prev) => !prev)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-800">ขายทอดตลาดโดย Pawnly</div>
                <div className="text-xs text-gray-500">Liquidated by Pawnly</div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setAutoLiquidationEnabled((prev) => !prev);
                }}
                className={`w-12 h-7 rounded-full p-1 transition-colors ${autoLiquidationEnabled ? 'bg-[#0B3B82]' : 'bg-gray-200'}`}
                aria-pressed={autoLiquidationEnabled}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white transition-transform ${autoLiquidationEnabled ? 'translate-x-5' : ''}`}
                ></span>
              </button>
            </div>
            {liquidationInfoOpen && (
              <div className="mt-3 text-xs text-gray-600">
                เมื่อเปิด หากสัญญาเกินกำหนด Pawnly จะดำเนินการขายทอดตลาดให้โดยอัตโนมัติ ลดภาระการจัดการของคุณ
              </div>
            )}
          </div>
          </div>

          {!autoLiquidationEnabled && (
            <div className="rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)] space-y-4">
            <div>
              <div className="font-semibold text-gray-800">ที่อยู่สำหรับส่งคืนสินค้า</div>
              <div className="text-xs text-gray-500">ใช้เมื่อปิดการขายทอดตลาดโดย Pawnly</div>
            </div>

            <div className="space-y-2 text-sm">
              <label className={`flex items-start gap-2 rounded-2xl border p-3 ${returnAddressMode === 'registered' ? 'border-[#1E3A8A] bg-[#F5F7FA]' : 'border-gray-200 bg-white'}`}>
                <input
                  type="radio"
                  name="returnAddressMode"
                  value="registered"
                  checked={returnAddressMode === 'registered'}
                  onChange={() => setReturnAddressMode('registered')}
                  className="mt-1 accent-[#1E3A8A]"
                />
                <div>
                  <p className="font-semibold text-gray-800">จัดส่งตามที่อยู่ที่ลงทะเบียนไว้</p>
                  <p className="text-xs text-gray-500 mt-1">{registeredAddressLabel}</p>
                </div>
              </label>

              <label className={`flex items-start gap-2 rounded-2xl border p-3 ${returnAddressMode === 'custom' ? 'border-[#1E3A8A] bg-[#F5F7FA]' : 'border-gray-200 bg-white'}`}>
                <input
                  type="radio"
                  name="returnAddressMode"
                  value="custom"
                  checked={returnAddressMode === 'custom'}
                  onChange={() => setReturnAddressMode('custom')}
                  className="mt-1 accent-[#1E3A8A]"
                />
                <div>
                  <p className="font-semibold text-gray-800">ใส่ที่อยู่อื่น</p>
                  <p className="text-xs text-gray-500 mt-1">กรอกที่อยู่สำหรับส่งคืนสินค้า</p>
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
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-400 bg-white"
                />
                <input
                  type="text"
                  placeholder="หมู่บ้าน/คอนโด"
                  value={returnAddress.village}
                  onChange={(e) => setReturnAddress((prev) => ({ ...prev, village: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-400 bg-white"
                />
                <input
                  type="text"
                  placeholder="ถนน/ซอย"
                  value={returnAddress.street}
                  onChange={(e) => setReturnAddress((prev) => ({ ...prev, street: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-400 bg-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="ตำบล/แขวง *"
                    value={returnAddress.subDistrict}
                    onChange={(e) => setReturnAddress((prev) => ({ ...prev, subDistrict: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-400 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="อำเภอ/เขต *"
                    value={returnAddress.district}
                    onChange={(e) => setReturnAddress((prev) => ({ ...prev, district: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-400 bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="จังหวัด *"
                    value={returnAddress.province}
                    onChange={(e) => setReturnAddress((prev) => ({ ...prev, province: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-400 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="รหัสไปรษณีย์ *"
                    value={returnAddress.postcode}
                    onChange={(e) => setReturnAddress((prev) => ({ ...prev, postcode: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={5}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-400 bg-white"
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
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-400 bg-white"
            />
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex w-full flex-col items-center justify-center rounded-full bg-gradient-to-r from-[#1E4FA3] to-[#0B3B82] py-2 text-white transition-all active:scale-[0.98] disabled:opacity-50 hover:from-[#18448F] hover:to-[#08306A]"
          >
            <span className="text-base font-medium">{saving ? 'กำลังบันทึก...' : 'บันทึก'}</span>
            <span className="text-xs opacity-80 font-light">Save</span>
          </button>
        </div>
      </div>
    </div>
  );
}
