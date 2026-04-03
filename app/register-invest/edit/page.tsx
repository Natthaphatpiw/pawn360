'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ChevronDown, ChevronLeft } from 'lucide-react';

interface InvestorData {
  investor_id: string;
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
  };
}

const BANK_OPTIONS = [
  'พร้อมเพย์',
  'กสิกรไทย',
  'ไทยพาณิชย์',
  'กรุงเทพ',
  'กรุงไทย',
  'ธนชาต',
  'กรุงศรีอยุธยา',
  'ทหารไทยธนชาต',
];

const ACCOUNT_TYPE_OPTIONS = [
  'บัญชีออมทรัพย์',
  'บัญชีเงินฝากประจำ',
  'บัญชีกระแสรายวัน',
  'บัญชีเงินตราต่างประเทศ',
];

export default function InvestorEditProfile() {
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
      accountName: ''
    }
  });

  useEffect(() => {
    if (liffLoading) return;

    if (liffError || !profile?.userId) {
      setError('ไม่สามารถเชื่อมต่อ LINE LIFF ได้ กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
      return;
    }

    const fetchInvestorData = async () => {
      try {
        const response = await axios.get(`/api/investors/by-line-id/${profile.userId}`);
        if (response.data.success) {
          const data: InvestorData = response.data.investor;
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
              accountName: data.bank_account_name || ''
            }
          });
        }
      } catch (error: any) {
        console.error('Error fetching investor data:', error);
        setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
    };

    fetchInvestorData();
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
      const response = await axios.put('/api/investors/update', {
        lineId: profile.userId,
        ...formData
      });

      if (response.data.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/register-invest');
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
        <div className="dot-bricks"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans">
      <div className="px-4 pt-6 flex justify-center">
        <div className="w-full max-w-md pb-10">
          {success && (
            <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              บันทึกข้อมูลเรียบร้อยแล้ว กำลังกลับไปหน้าโปรไฟล์...
            </div>
          )}

          <div className="rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
            <div className="mb-5 rounded-[24px] border border-white/80 bg-white/70 px-4 py-4">
              <div className="inline-flex rounded-full border border-[#C8D6EC] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#5C76A6]">
                Investor Profile
              </div>
              <div className="mt-3 bg-gradient-to-r from-[#0B3B82] via-[#1E4FA3] to-[#6D8FC8] bg-clip-text text-3xl font-semibold tracking-[0.08em] text-transparent">
                แก้ไขข้อมูล
              </div>
              <p className="mt-1 text-xs text-[#6F7E97]">อัปเดตข้อมูลส่วนตัวและบัญชีธนาคารให้เป็นปัจจุบัน</p>
            </div>

            <div className="mb-2">
              <h2 className="text-lg font-bold text-[#243B62]">Personal Information</h2>
              <p className="text-xs text-[#6F7E97]">ข้อมูลส่วนตัว</p>
            </div>
            <div className="space-y-1">
            <EditField
              labelEn="First name"
              labelTh="ชื่อจริง"
              placeholder="ชื่อจริง"
              name="firstname"
              value={formData.firstname}
              onChange={handleInputChange}
              required
              color="blue"
            />
            <EditField
              labelEn="Last name"
              labelTh="นามสกุล"
              placeholder="นามสกุล"
              name="lastname"
              value={formData.lastname}
              onChange={handleInputChange}
              required
              color="blue"
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
              color="blue"
            />
            <EditField
              labelEn="ID"
              labelTh="เลขบัตรประชาชน 13 หลัก"
              placeholder="X-XXXX-XXXXX-XX-X"
              name="nationalId"
              value={formData.nationalId}
              onChange={handleInputChange}
              color="blue"
            />
            <EditField
              labelEn="Email"
              labelTh="อีเมล"
              placeholder="example@email.com"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              color="blue"
            />
          </div>
          </div>
          
          <div className="mt-4 rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-[#243B62]">Address</h2>
              <p className="text-xs text-[#6F7E97]">ที่อยู่</p>
            </div>
            <div className="space-y-1">
            <EditField
              labelEn="Address (เลขที่)"
              labelTh=""
              placeholder="บ้านเลขที่"
              name="addr_houseNo"
              value={formData.address.houseNo}
              onChange={handleInputChange}
              color="blue"
            />
            <EditField
              labelEn="Village/Building (หมู่บ้าน/อาคาร)"
              labelTh=""
              placeholder="ชื่อหมู่บ้าน/อาคาร"
              name="addr_village"
              value={formData.address.village}
              onChange={handleInputChange}
              color="blue"
            />
            <EditField
              labelEn="Street (ตรอก/ซอย/ถนน)"
              labelTh=""
              placeholder="ถนน/ตรอก/ซอย"
              name="addr_street"
              value={formData.address.street}
              onChange={handleInputChange}
              color="blue"
            />
            <EditField
              labelEn="Sub-district (แขวง/ตำบล)"
              labelTh=""
              placeholder="แขวง/ตำบล"
              name="addr_subDistrict"
              value={formData.address.subDistrict}
              onChange={handleInputChange}
              color="blue"
            />
            <EditField
              labelEn="District (เขต/อำเภอ)"
              labelTh=""
              placeholder="เขต/อำเภอ"
              name="addr_district"
              value={formData.address.district}
              onChange={handleInputChange}
              color="blue"
            />
            <EditField
              labelEn="Province (จังหวัด)"
              labelTh=""
              placeholder="จังหวัด"
              name="addr_province"
              value={formData.address.province}
              onChange={handleInputChange}
              color="blue"
            />
            <EditField
              labelEn="Country (ประเทศ)"
              labelTh=""
              placeholder="ประเทศ"
              name="addr_country"
              value={formData.address.country}
              onChange={handleInputChange}
              color="blue"
            />
            <EditField
              labelEn="Postcode (รหัสไปรษณีย์)"
              labelTh=""
              placeholder="XXXXX"
              name="addr_postcode"
              value={formData.address.postcode}
              onChange={handleInputChange}
              color="blue"
            />
          </div>
          </div>
          
          <div className="mt-4 rounded-[28px] border border-[#D9E3F2] bg-gradient-to-br from-[#F4F8FD] via-[#EEF3FA] to-[#E3EBF8] p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-[#243B62]">Bank Account</h2>
              <p className="text-xs text-[#6F7E97]">ข้อมูลบัญชีธนาคาร</p>
            </div>
            <div className="space-y-1">
            <DropdownField
              labelEn="Bank Name"
              labelTh="ชื่อธนาคาร"
              name="bank_bankName"
              value={formData.bankInfo.bankName}
              placeholder="เลือกธนาคาร"
              options={BANK_OPTIONS}
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
              color="blue"
            />
            <DropdownField
              labelEn="Account Type"
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
              color="blue"
            />
          </div>
          </div>
          
          {error && (
            <div className="my-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="mt-4 space-y-2">
            <button
              onClick={handleSubmit}
              disabled={submitting || success}
              className="flex w-full flex-col items-center justify-center rounded-full bg-gradient-to-r from-[#1E4FA3] to-[#0B3B82] py-2 text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:from-[#18448F] hover:to-[#08306A]"
            >
              <span className="text-base font-medium">
                {submitting ? 'กำลังบันทึก...' : success ? 'บันทึกเรียบร้อย' : 'บันทึก'}
              </span>
              {!submitting && !success && (
                <span className="text-xs font-light opacity-90">Save</span>
              )}
            </button>

            <button
              onClick={() => router.back()}
              disabled={submitting}
              className="w-full rounded-full bg-[#E6EBF2] py-2 text-[#06367B] flex flex-col items-center justify-center transition-colors active:scale-[0.98] disabled:opacity-50 hover:bg-[#B2C1D6]"
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

// Helper Component for Edit Form Fields
const EditField = ({
  labelEn,
  labelTh,
  placeholder,
  value,
  onChange,
  name,
  type = "text",
  required = false,
  color = "blue"
}: {
  labelEn: string;
  labelTh: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
  type?: string;
  required?: boolean;
  color?: "orange" | "blue";
}) => {
  const ringColor = color === "blue" ? "focus:ring-[#06367B]" : "focus:ring-[#06367B]";
  
  return (
    <div className="mb-4">
      <div className="mb-1">
        <div className="text-sm font-medium text-gray-800 md:text-base">
          {labelEn} {required && <span className="text-red-500">*</span>}
        </div>
        {labelTh && <div className="text-xs font-light text-[#6F7E97]">{labelTh}</div>}
      </div>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`w-full rounded-xl border border-[#CCD6E6] bg-white px-3 py-3 text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-1 ${ringColor}`}
      />
    </div>
  );
};
