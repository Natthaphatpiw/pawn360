'use client';

import React, { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter } from 'next/navigation';
import axios from 'axios';

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
  const [loading, setLoading] = useState(true);

  console.log('🔍 PawnerRegister state:', {
    liffLoading,
    liffError,
    loading,
    hasProfile: !!profile,
    userId: profile?.userId
  });
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

  // Check if user exists in database and KYC status
  useEffect(() => {
    console.log('🔄 useEffect triggered:', { liffLoading, liffError, hasProfile: !!profile });

    if (liffLoading) {
      console.log('⏳ LIFF still loading...');
      return;
    }

    if (liffError) {
      console.error('❌ LIFF error:', liffError);
      setError('ไม่สามารถเชื่อมต่อ LINE LIFF ได้ กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
      return;
    }

    if (!profile?.userId) {
      console.warn('⚠️ No profile userId found');
      setError('ไม่พบ LINE profile กรุณาเปิดลิงก์ผ่าน LINE LIFF');
      setLoading(false);
      return;
    }

    const checkUser = async () => {
      console.log('🔍 Checking user with lineId:', profile.userId);
      try {
        const response = await axios.get(`/api/pawners/check?lineId=${profile.userId}`);
        console.log('✅ Pawner check response:', response.data);

        if (response.data.exists) {
          const pawner = response.data.pawner;
          console.log('👤 Pawner found:', pawner);
          // Always show profile; UI will gate actions by kyc_status
          setPawnerData(pawner);
        } else {
          console.log('👤 Pawner not found - showing registration form');
        }
      } catch (error: any) {
        console.error('❌ Error checking pawner:', error);
        setError('เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ใช้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        console.log('🏁 Setting loading to false');
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
    console.log('⏳ Showing loading spinner:', { liffLoading, loading });
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C0562F]"></div>
      </div>
    );
  }

  // If user exists, show profile page
  if (pawnerData) {
    return (
      <div className="min-h-screen bg-white font-sans p-4 flex flex-col items-center">
        
        {/* Member Card Container */}
        <div className="w-full max-w-sm bg-[#F9EFE6] rounded-3xl p-6 pt-10 pb-8 shadow-sm mb-6 relative mt-4">
          
          {/* Inner White Card (Profile Info) */}
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm mb-6 mx-2">
            <h1 className="text-lg font-bold text-gray-800 mb-1">
              {pawnerData.firstname} {pawnerData.lastname}
            </h1>
            <p className="text-gray-400 text-xs font-light">
              Member ID: {pawnerData.customer_id.substring(0, 8)}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2 text-center divide-x divide-[#E0C8B6]">
            <div className="px-1">
              <div className="text-xl font-bold text-gray-700 mb-1">
                {pawnerData.stats.totalContracts}
              </div>
              <div className="text-[10px] text-gray-600 font-medium">
                สัญญาทั้งหมด
              </div>
            </div>

            <div className="px-1">
              <div className="text-xl font-bold text-gray-700 mb-1">
                {pawnerData.stats.activeContracts}
              </div>
              <div className="text-[10px] text-gray-600 font-medium">
                สัญญายังไม่สิ้นสุด
              </div>
            </div>

            <div className="px-1">
              <div className="text-xl font-bold text-gray-700 mb-1">
                {pawnerData.stats.endedContracts}
              </div>
              <div className="text-[10px] text-gray-600 font-medium">
                สัญญาสิ้นสุดแล้ว
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full max-w-sm space-y-3">

          {/* Pawn Entry Button */}
          <button
            onClick={() => router.push('/estimate')}
            className="w-full bg-[#F9EFE6] hover:bg-[#F0E0D0] text-[#A0522D] rounded-2xl py-3 flex flex-col items-center justify-center transition-colors shadow-sm active:scale-[0.98]"
          >
            <span className="text-base font-bold">จำนำสินค้า</span>
            <span className="text-[10px] opacity-80 font-light">Pawn entry</span>
          </button>

          {/* Contract List Button */}
          <button
            onClick={() => router.push('/pawner/list-item')}
            className="w-full bg-white border border-[#C08D6E] hover:bg-gray-50 text-[#C0562F] rounded-2xl py-3 flex flex-col items-center justify-center transition-colors active:scale-[0.98]"
          >
            <span className="text-base font-bold">รายการจำนำ</span>
            <span className="text-[10px] opacity-80 font-light">Contract list</span>
          </button>

          {/* Verify Identity Button - show when not VERIFIED */}
          {pawnerData.kyc_status !== 'VERIFIED' && (
            <button
              onClick={() => {
                if (pawnerData.kyc_status === 'PENDING') {
                  router.push('/ekyc/waiting');
                } else {
                  router.push('/ekyc');
                }
              }}
              className="w-full bg-[#C0562F] hover:bg-[#A04D2D] text-white rounded-2xl py-3 flex flex-col items-center justify-center transition-colors shadow-sm active:scale-[0.98]"
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
      className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C0562F] text-gray-800"
    />
  </div>
);

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
        
        {/* Personal Info Group */}
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

        <div className="h-px bg-gray-300 my-6"></div>

        {/* Address Header */}
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-800">Address</h2>
          <p className="text-gray-500 text-xs">ที่อยู่</p>
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

        <div className="h-px bg-gray-300 my-6"></div>

        {/* Bank Account Header */}
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-800">Bank Account (Optional)</h2>
          <p className="text-gray-500 text-xs">ข้อมูลบัญชีธนาคาร (ไม่บังคับ)</p>
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
            </select>
          </div>

          <RegisterField
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

          <RegisterField
            labelEn="Account Name"
            labelTh="ชื่อเจ้าของบัญชี"
            placeholder="ชื่อเจ้าของบัญชี"
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
            className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-4 flex flex-col items-center justify-center shadow-sm transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
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
