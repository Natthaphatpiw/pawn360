'use client';

import React, { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ChevronLeft } from 'lucide-react';

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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C0562F]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans">
      {/* Header */}
      <div className="bg-white sticky top-0 z-10 shadow-sm">
        <div className="px-4 py-4 flex items-center">
          <button
            onClick={() => router.back()}
            className="mr-3 text-[#C0562F] hover:bg-[#FFF5F0] p-2 rounded-full transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-800">แก้ไขข้อมูล</h1>
            <p className="text-xs text-gray-500">Edit profile</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 flex justify-center">
        <div className="w-full max-w-md pb-20">

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              บันทึกข้อมูลเรียบร้อยแล้ว กำลังกลับไปหน้าโปรไฟล์...
            </div>
          )}

          {/* Personal Info Group */}
          <div className="space-y-1">
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

          <div className="h-px bg-gray-300 my-6"></div>

          {/* Address Header */}
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-800">Address</h2>
            <p className="text-gray-500 text-xs">ที่อยู่</p>
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

          <div className="h-px bg-gray-300 my-6"></div>

          {/* Bank Account Header */}
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-800">Bank Account</h2>
            <p className="text-gray-500 text-xs">ข้อมูลบัญชีธนาคาร</p>
          </div>

          {/* Bank Account Fields Group */}
          <div className="space-y-1">
            {/* Bank Name Dropdown */}
            <div className="mb-4">
              <div className="mb-1">
                <div className="text-gray-800 font-bold text-sm md:text-base">Bank Name</div>
                <div className="text-gray-500 text-xs font-light">ชื่อธนาคาร</div>
              </div>
              <select
                name="bank_bankName"
                value={formData.bankInfo.bankName}
                onChange={handleInputChange}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C0562F] text-gray-800"
              >
                <option value="">เลือกธนาคาร</option>
                <option value="พร้อมเพย์">พร้อมเพย์</option>
                <option value="กสิกรไทย">กสิกรไทย</option>
                <option value="ไทยพาณิชย์">ไทยพาณิชย์</option>
                <option value="กรุงเทพ">กรุงเทพ</option>
                <option value="กรุงไทย">กรุงไทย</option>
                <option value="ธนชาต">ธนชาต</option>
                <option value="กรุงศรีอยุธยา">กรุงศรีอยุธยา</option>
                <option value="ทหารไทยธนชาต">ทหารไทยธนชาต</option>
                <option value="ไทยพาณิชย์">ไทยพาณิชย์</option>
              </select>
            </div>

            <EditField
              labelEn="Account No."
              labelTh="หมายเลขบัญชี"
              placeholder="0000000000"
              name="bank_accountNo"
              type="text"
              value={formData.bankInfo.accountNo}
              onChange={handleInputChange}
            />

            {/* Account Type Dropdown */}
            <div className="mb-4">
              <div className="mb-1">
                <div className="text-gray-800 font-bold text-sm md:text-base">Account Type</div>
                <div className="text-gray-500 text-xs font-light">ประเภทบัญชี</div>
              </div>
              <select
                name="bank_accountType"
                value={formData.bankInfo.accountType}
                onChange={handleInputChange}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C0562F] text-gray-800"
              >
                <option value="">เลือกประเภทบัญชี</option>
                <option value="บัญชีออมทรัพย์">บัญชีออมทรัพย์</option>
                <option value="บัญชีเงินฝากประจำ">บัญชีเงินฝากประจำ</option>
                <option value="บัญชีกระแสรายวัน">บัญชีกระแสรายวัน</option>
                <option value="บัญชีเงินตราต่างประเทศ">บัญชีเงินตราต่างประเทศ</option>
              </select>
            </div>

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

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <div className="mt-8 mb-4 space-y-3">
            <button
              onClick={handleSubmit}
              disabled={submitting || success}
              className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-4 flex flex-col items-center justify-center shadow-sm transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-base font-bold">
                {submitting ? 'กำลังบันทึก...' : success ? 'บันทึกเรียบร้อย' : 'บันทึกข้อมูล'}
              </span>
              {!submitting && !success && (
                <span className="text-[10px] font-light opacity-90">Save changes</span>
              )}
            </button>

            <button
              onClick={() => router.back()}
              disabled={submitting}
              className="w-full bg-white border border-[#C0562F] hover:bg-gray-50 text-[#C0562F] rounded-2xl py-4 flex flex-col items-center justify-center transition-colors active:scale-[0.98] disabled:opacity-50"
            >
              <span className="text-base font-bold">ยกเลิก</span>
              <span className="text-[10px] font-light opacity-80">Cancel</span>
            </button>
          </div>

        </div>
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
      <div className="text-gray-800 font-bold text-sm md:text-base">
        {labelEn} {required && <span className="text-red-500">*</span>}
      </div>
      {labelTh && <div className="text-gray-500 text-xs font-light">{labelTh}</div>}
    </div>
    <input
      type={type}
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C0562F] text-gray-800"
    />
  </div>
);
