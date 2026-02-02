'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

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

type PreferenceState = Record<string, { enabled: boolean; sub: string[] }>;

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
    key: 'โทรศัพท์มือถือ',
    labelTh: 'โทรศัพท์มือถือ',
    labelEn: 'Mobile',
    subLabelTh: 'ยี่ห้อ',
    subLabelEn: 'Brand',
    options: ['Apple', 'Samsung', 'Huawei', 'Xiaomi', 'OPPO', 'Vivo', 'Realme', 'OnePlus', 'Google', 'Sony', 'Nokia', 'ASUS', 'อื่นๆ'],
  },
  {
    key: 'โน้ตบุค',
    labelTh: 'คอมพิวเตอร์โน้ตบุ๊ค',
    labelEn: 'Computer laptop',
    subLabelTh: 'ยี่ห้อ',
    subLabelEn: 'Brand',
    options: ['Apple', 'Dell', 'HP', 'Lenovo', 'ASUS', 'Acer', 'MSI', 'Samsung', 'Microsoft', 'Razer', 'อื่นๆ'],
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
    key: 'Apple',
    labelTh: 'สินค้า Apple',
    labelEn: 'Apple products',
    subLabelTh: 'ประเภท',
    subLabelEn: 'Category',
    options: ['iPhone', 'iPad', 'MacBook', 'Apple Watch', 'AirPods', 'iMac', 'Mac mini', 'Mac Studio', 'Mac Pro'],
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

const buildDefaultPreferences = () => {
  const base: PreferenceState = {};
  CATEGORY_OPTIONS.forEach((category) => {
    base[category.key] = { enabled: false, sub: [] };
  });
  return base;
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
    base[key] = { enabled, sub };
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
      try {
        setLoading(true);
        const response = await axios.get(`/api/investors/check?lineId=${profile.userId}`);
        if (response.data.exists) {
          const data = response.data.investor;
          setInvestor(data);
          const currentLimit = data?.max_investment_amount || 0;
          setLimitInput(currentLimit.toString());
          setPreferences(normalizePreferences(data?.investment_preferences));
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

  const toggleCategory = (key: string) => {
    setPreferences((prev) => {
      const next = { ...prev };
      const current = next[key] || { enabled: false, sub: [] };
      const enabled = !current.enabled;
      next[key] = {
        enabled,
        sub: enabled ? current.sub : [],
      };
      return next;
    });
  };

  const toggleSubOption = (key: string, option: string) => {
    setPreferences((prev) => {
      const next = { ...prev };
      const current = next[key] || { enabled: false, sub: [] };
      const exists = current.sub.includes(option);
      const sub = exists
        ? current.sub.filter((value) => value !== option)
        : [...current.sub, option];
      next[key] = {
        enabled: true,
        sub,
      };
      return next;
    });
  };

  const handleSave = async () => {
    if (!profile?.userId) return;
    const parsed = Number(limitInput.replace(/,/g, ''));
    if (Number.isNaN(parsed) || parsed < 0) {
      setError('กรุณากรอกวงเงินให้ถูกต้อง');
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

    try {
      setSaving(true);
      setError(null);
      const returnDelivery = autoLiquidationEnabled ? null : {
        mode: returnAddressMode,
        address: returnAddressMode === 'custom' ? returnAddress : null,
        phone: returnContactPhone || investor?.phone_number || '',
      };
      const response = await axios.put('/api/investors/credit-limit', {
        lineId: profile.userId,
        maxInvestmentAmount: parsed,
        preferences: {
          categories: preferences,
          return_delivery: returnDelivery,
        },
        autoMatchEnabled,
        autoLiquidationEnabled,
      });
      if (response.data.success) {
        setInvestor(response.data.investor);
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A]"></div>
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
    <div className="min-h-screen bg-[#F5F7FA] font-sans p-4 flex flex-col items-center pb-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="bg-[#E9EFF6] rounded-2xl p-6 text-center">
          <h2 className="text-[#1E3A8A] text-lg font-medium mb-2">วงเงินปัจจุบัน</h2>
          <div className="text-3xl font-bold text-[#1E3A8A]">{currentLimit.toLocaleString()}</div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-gray-800 font-bold text-lg">วงเงินใหม่</span>
              <span className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full">
                New credit limit
              </span>
            </div>
            <span className="text-gray-500 text-sm">บาท</span>
          </div>

          <input
            type="text"
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            placeholder="100,000"
            className="w-full p-4 bg-white border border-gray-300 rounded-xl text-2xl text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
          />
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-gray-800 font-bold text-lg">สินค้าที่ต้องการ</span>
            <span className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full">Item preferences</span>
          </div>

          <div className="space-y-3">
            {CATEGORY_OPTIONS.map((category) => {
              const entry = preferences[category.key] || { enabled: false, sub: [] };
              const isEnabled = entry.enabled || entry.sub.length > 0;
              return (
                <div
                  key={category.key}
                  className={`rounded-2xl border p-4 transition-colors ${isEnabled ? 'border-[#1E3A8A]/30 bg-[#F5F7FA]' : 'border-gray-200 bg-white'}`}
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
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
          <div
            className={`rounded-2xl border px-4 py-3 cursor-pointer ${autoMatchAllowed ? 'border-[#DCE4F0] bg-[#F3F6FB]' : 'border-[#FAD7D7] bg-[#FEF2F2]'}`}
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
            className="rounded-2xl border border-[#DCE4F0] bg-[#F3F6FB] px-4 py-3 cursor-pointer"
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
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
            <div>
              <div className="font-semibold text-gray-800">ที่อยู่สำหรับส่งคืนสินค้า</div>
              <div className="text-xs text-gray-500">ใช้เมื่อปิดการขายทอดตลาดโดย Pawnly</div>
            </div>

            <div className="space-y-2 text-sm">
              <label className={`flex items-start gap-2 rounded-2xl border p-3 ${returnAddressMode === 'registered' ? 'border-[#1E3A8A] bg-[#F5F7FA]' : 'border-gray-200'}`}>
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

              <label className={`flex items-start gap-2 rounded-2xl border p-3 ${returnAddressMode === 'custom' ? 'border-[#1E3A8A] bg-[#F5F7FA]' : 'border-gray-200'}`}>
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
                  className="w-full rounded-xl border border-gray-200 px-4 py-3"
                />
                <input
                  type="text"
                  placeholder="หมู่บ้าน/คอนโด"
                  value={returnAddress.village}
                  onChange={(e) => setReturnAddress((prev) => ({ ...prev, village: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3"
                />
                <input
                  type="text"
                  placeholder="ถนน/ซอย"
                  value={returnAddress.street}
                  onChange={(e) => setReturnAddress((prev) => ({ ...prev, street: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="ตำบล/แขวง *"
                    value={returnAddress.subDistrict}
                    onChange={(e) => setReturnAddress((prev) => ({ ...prev, subDistrict: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                  <input
                    type="text"
                    placeholder="อำเภอ/เขต *"
                    value={returnAddress.district}
                    onChange={(e) => setReturnAddress((prev) => ({ ...prev, district: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="จังหวัด *"
                    value={returnAddress.province}
                    onChange={(e) => setReturnAddress((prev) => ({ ...prev, province: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                  <input
                    type="text"
                    placeholder="รหัสไปรษณีย์"
                    value={returnAddress.postcode}
                    onChange={(e) => setReturnAddress((prev) => ({ ...prev, postcode: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                </div>
              </div>
            )}

            <input
              type="tel"
              placeholder="เบอร์ติดต่อสำหรับการจัดส่ง"
              value={returnContactPhone}
              onChange={(e) => setReturnContactPhone(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm"
            />
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[#0B3B82] hover:bg-[#08306A] text-white rounded-2xl py-4 flex flex-col items-center justify-center transition-colors shadow-sm active:scale-[0.98] disabled:opacity-50"
        >
          <span className="text-base font-bold">{saving ? 'กำลังบันทึก...' : 'บันทึก'}</span>
          <span className="text-[10px] opacity-80 font-light">Save</span>
        </button>
      </div>
    </div>
  );
}
