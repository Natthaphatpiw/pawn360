'use client';

import { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

type RegistrationType = 'new' | 'existing' | null;

interface Store {
  _id: string;
  storeName: string;
}

export default function StoreRegisterPage() {
  const { profile, isLoading, error: liffError } = useLiff();
  const [registrationType, setRegistrationType] = useState<RegistrationType>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form data for new store
  const [formData, setFormData] = useState({
    storeName: '',
    ownerFullName: '',
    ownerEmail: '',
    ownerPassword: '',
    phone: '',
    taxId: '',
    houseNumber: '',
    village: '',
    street: '',
    subDistrict: '',
    district: '',
    province: '',
    country: 'ประเทศไทย',
    postcode: '',
  });

  // Fetch stores if user selects existing
  useEffect(() => {
    if (registrationType === 'existing') {
      fetchStores();
    }
  }, [registrationType]);

  const fetchStores = async () => {
    try {
      const response = await axios.get('/api/stores');
      if (response.data.success) {
        setStores(response.data.stores);
      }
    } catch (err: any) {
      setError('ไม่สามารถโหลดรายการร้านค้าได้');
    }
  };

  const handleNewStoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!profile?.userId) {
        throw new Error('ไม่พบ LINE User ID');
      }

      const response = await axios.post('/api/stores/register', {
        lineId: profile.userId,
        storeName: formData.storeName,
        phone: formData.phone,
        taxId: formData.taxId,
        ownerData: {
          fullName: formData.ownerFullName,
          email: formData.ownerEmail,
          password: formData.ownerPassword,
        },
        address: {
          houseNumber: formData.houseNumber,
          village: formData.village,
          street: formData.street,
          subDistrict: formData.subDistrict,
          district: formData.district,
          province: formData.province,
          country: formData.country,
          postcode: formData.postcode,
        },
      });

      if (response.data.success) {
        setSuccess('ลงทะเบียนร้านค้าสำเร็จ');
        setTimeout(() => {
          window.location.href = '/store/dashboard';
        }, 2000);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการลงทะเบียน');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExistingStoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!profile?.userId) {
        throw new Error('ไม่พบ LINE User ID');
      }

      if (!selectedStoreId) {
        throw new Error('กรุณาเลือกร้านค้า');
      }

      const response = await axios.post('/api/stores/link-employee', {
        lineId: profile.userId,
        storeId: selectedStoreId,
        password,
      });

      if (response.data.success) {
        setSuccess(`เชื่อมโยงกับร้าน ${response.data.storeName} สำเร็จ`);
        setTimeout(() => {
          window.location.href = '/store/dashboard';
        }, 2000);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการเชื่อมโยง');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (liffError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold text-lg mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-red-600">{liffError}</p>
        </div>
      </div>
    );
  }

  // Selection screen
  if (!registrationType) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            ลงทะเบียนร้านค้า
          </h1>

          <div className="space-y-4">
            <button
              onClick={() => setRegistrationType('new')}
              className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold hover:bg-blue-700 transition"
            >
              ร้านใหม่ - สร้างร้านค้าใหม่
            </button>

            <button
              onClick={() => setRegistrationType('existing')}
              className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold hover:bg-green-700 transition"
            >
              ร้านเดิม - เชื่อมโยงกับร้านที่มีอยู่
            </button>
          </div>
        </div>
      </div>
    );
  }

  // New store registration form
  if (registrationType === 'new') {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setRegistrationType(null)}
            className="mb-4 text-blue-600 hover:text-blue-800"
          >
            ← กลับ
          </button>

          <h1 className="text-2xl font-bold text-gray-800 mb-6">ลงทะเบียนร้านค้าใหม่</h1>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-600">{success}</p>
            </div>
          )}

          <form onSubmit={handleNewStoreSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-6">
            {/* Store Information */}
            <div>
              <h2 className="text-lg font-semibold text-gray-700 mb-4">ข้อมูลร้านค้า</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ชื่อร้านค้า *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.storeName}
                    onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    เบอร์โทรศัพท์ *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    เลขประจำตัวผู้เสียภาษี
                  </label>
                  <input
                    type="text"
                    value={formData.taxId}
                    onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Owner Information */}
            <div>
              <h2 className="text-lg font-semibold text-gray-700 mb-4">ข้อมูลเจ้าของ</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ชื่อ-นามสกุล *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.ownerFullName}
                    onChange={(e) => setFormData({ ...formData, ownerFullName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    อีเมล *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.ownerEmail}
                    onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    รหัสผ่าน *
                  </label>
                  <input
                    type="password"
                    required
                    value={formData.ownerPassword}
                    onChange={(e) => setFormData({ ...formData, ownerPassword: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <h2 className="text-lg font-semibold text-gray-700 mb-4">ที่อยู่</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    บ้านเลขที่ *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.houseNumber}
                    onChange={(e) => setFormData({ ...formData, houseNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">หมู่บ้าน</label>
                  <input
                    type="text"
                    value={formData.village}
                    onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">ถนน</label>
                  <input
                    type="text"
                    value={formData.street}
                    onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ตำบล/แขวง *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.subDistrict}
                    onChange={(e) => setFormData({ ...formData, subDistrict: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    อำเภอ/เขต *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    จังหวัด *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.province}
                    onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    รหัสไปรษณีย์ *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.postcode}
                    onChange={(e) => setFormData({ ...formData, postcode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white py-3 rounded-md font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'กำลังลงทะเบียน...' : 'ลงทะเบียน'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Existing store link form
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <button
          onClick={() => setRegistrationType(null)}
          className="mb-4 text-blue-600 hover:text-blue-800"
        >
          ← กลับ
        </button>

        <h1 className="text-2xl font-bold text-gray-800 mb-6">เชื่อมโยงกับร้านค้า</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-600">{success}</p>
          </div>
        )}

        <form onSubmit={handleExistingStoreSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              เลือกร้านค้า *
            </label>
            <select
              required
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- เลือกร้านค้า --</option>
              {stores.map((store) => (
                <option key={store._id} value={store._id}>
                  {store.storeName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              รหัสผ่านร้านค้า *
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-green-600 text-white py-3 rounded-md font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'กำลังเชื่อมโยง...' : 'ยืนยัน'}
          </button>
        </form>
      </div>
    </div>
  );
}
