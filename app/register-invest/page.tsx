'use client';

import React, { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface InvestorData {
  investor_id: string;
  line_id: string;
  firstname: string;
  lastname: string;
  kyc_status: string;
  stats: {
    totalContracts: number;
    activeContracts: number;
    endedContracts: number;
    totalInvestedAmount: number;
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

export default function InvestorRegister() {
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [investorData, setInvestorData] = useState<InvestorData | null>(null);
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

  // Check if user exists in database and KYC status
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
      try {
        const response = await axios.get(`/api/investors/check?lineId=${profile.userId}`);
        if (response.data.exists) {
          const investor = response.data.investor;
          // Always show profile; UI will gate actions by kyc_status
          setInvestorData(investor);
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
      const response = await axios.post('/api/investors/register', {
        lineId: profile.userId,
        ...formData
      });

      if (response.data.success) {
        // Redirect to eKYC page for investors
        router.push('/ekyc-invest');
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A]"></div>
      </div>
    );
  }

  // If user exists, show profile page
  if (investorData) {
    return (
      <div className="min-h-screen bg-white font-sans p-4 flex flex-col items-center">
        {/* Credit Limit Card */}
        <div className="w-full max-w-sm bg-[#E9EFF6] rounded-2xl p-6 text-center mb-4 mt-2">
          <h2 className="text-[#1E3A8A] text-lg font-medium mb-1">วงเงินลงทุน</h2>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-3xl font-bold text-gray-800">
              {investorData.stats.totalInvestedAmount.toLocaleString()}
            </span>
            <span className="text-gray-400 text-sm font-light">บาท</span>
          </div>
        </div>

        {/* Profile & Stats Card */}
        <div className="w-full max-w-sm bg-[#E9EFF6] rounded-3xl p-6 pt-10 pb-8 shadow-sm mb-auto relative">
          {/* Inner White Profile Card */}
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm mb-8 mx-2">
            <h1 className="text-xl font-bold text-gray-800 mb-2">
              {investorData.firstname} {investorData.lastname}
            </h1>
            <p className="text-gray-400 text-sm font-light">
              Investor ID: {investorData.investor_id.substring(0, 8)}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2 text-center divide-x divide-[#D1D9E6]">
            <div className="px-1">
              <div className="text-2xl font-bold text-gray-700 mb-1">
                {investorData.stats.totalContracts}
              </div>
              <div className="text-xs text-gray-600 font-medium">
                สัญญาทั้งหมด
              </div>
            </div>
            <div className="px-1">
              <div className="text-2xl font-bold text-gray-700 mb-1">
                {investorData.stats.activeContracts}
              </div>
              <div className="text-xs text-gray-600 font-medium">
                สัญญายังไม่สิ้นสุด
              </div>
            </div>
            <div className="px-1">
              <div className="text-2xl font-bold text-gray-700 mb-1">
                {investorData.stats.endedContracts}
              </div>
              <div className="text-xs text-gray-600 font-medium">
                สัญญาสิ้นสุดแล้ว
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full max-w-sm space-y-3">
          {/* Portfolio Button */}
          <button
            onClick={() => router.push('/investor/portfolio')} // TODO: Create portfolio page
            className="w-full bg-[#E9EFF6] hover:bg-[#D4E4F7] text-[#1E3A8A] rounded-2xl py-3 flex flex-col items-center justify-center transition-colors shadow-sm active:scale-[0.98]"
          >
            <span className="text-base font-bold">ดูพอร์ตการลงทุน</span>
            <span className="text-[10px] opacity-80 font-light">View investment portfolio</span>
          </button>

          {/* Verify Identity Button - show when not VERIFIED */}
          {investorData.kyc_status !== 'VERIFIED' && (
            <button
              onClick={() => {
                if (investorData.kyc_status === 'PENDING') {
                  router.push('/ekyc-invest/waiting');
                } else {
                  router.push('/ekyc-invest');
                }
              }}
              className="w-full bg-[#1E3A8A] hover:bg-[#152C6B] text-white rounded-2xl py-3 flex flex-col items-center justify-center transition-colors shadow-sm active:scale-[0.98]"
            >
              <span className="text-base font-bold">ยืนยันตัวตน</span>
              <span className="text-[10px] opacity-80 font-light">Verify identity</span>
            </button>
          )}
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
      <div className="text-gray-800 font-bold text-sm md:text-base">{labelEn}</div>
      <div className="text-gray-500 text-xs font-light">{labelTh}</div>
    </div>
    <input
      type={type}
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1E3A8A] text-gray-800"
    />
  </div>
);

// Bank Dropdown Component
const BankDropdown = ({
  value,
  onChange
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) => {
  const banks = [
    "ธนาคารกสิกรไทย (KBANK)",
    "ธนาคารไทยพาณิชย์ (SCB)",
    "ธนาคารกรุงเทพ (BBL)",
    "ธนาคารกรุงไทย (KTB)",
    "ธนาคารกรุงศรีอยุธยา (BAY)",
    "ธนาคารทหารไทยธนชาต (TTB)",
    "ธนาคารออมสิน (GSB)",
    "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (BAAC)",
    "ธนาคารอาคารสงเคราะห์ (GH Bank)",
    "ธนาคารเกียรตินาคินภัทร (KKP)",
    "ธนาคารซีไอเอ็มบี ไทย (CIMB)",
    "ธนาคารยูโอบี (UOB)",
    "ธนาคารแลนด์ แอนด์ เฮ้าส์ (LH Bank)",
    "ธนาคารทิสโก้ (TISCO)",
    "พร้อมเพย์ (PromptPay)"
  ];

  return (
    <div className="mb-4">
      <div className="mb-1">
        <div className="text-gray-800 font-bold text-sm md:text-base">Bank name</div>
        <div className="text-gray-500 text-xs font-light">ชื่อธนาคาร</div>
      </div>
      <select
        name="bank_bankName"
        value={value}
        onChange={onChange}
        className="w-full p-3 pr-10 bg-white border border-gray-300 rounded-lg appearance-none focus:outline-none focus:ring-1 focus:ring-[#1E3A8A] text-gray-800"
      >
        <option value="" disabled selected>เลือกธนาคาร</option>
        {banks.map((bank, index) => (
          <option key={index} value={bank}>{bank}</option>
        ))}
      </select>
    </div>
  );
};

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
    <div className="min-h-screen bg-[#F2F2F2] font-sans px-4 py-6 flex justify-center">
      <div className="w-full max-w-md pb-20">

        {/* Personal Info */}
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

        <div className="h-px bg-gray-300 my-6 opacity-50"></div>

        {/* Address */}
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-800">Address</h2>
          <p className="text-gray-500 text-xs">ที่อยู่</p>
        </div>

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

        <div className="h-px bg-gray-300 my-6 opacity-50"></div>

        {/* Bank Info */}
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-800">Bank Account</h2>
          <p className="text-gray-500 text-xs">ข้อมูลบัญชีธนาคาร</p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-6">
          <p className="text-gray-400 text-xs mb-4 font-light">โปรดกรอกข้อมูลบัญชีสำหรับรับเงิน</p>

          <BankDropdown
            value={formData.bankInfo.bankName}
            onChange={handleInputChange}
          />

          <RegisterField
            labelEn="Account no."
            labelTh="หมายเลขบัญชี"
            placeholder="0000000000"
            name="bank_accountNo"
            type="tel"
            value={formData.bankInfo.accountNo}
            onChange={handleInputChange}
          />

          {/* Account Type Dropdown */}
          <div className="mb-4">
            <div className="mb-1">
              <div className="text-gray-800 font-bold text-sm md:text-base">Account type</div>
              <div className="text-gray-500 text-xs font-light">ประเภทบัญชี</div>
            </div>
            <select
              name="bank_accountType"
              value={formData.bankInfo.accountType}
              onChange={handleInputChange}
              className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1E3A8A] text-gray-800"
            >
              <option value="">เลือกประเภทบัญชี</option>
              <option value="บัญชีออมทรัพย์">บัญชีออมทรัพย์</option>
              <option value="บัญชีเงินฝากประจำ">บัญชีเงินฝากประจำ</option>
              <option value="บัญชีกระแสรายวัน">บัญชีกระแสรายวัน</option>
              <option value="บัญชีเงินตราต่างประเทศ">บัญชีเงินตราต่างประเทศ</option>
            </select>
          </div>

          <RegisterField
            labelEn="Account name"
            labelTh="ชื่อบัญชี"
            placeholder="ชื่อ-นามสกุลเจ้าของบัญชี"
            name="bank_accountName"
            value={formData.bankInfo.accountName}
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
        <div className="mt-8 mb-4">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-[#1E3A8A] hover:bg-[#152C6B] text-white rounded-2xl py-4 flex flex-col items-center justify-center shadow-sm transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-base font-bold">
              {submitting ? 'กำลังบันทึก...' : 'ดำเนินการต่อ'}
            </span>
            {!submitting && (
              <span className="text-[10px] font-light opacity-90">Continue</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}