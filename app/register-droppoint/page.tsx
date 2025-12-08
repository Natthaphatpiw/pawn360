'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { MapPin, Phone, Mail, Clock, User, Building2 } from 'lucide-react';

function RegisterDropPointContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { liffObject, profile, isLoggedIn, isLoading: liffLoading } = useLiff();

  const [loading, setLoading] = useState(false);
  const [existingDropPoint, setExistingDropPoint] = useState<any>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);

  const [formData, setFormData] = useState({
    drop_point_name: '',
    drop_point_code: '',
    phone_number: '',
    email: '',
    addr_house_no: '',
    addr_village: '',
    addr_street: '',
    addr_sub_district: '',
    addr_district: '',
    addr_province: '',
    addr_postcode: '',
    google_map_url: '',
    manager_name: '',
    manager_phone: '',
    opening_hours: {
      monday: '09:00-18:00',
      tuesday: '09:00-18:00',
      wednesday: '09:00-18:00',
      thursday: '09:00-18:00',
      friday: '09:00-18:00',
      saturday: '10:00-16:00',
      sunday: 'ปิดทำการ'
    }
  });

  // Check if drop point already exists
  useEffect(() => {
    if (profile?.userId) {
      checkExistingDropPoint();
    }
  }, [profile]);

  const checkExistingDropPoint = async () => {
    try {
      setCheckingExisting(true);
      const response = await axios.get(`/api/drop-points/by-line-id/${profile?.userId}`);
      if (response.data.dropPoint) {
        setExistingDropPoint(response.data.dropPoint);
      }
    } catch (error) {
      // Not found - that's ok
    } finally {
      setCheckingExisting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile?.userId) {
      alert('กรุณาเข้าสู่ระบบ LINE');
      return;
    }

    try {
      setLoading(true);

      const response = await axios.post('/api/drop-points/register', {
        ...formData,
        line_id: profile.userId,
        manager_line_id: profile.userId
      });

      if (response.data.success) {
        alert('ลงทะเบียน Drop Point สำเร็จ!');
        setExistingDropPoint(response.data.dropPoint);
      }
    } catch (error: any) {
      console.error('Error registering drop point:', error);
      alert(error.response?.data?.error || 'เกิดข้อผิดพลาดในการลงทะเบียน');
    } finally {
      setLoading(false);
    }
  };

  if (liffLoading || checkingExisting) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#365314] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  // Show profile if already registered
  if (existingDropPoint) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] font-sans p-4">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="text-center mb-6 pt-4">
            <div className="w-20 h-20 rounded-full bg-[#365314] mx-auto mb-3 flex items-center justify-center">
              <Building2 className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-800">{existingDropPoint.drop_point_name}</h1>
            <p className="text-sm text-gray-500">รหัส: {existingDropPoint.drop_point_code}</p>
          </div>

          {/* Info Card */}
          <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
            <h2 className="font-bold text-gray-800 mb-4">ข้อมูล Drop Point</h2>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#365314] mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">
                    {existingDropPoint.addr_house_no} {existingDropPoint.addr_street} {existingDropPoint.addr_sub_district} {existingDropPoint.addr_district} {existingDropPoint.addr_province} {existingDropPoint.addr_postcode}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-[#365314]" />
                <p className="text-sm text-gray-600">{existingDropPoint.phone_number}</p>
              </div>

              {existingDropPoint.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-[#365314]" />
                  <p className="text-sm text-gray-600">{existingDropPoint.email}</p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-[#365314]" />
                <p className="text-sm text-gray-600">ผู้จัดการ: {existingDropPoint.manager_name}</p>
              </div>
            </div>
          </div>

          {/* Status Card */}
          <div className={`rounded-2xl p-4 ${existingDropPoint.is_active ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700">สถานะ</span>
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                existingDropPoint.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {existingDropPoint.is_active ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              คุณได้ลงทะเบียนเป็น Drop Point แล้ว<br />
              รอรับแจ้งเตือนสินค้าที่จะส่งมาที่สาขาของคุณทาง LINE
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] font-sans pb-10">
      {/* Header */}
      <div className="bg-[#365314] text-white p-6 pb-10">
        <h1 className="text-xl font-bold text-center">ลงทะเบียน Drop Point</h1>
        <p className="text-sm text-center opacity-80 mt-1">สมัครเป็นจุดรับ-ส่งสินค้าจำนำ</p>
      </div>

      {/* Form */}
      <div className="px-4 -mt-4">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 shadow-sm">

          {/* Business Info */}
          <div className="mb-6">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#365314]" />
              ข้อมูลร้าน/สาขา
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ Drop Point *</label>
                <input
                  type="text"
                  name="drop_point_name"
                  value={formData.drop_point_name}
                  onChange={handleChange}
                  required
                  className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                  placeholder="เช่น Pawn360 สาขาสยาม"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">รหัสสาขา *</label>
                <input
                  type="text"
                  name="drop_point_code"
                  value={formData.drop_point_code}
                  onChange={handleChange}
                  required
                  className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                  placeholder="เช่น DP-001"
                />
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="mb-6">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Phone className="w-5 h-5 text-[#365314]" />
              ข้อมูลติดต่อ
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์ *</label>
                <input
                  type="tel"
                  name="phone_number"
                  value={formData.phone_number}
                  onChange={handleChange}
                  required
                  className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                  placeholder="0XX-XXX-XXXX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                  placeholder="example@email.com"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="mb-6">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#365314]" />
              ที่อยู่
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่ *</label>
                  <input
                    type="text"
                    name="addr_house_no"
                    value={formData.addr_house_no}
                    onChange={handleChange}
                    required
                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">หมู่บ้าน/อาคาร</label>
                  <input
                    type="text"
                    name="addr_village"
                    value={formData.addr_village}
                    onChange={handleChange}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ถนน</label>
                <input
                  type="text"
                  name="addr_street"
                  value={formData.addr_street}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">แขวง/ตำบล *</label>
                  <input
                    type="text"
                    name="addr_sub_district"
                    value={formData.addr_sub_district}
                    onChange={handleChange}
                    required
                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เขต/อำเภอ *</label>
                  <input
                    type="text"
                    name="addr_district"
                    value={formData.addr_district}
                    onChange={handleChange}
                    required
                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">จังหวัด *</label>
                  <input
                    type="text"
                    name="addr_province"
                    value={formData.addr_province}
                    onChange={handleChange}
                    required
                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">รหัสไปรษณีย์ *</label>
                  <input
                    type="text"
                    name="addr_postcode"
                    value={formData.addr_postcode}
                    onChange={handleChange}
                    required
                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Google Maps URL</label>
                <input
                  type="url"
                  name="google_map_url"
                  value={formData.google_map_url}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                  placeholder="https://maps.google.com/..."
                />
              </div>
            </div>
          </div>

          {/* Manager Info */}
          <div className="mb-6">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-[#365314]" />
              ข้อมูลผู้จัดการ
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้จัดการ *</label>
                <input
                  type="text"
                  name="manager_name"
                  value={formData.manager_name}
                  onChange={handleChange}
                  required
                  className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรผู้จัดการ *</label>
                <input
                  type="tel"
                  name="manager_phone"
                  value={formData.manager_phone}
                  onChange={handleChange}
                  required
                  className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365314]"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#365314] hover:bg-[#2d4610] text-white rounded-2xl py-4 flex flex-col items-center justify-center shadow-sm transition-colors active:scale-[0.98] disabled:opacity-50"
          >
            <span className="text-base font-bold">{loading ? 'กำลังบันทึก...' : 'ลงทะเบียน'}</span>
            <span className="text-[10px] font-light opacity-80">Register</span>
          </button>
        </form>
      </div>
    </div>
  );
}

export default function RegisterDropPointPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#365314] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <RegisterDropPointContent />
    </Suspense>
  );
}
