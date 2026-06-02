'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ChevronDown } from 'lucide-react';

interface PawnerData {
  customer_id: string;
  line_id: string;
  firstname: string;
  lastname: string;
  phone_number: string;
  national_id: string;
  email: string;
  addr_house_no: string;
  addr_village: string;
  addr_street: string;
  addr_sub_district: string;
  addr_district: string;
  addr_province: string;
  addr_country: string;
  addr_postcode: string;
  bank_name: string;
  bank_account_no: string;
  bank_account_type: string;
  bank_account_name: string;
  promptpay_number: string;
}

interface FormData {
  firstname: string;
  lastname: string;
  phoneNumber: string;
  nationalId: string;
  email: string;
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
    promptpayNumber: string;
  };
}

export default function PawnerEditProfile() {
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    firstname: '',
    lastname: '',
    phoneNumber: '',
    nationalId: '',
    email: '',
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
      accountName: '',
      promptpayNumber: ''
    }
  });

  useEffect(() => {
    if (liffLoading) return;

    if (liffError || !profile?.userId) {
      setError('ไม่สามารถเชื่อมต่อ LINE LIFF ได้ กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
      return;
    }

    const fetchPawnerData = async () => {
      try {
        const response = await axios.get(`/api/pawners/by-line-id/${profile.userId}`);
        if (response.data.success) {
          const data: PawnerData = response.data.pawner;
          setFormData({
            firstname: data.firstname || '',
            lastname: data.lastname || '',
            phoneNumber: data.phone_number || '',
            nationalId: data.national_id || '',
            email: data.email || '',
            address: {
              houseNo: data.addr_house_no || '',
              village: data.addr_village || '',
              street: data.addr_street || '',
              subDistrict: data.addr_sub_district || '',
              district: data.addr_district || '',
              province: data.addr_province || '',
              country: data.addr_country || 'Thailand',
              postcode: data.addr_postcode || ''
            },
            bankInfo: {
              bankName: data.bank_name || '',
              accountNo: data.bank_account_no || '',
              accountType: data.bank_account_type || '',
              accountName: data.bank_account_name || '',
              promptpayNumber: data.promptpay_number || ''
            }
          });
        }
      } catch (error: any) {
        console.error('Error fetching pawner data:', error);
        setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
    };

    fetchPawnerData();
  }, [liffLoading, liffError, profile?.userId]);

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
    if (!formData.firstname || !formData.lastname || !formData.phoneNumber) {
      setError('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อ, นามสกุล, เบอร์โทร)');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await axios.put('/api/pawners/update', {
        lineId: profile.userId,
        ...formData
      });

      if (response.data.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/register');
        }, 1500);
      }
    } catch (error: any) {
      console.error('Update error:', error);
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการอัพเดทข้อมูล');
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

  return (
    <div className="theme-liff min-h-screen bg-background-white font-sans">
      <div className="px-4 py-6 flex justify-center">
        <div className="w-full max-w-md pb-20">

          {/* Header */}
          <div className="mb-6 rounded-xl border border-primary-border bg-primary-soft/50 p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
            <div className="rounded-[var(--radius-lg)] border border-background-white/80 bg-background-white/90 px-4 py-4">
              <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/40">
                Pawner Profile
              </div>
              <div className="mt-3 text-primary bg-clip-text text-3xl font-semibold tracking-[0.08em]">
                แก้ไขข้อมูลผู้ขอสินเชื่อ
              </div>
            </div>
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-4 rounded-xl border border-success-border bg-success-soft p-4 text-sm text-success">
              บันทึกข้อมูลเรียบร้อยแล้ว กำลังกลับไปหน้าโปรไฟล์...
            </div>
          )}

          <div className="rounded-xl border border-primary-border bg-primary-soft/50 p-4">
            {/* Personal Info Group */}
            <div className="space-y-1">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-foreground">Personal info</h2>
                <p className="text-xs text-foreground-subtle">ข้อมูลส่วนตัว</p>
              </div>
              <EditField
                labelEn="First name"
                labelTh="ชื่อจริง"
                placeholder="ชื่อจริง"
                name="firstname"
                value={formData.firstname}
                onChange={handleInputChange}
                required
              />
              <EditField
                labelEn="Last name"
                labelTh="นามสกุล"
                placeholder="นามสกุล"
                name="lastname"
                value={formData.lastname}
                onChange={handleInputChange}
                required
              />
              <EditField
                labelEn="Phone number"
                labelTh="เบอร์โทรศัพท์"
                placeholder="000-000-0000"
                name="phoneNumber"
                type="tel"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                required
              />
              <EditField
                labelEn="ID"
                labelTh="เลขบัตรประชาชน 13 หลัก"
                placeholder="X-XXXX-XXXXX-XX-X"
                name="nationalId"
                value={formData.nationalId}
                onChange={handleInputChange}
              />
              <EditField
                labelEn="Email"
                labelTh="อีเมล"
                placeholder="example@email.com"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="h-px bg-line-soft my-3"></div>

          <div className="rounded-xl border border-primary-border bg-primary-soft/50 p-4">
            {/* Address Header */}
            <div className="mb-4">
              <h2 className="text-lg font-bold text-foreground">Address</h2>
              <p className="text-xs text-foreground-subtle">ที่อยู่</p>
            </div>

            {/* Address Fields Group */}
            <div className="space-y-1">
              <EditField
                labelEn="Address (เลขที่)"
                labelTh=""
                placeholder="บ้านเลขที่"
                name="addr_houseNo"
                value={formData.address.houseNo}
                onChange={handleInputChange}
              />
              <EditField
                labelEn="Village/Building (หมู่บ้าน/อาคาร)"
                labelTh=""
                placeholder="ชื่อหมู่บ้าน/อาคาร"
                name="addr_village"
                value={formData.address.village}
                onChange={handleInputChange}
              />
              <EditField
                labelEn="Street (ตรอก/ซอย/ถนน)"
                labelTh=""
                placeholder="ถนน/ตรอก/ซอย"
                name="addr_street"
                value={formData.address.street}
                onChange={handleInputChange}
              />
              <EditField
                labelEn="Sub-district (แขวง/ตำบล)"
                labelTh=""
                placeholder="แขวง/ตำบล"
                name="addr_subDistrict"
                value={formData.address.subDistrict}
                onChange={handleInputChange}
              />
              <EditField
                labelEn="District (เขต/อำเภอ)"
                labelTh=""
                placeholder="เขต/อำเภอ"
                name="addr_district"
                value={formData.address.district}
                onChange={handleInputChange}
              />
              <EditField
                labelEn="Province (จังหวัด)"
                labelTh=""
                placeholder="จังหวัด"
                name="addr_province"
                value={formData.address.province}
                onChange={handleInputChange}
              />
              <EditField
                labelEn="Country (ประเทศ)"
                labelTh=""
                placeholder="ประเทศ"
                name="addr_country"
                value={formData.address.country}
                onChange={handleInputChange}
              />
              <EditField
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
            <div className="mb-4">
              <h2 className="text-lg font-bold text-foreground">Bank Account</h2>
              <p className="text-xs text-foreground-subtle">ข้อมูลบัญชีธนาคาร</p>
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

              <EditField
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

              <EditField
                labelEn="Account Name"
                labelTh="ชื่อเจ้าของบัญชี"
                placeholder="ชื่อเจ้าของบัญชี"
                name="bank_accountName"
                value={formData.bankInfo.accountName}
                onChange={handleInputChange}
              />

              <EditField
                labelEn="PromptPay Number"
                labelTh="เบอร์พร้อมเพย์"
                placeholder="0XXXXXXXXX"
                name="bank_promptpayNumber"
                type="text"
                value={formData.bankInfo.promptpayNumber}
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
          <div className="mt-8 mb-4 space-y-3">
            <button
              onClick={handleSubmit}
              disabled={submitting || success}
              className="btn-transition btn-sheen w-full min-h-12 rounded-full bg-primary py-3 text-primary-fg disabled:cursor-not-allowed disabled:opacity-50 flex flex-col items-center justify-center"
            >
              <span className="text-base font-medium">
                {submitting ? 'กำลังบันทึก...' : success ? 'บันทึกเรียบร้อย' : 'บันทึกข้อมูล'}
              </span>
              {!submitting && !success && (
                <span className="text-xs font-light opacity-90">Save changes</span>
              )}
            </button>

            <button
              onClick={() => router.back()}
              disabled={submitting}
              className="btn-transition w-full min-h-12 rounded-full border border-primary bg-background-white py-3 text-primary disabled:opacity-50 flex flex-col items-center justify-center"
            >
              <span className="text-base font-medium">ยกเลิก</span>
              <span className="text-xs font-light opacity-80">Cancel</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

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

// Helper Component for Edit Form Fields
const EditField = ({
  labelEn,
  labelTh,
  placeholder,
  value,
  onChange,
  name,
  type = "text",
  required = false
}: {
  labelEn: string;
  labelTh: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
  type?: string;
  required?: boolean;
}) => (
  <div className="mb-4">
    <div className="mb-1">
      <div className="text-sm font-medium text-foreground md:text-base">
        {labelEn} {required && <span className="text-error">*</span>}
      </div>
      {labelTh && <div className="text-xs font-light text-foreground-subtle">{labelTh}</div>}
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
