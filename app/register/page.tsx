'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { clearPawnerEstimateResume, getPawnerEstimateResume } from '@/lib/pawner-estimate-resume';
import { openLiffEntry } from '@/lib/liff/navigation';
import { ChevronDown } from 'lucide-react';
import { getMockCustomer, isMockPawnerMode, waitMock } from '@/lib/mock-pawner';

interface PawnerData {
  customer_id: string;
  line_id: string;
  firstname: string;
  lastname: string;
  kyc_status: string;
  stats: {
    totalContracts: number;
    activeContracts: number;
    endedContracts: number;
  };
}

interface RegisterFormData {
  firstname: string;
  lastname: string;
  phoneNumber: string;
  nationalId: string;
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

export default function PawnerRegister() {
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const router = useRouter();
  const mockMode = isMockPawnerMode();
  const [loading, setLoading] = useState(true);
  const [pawnerData, setPawnerData] = useState<PawnerData | null>(null);
  const [formData, setFormData] = useState<RegisterFormData>({
    firstname: '',
    lastname: '',
    phoneNumber: '',
    nationalId: '',
    address: {
      houseNo: '',
      village: '',
      street: '',
      subDistrict: '',
      district: '',
      province: '',
      country: 'Thailand',
      postcode: ''
    },
    bankInfo: {
      bankName: '',
      accountNo: '',
      accountType: '',
      accountName: ''
    }
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigateToLiff = (liffId: string | undefined, fallbackPath: string) => {
    const trimmed = (liffId || '').trim();
    if (trimmed) {
      window.location.href = `https://liff.line.me/${trimmed}`;
      return;
    }
    router.push(fallbackPath);
  };

  // Check if user exists in database and KYC status
  useEffect(() => {
    if (liffLoading) return;

    if (mockMode) {
      const loadMockProfile = async () => {
        await waitMock(250);
        const mockCustomer = getMockCustomer();
        const [firstname, ...lastnameParts] = mockCustomer.fullName.split(' ');
        setPawnerData({
          customer_id: mockCustomer._id,
          line_id: mockCustomer.lineId,
          firstname: firstname || 'สมหญิง',
          lastname: lastnameParts.join(' ') || 'ทดสอบ',
          kyc_status: 'VERIFIED',
          stats: {
            totalContracts: 6,
            activeContracts: 2,
            endedContracts: 4,
          },
        });
        setLoading(false);
      };

      loadMockProfile();
      return;
    }

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
      try {
        const response = await axios.get(`/api/pawners/check?lineId=${profile.userId}`);
        if (response.data.exists) {
          const pawner = response.data.pawner;
          // Always show profile; UI will gate actions by kyc_status
          setPawnerData(pawner);
        }
      } catch (error: any) {
        console.error('Error checking pawner:', error);
        setError('เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ใช้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, [liffLoading, liffError, profile?.userId, mockMode]);

  useEffect(() => {
    if (mockMode || !profile?.userId || pawnerData?.kyc_status !== 'VERIFIED') return;
    const resume = getPawnerEstimateResume(profile.userId);
    if (!resume?.returnAfterVerify || !resume.draftId) return;

    clearPawnerEstimateResume(profile.userId);
    openLiffEntry({
      liffIdCandidates: [
        process.env.NEXT_PUBLIC_LIFF_ID_PAWN,
      ],
      fallbackPath: `/estimate?draftId=${resume.draftId}`,
      statePath: `/estimate?draftId=${resume.draftId}`,
    });
  }, [profile?.userId, pawnerData?.kyc_status, mockMode]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name.startsWith('addr_')) {
      const addressField = name.replace('addr_', '');
      setFormData(prev => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value
        }
      }));
    } else if (name.startsWith('bank_')) {
      const bankField = name.replace('bank_', '');
      setFormData(prev => ({
        ...prev,
        bankInfo: {
          ...prev.bankInfo,
          [bankField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async () => {
    if (!profile?.userId) {
      setError('กรุณาเข้าสู่ระบบ LINE');
      return;
    }

    // Validation
    if (!formData.firstname || !formData.lastname || !formData.phoneNumber || !formData.nationalId) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await axios.post('/api/pawners/register', {
        lineId: profile.userId,
        ...formData
      });

      if (response.data.success) {
        // Redirect to eKYC page
        router.push('/ekyc');
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการลงทะเบียน');
    } finally {
      setSubmitting(false);
    }
  };

  if (liffLoading || loading) {
    return (
      <div className="theme-liff page-pawner h-dvh min-h-dvh w-full bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  // If user exists, show profile page
  if (pawnerData) {
    return (
      <div className="theme-liff page-pawner h-dvh min-h-dvh w-full bg-background-white font-sans p-4 flex flex-col items-center pb-8">
        <div className="w-full max-w-sm my-3 rounded-xl border border-primary-border bg-primary-soft/50 shadow-soft">
          <div className="inline-flex rounded-full border border-primary-border bg-background-white/90 mt-4 ml-4 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
            Pawner Profile
          </div>
          <div className="m-4 overflow-hidden rounded-lg border border-background-white/90 bg-background-white/90 px-5 py-6 text-center shadow-soft">
            <p className="text-xl font-medium text-foreground">{pawnerData.firstname} {pawnerData.lastname}</p>
            <p className="mt-2 text-sm font-light text-foreground-subtle">
              Member ID: {pawnerData.customer_id.substring(0, 8)}
            </p>
          </div>
        </div>

        <div className="w-full max-w-sm space-y-3">
          <div className="w-full rounded-xl border border-primary-border bg-primary-soft/50 p-4 text-center shadow-soft">
            <h2 className="text-lg font-medium text-foreground-muted">สัญญาและสถานะ</h2>
            <div className="my-4 grid grid-cols-3 gap-2 text-center divide-x divide-primary-border">
              {[
                { value: pawnerData.stats.totalContracts, label: 'สัญญาทั้งหมด' },
                { value: pawnerData.stats.activeContracts, label: 'สัญญาที่ยังไม่สิ้นสุด' },
                { value: pawnerData.stats.endedContracts, label: 'สัญญาสิ้นสุดแล้ว' },
              ].map((stat) => (
                <div key={stat.label} className="px-2">
                  <div className="mb-1 text-2xl font-bold text-foreground-muted font-english">{stat.value}</div>
                  <div className="text-xs font-base text-foreground-subtle">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-background-white bg-background-white p-4">
              <div className="text-center text-sm font-medium text-foreground-muted">สถานะบัญชี</div>
              <div className="mt-3 flex items-center justify-between rounded-md bg-background-subtle px-4 py-3 text-sm">
                <span className="text-foreground-subtle">KYC status</span>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                  pawnerData.kyc_status === 'VERIFIED'
                    ? 'bg-success-soft text-success'
                    : pawnerData.kyc_status === 'PENDING'
                    ? 'bg-warning-soft text-warning'
                    : 'bg-background-subtle text-foreground-subtle'
                }`}>
                  {pawnerData.kyc_status === 'VERIFIED'
                    ? 'ยืนยันแล้ว'
                    : pawnerData.kyc_status === 'PENDING'
                    ? 'รอตรวจสอบ'
                    : 'ยังไม่ยืนยัน'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-3">
            <button
              onClick={() => router.push('/estimate')}
              className="btn-transition btn-sheen w-full rounded-full bg-primary py-3 flex flex-col items-center justify-center text-primary-fg active:scale-[0.98]"
            >
              <span className="text-base font-medium">ขอสินเชื่อ</span>
              <span className="text-xs font-light opacity-80">Pawn entry</span>
            </button>
            <button
              onClick={() => router.push('/contracts')}
              className="btn-transition w-full rounded-full border border-primary bg-background-white py-3 flex flex-col items-center justify-center text-primary"
            >
              <span className="text-base font-medium">รายการสัญญา</span>
              <span className="text-xs font-light opacity-80">Contract list</span>
            </button>
            <button
              onClick={() => router.push('/register/edit')}
              className="btn-transition w-full rounded-full bg-primary-soft py-3 flex flex-col items-center justify-center text-primary"
            >
              <span className="text-base font-medium">แก้ไขข้อมูล</span>
              <span className="text-xs font-light opacity-80">Edit profile</span>
            </button>
            {pawnerData.kyc_status !== 'VERIFIED' && (
              <button
                onClick={() => {
                  if (pawnerData.kyc_status === 'PENDING') {
                    router.push('/ekyc/waiting');
                  } else {
                    router.push('/ekyc');
                  }
                }}
                className="btn-transition btn-sheen w-full rounded-full bg-[image:var(--background-image-grad-primary)] py-3 flex flex-col items-center justify-center text-primary-fg"
              >
                <span className="text-base font-medium">ยืนยันตัวตน</span>
                <span className="text-xs font-light opacity-80">Verify identity</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // If user doesn't exist, show registration form
  return <RegisterForm 
    formData={formData} 
    handleInputChange={handleInputChange}
    handleSubmit={handleSubmit}
    submitting={submitting}
    error={error}
  />;
}

// Helper Component for Register Form Fields
const RegisterField = ({ 
  labelEn, 
  labelTh, 
  placeholder, 
  value, 
  onChange, 
  name,
  type = "text" 
}: {
  labelEn: string;
  labelTh: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
  type?: string;
}) => (
  <div className="mb-4">
    <div className="mb-1">
      <div className="text-sm font-medium text-foreground md:text-base">{labelEn}</div>
      <div className="text-xs font-light text-foreground-subtle">{labelTh}</div>
    </div>
    <input
      type={type}
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full rounded-xl border border-primary-border bg-background-white px-3 py-3 text-foreground focus:outline-none focus:ring-1 focus:ring-primary autofill:bg-background-white autofill:text-foreground autofill:[-webkit-text-fill-color:var(--color-foreground)] autofill:[box-shadow:inset_0_0_0px_1000px_var(--color-background-white)]"
    />
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
        <div className="text-sm font-medium text-foreground md:text-base">{labelEn}</div>
        <div className="text-xs font-light text-foreground-subtle">{labelTh}</div>
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-xl border border-primary-border bg-background-white px-3 py-3 text-left text-base text-foreground shadow-soft focus:outline-none focus:ring-1 focus:ring-primary"
          aria-expanded={open}
        >
          <span className={value ? 'text-foreground' : 'text-foreground-subtle'}>{value || placeholder}</span>
          <ChevronDown className={`h-4 w-4 text-foreground-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="dropdown-slide-down absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-primary-border bg-background-white shadow-soft">
            <div className="max-h-60 overflow-y-auto py-1">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`block w-full px-3 py-2 text-left text-sm transition-colors ${value === option ? 'bg-primary-soft text-primary' : 'text-foreground-muted hover:bg-background-subtle'}`}
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

function RegisterForm({
  formData,
  handleInputChange,
  handleSubmit,
  submitting,
  error
}: {
  formData: RegisterFormData;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>) => void;
  handleSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div className="theme-liff h-dvh min-h-dvh w-full bg-background-white font-sans px-4 py-4 flex justify-center">
      <div className="w-full max-w-md pb-20">

        {/* Header */}
        <div className="mb-6 rounded-xl border border-primary-border bg-primary-soft/50 p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
          <div className="rounded-[var(--radius-lg)] border border-background-white/80 bg-background-white/90 px-4 py-4">
            <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/40">
              Pawner Register
            </div>
            <div className="mt-3 text-primary bg-clip-text text-3xl font-semibold tracking-[0.08em]">
              ลงทะเบียนผู้ขอสินเชื่อ
            </div>
            <p className="mt-1 text-xs text-foreground-subtle">
              กรอกข้อมูลส่วนตัว ที่อยู่ และบัญชีรับเงินเพื่อเริ่มต้นใช้งาน
            </p>
          </div>
        </div>
        
        {/* Personal Info Group */}
        <div className="rounded-xl border border-primary-border bg-primary-soft/50 p-4">
          <div className="">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-primary font-english">Personal info</h2>
              <p className="text-xs text-foreground-subtle">ข้อมูลส่วนตัว</p>
            </div>
        <div className="space-y-1">
          <RegisterField
            labelEn="First name"
            labelTh="ชื่อจริง"
            placeholder="ชื่อจริง"
            name="firstname"
            value={formData.firstname}
            onChange={handleInputChange}
          />
          <RegisterField
            labelEn="Last name"
            labelTh="นามสกุล"
            placeholder="นามสกุล"
            name="lastname"
            value={formData.lastname}
            onChange={handleInputChange}
          />
          <RegisterField
            labelEn="Phone number"
            labelTh="เบอร์โทรศัพท์"
            placeholder="000-000-0000"
            name="phoneNumber"
            type="tel"
            value={formData.phoneNumber}
            onChange={handleInputChange}
          />
          <RegisterField
            labelEn="ID"
            labelTh="เลขบัตรประชาชน 13 หลัก"
            placeholder="X-XXXX-XXXXX-XX-X"
            name="nationalId"
            value={formData.nationalId}
            onChange={handleInputChange}
          />
        </div>
          </div>
        </div>

        <div className="h-px bg-line-soft my-3"></div>

        <div className="rounded-xl border border-primary-border bg-primary-soft/50 p-4">
          {/* Address Header */}
          <div className="mb-4 px-1">
            <h2 className="text-lg font-bold text-primary font-english">Address</h2>
            <p className="text-xs text-foreground-subtle">ที่อยู่</p>
          </div>

          {/* Address Fields Group */}
          <div className="space-y-1">
            <RegisterField
              labelEn="Address (เลขที่)"
              labelTh=""
              placeholder="บ้านเลขที่"
              name="addr_houseNo"
              value={formData.address.houseNo}
              onChange={handleInputChange}
            />
            <RegisterField
              labelEn="Village/Building (หมู่บ้าน/อาคาร)"
              labelTh=""
              placeholder="ชื่อหมู่บ้าน/อาคาร"
              name="addr_village"
              value={formData.address.village}
              onChange={handleInputChange}
            />
            <RegisterField
              labelEn="Street (ตรอก/ซอย/ถนน)"
              labelTh=""
              placeholder="ถนน/ตรอก/ซอย"
              name="addr_street"
              value={formData.address.street}
              onChange={handleInputChange}
            />
            <RegisterField
              labelEn="Sub-district (แขวง/ตำบล)"
              labelTh=""
              placeholder="แขวง/ตำบล"
              name="addr_subDistrict"
              value={formData.address.subDistrict}
              onChange={handleInputChange}
            />
            <RegisterField
              labelEn="District (เขต/อำเภอ)"
              labelTh=""
              placeholder="เขต/อำเภอ"
              name="addr_district"
              value={formData.address.district}
              onChange={handleInputChange}
            />
            <RegisterField
              labelEn="Province (จังหวัด)"
              labelTh=""
              placeholder="จังหวัด"
              name="addr_province"
              value={formData.address.province}
              onChange={handleInputChange}
            />
            <RegisterField
              labelEn="Country (ประเทศ)"
              labelTh=""
              placeholder="ประเทศ"
              name="addr_country"
              value={formData.address.country}
              onChange={handleInputChange}
            />
            <RegisterField
              labelEn="Postcode (รหัสไปรษณีย์)"
              labelTh=""
              placeholder="XXXXX"
              name="addr_postcode"
              value={formData.address.postcode}
              onChange={handleInputChange}
            />
          </div>
        </div>

        <div className="h-px bg-line-soft my-3"></div>

        <div className="rounded-xl border border-primary-border bg-primary-soft/50 p-4">
          {/* Bank Account Header */}
          <div className="mb-4 px-1">
            <h2 className="text-lg font-bold text-foreground">Bank Account (Optional)</h2>
            <p className="text-xs text-foreground-subtle">ข้อมูลบัญชีธนาคาร (ไม่บังคับ)</p>
          </div>

          {/* Bank Account Fields Group */}
          <div className="space-y-1">
            <DropdownField
              labelEn="Bank name"
              labelTh="ชื่อธนาคาร"
              name="bank_bankName"
              value={formData.bankInfo.bankName}
              placeholder="เลือกธนาคาร"
              options={BANKS}
              onChange={handleInputChange}
            />

            <RegisterField
              labelEn="Account No."
              labelTh="หมายเลขบัญชี"
              placeholder="0000000000"
              name="bank_accountNo"
              type="text"
              value={formData.bankInfo.accountNo}
              onChange={handleInputChange}
            />

            <DropdownField
              labelEn="Account type"
              labelTh="ประเภทบัญชี"
              name="bank_accountType"
              value={formData.bankInfo.accountType}
              placeholder="เลือกประเภทบัญชี"
              options={ACCOUNT_TYPE_OPTIONS}
              onChange={handleInputChange}
            />

            <RegisterField
              labelEn="Account Name"
              labelTh="ชื่อเจ้าของบัญชี"
              placeholder="ชื่อเจ้าของบัญชี"
              name="bank_accountName"
              value={formData.bankInfo.accountName}
              onChange={handleInputChange}
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 rounded-xl border border-error-border bg-error-soft p-3 text-sm text-error">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-6 mb-4">
          <button 
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-transition btn-sheen w-full min-h-12 rounded-full bg-primary py-4 text-primary-fg disabled:cursor-not-allowed disabled:opacity-50 flex flex-col items-center justify-center"
          >
            <span className="text-base font-medium">
              {submitting ? 'กำลังบันทึก...' : 'ดำเนินการต่อ'}
            </span>
            {!submitting && (
              <span className="text-xs font-light opacity-90">Continue</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
