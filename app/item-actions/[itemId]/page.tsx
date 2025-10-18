'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import Image from 'next/image';

interface Item {
  _id: string;
  brand: string;
  model: string;
  type: string;
  serialNo?: string;
  condition: number;
  defects?: string;
  note?: string;
  accessories?: string;
  images: string[];
  status: string;
  estimatedValue?: number;
  desiredAmount?: number;
  loanDays?: number;
  interestRate?: number;
}

interface Store {
  _id: string;
  storeName: string;
  interestRate?: number;
}

interface Customer {
  _id: string;
  lineId: string;
  fullName: string;
  phone: string;
  contractsID: string[];
  storeId: string[];
  pawnRequests: any[];
}

export default function ItemActionsPage() {
  const params = useParams();
  const itemId = params.itemId as string;
  const { profile, isLoading, error: liffError } = useLiff();

  const [item, setItem] = useState<Item | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [pawnDuration, setPawnDuration] = useState<string>('30');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.userId && itemId) {
      fetchItemDetails();
      fetchStores();
      checkCustomerExists();
    }
  }, [profile, itemId]);

  const fetchItemDetails = async () => {
    try {
      const response = await axios.get(`/api/items/${itemId}`);
      setItem(response.data.item);
    } catch (err: any) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูลสินค้า');
    }
  };

  const fetchStores = async () => {
    try {
      const response = await axios.get('/api/stores');
      setStores(response.data.stores);
    } catch (err: any) {
      console.error('Error fetching stores:', err);
    }
  };

  const checkCustomerExists = async () => {
    try {
      const response = await axios.get(`/api/users/check?lineId=${profile.userId}`);
      if (response.data.exists) {
        setCustomer(response.data.customer);
      }
    } catch (err: any) {
      console.error('Error checking customer:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStoreSelect = (storeId: string) => {
    setSelectedStore(storeId);
  };

  const calculateInterest = () => {
    if (!item?.estimatedValue) return 0;
    const store = stores.find(s => s._id === selectedStore);
    const interestRate = store?.interestRate || 10;
    const days = parseInt(pawnDuration);
    const monthlyRate = interestRate / 100 / 30;
    return Math.round(item.estimatedValue * monthlyRate * days);
  };

  const handleContinue = () => {
    if (!selectedStore) {
      setError('กรุณาเลือกร้านจำนำ');
      return;
    }

    if (!customer) {
      setError('กรุณาลงทะเบียนก่อนดำเนินการต่อ');
      return;
    }

    // Navigate to pawn setup with item data
    window.location.href = `/estimate?itemId=${itemId}&storeId=${selectedStore}&duration=${pawnDuration}`;
  };

  const handleRegister = () => {
    window.location.href = '/register';
  };

  const handleSaveTemporary = async () => {
    // Item is already saved, just show success message
    setSuccess('สินค้านี้บันทึกไว้แล้ว');
    setTimeout(() => setSuccess(null), 2000);
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (liffError || error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{liffError || error}</p>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">ไม่พบข้อมูลสินค้า</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto bg-white min-h-screen">
        {/* Header */}
        <div className="bg-blue-600 text-white p-4">
          <h1 className="text-xl font-bold text-center">เลือกการดำเนินการ</h1>
        </div>

        {/* Item Details */}
        <div className="p-4">
          {/* Item Image */}
          {item.images && item.images.length > 0 && (
            <div className="mb-6">
              <Image
                src={item.images[0]}
                alt={item.brand + ' ' + item.model}
                width={200}
                height={200}
                className="w-full max-w-xs mx-auto rounded-lg object-cover"
              />
            </div>
          )}

          {/* Item Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-lg mb-2">{item.brand} {item.model}</h3>
            <div className="space-y-1 text-sm text-gray-600">
              <p><span className="font-medium">ประเภท:</span> {item.type}</p>
              {item.serialNo && <p><span className="font-medium">ซีเรียล:</span> {item.serialNo}</p>}
              <p><span className="font-medium">สภาพ:</span> {item.condition}%</p>
              {item.accessories && <p><span className="font-medium">อุปกรณ์เสริม:</span> {item.accessories}</p>}
              {item.defects && <p><span className="font-medium">ตำหนิ:</span> {item.defects}</p>}
              {item.note && <p><span className="font-medium">หมายเหตุ:</span> {item.note}</p>}
            </div>
          </div>

          {/* Price Info */}
          {item.estimatedValue && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-center">
              <p className="text-sm text-green-600 mb-2">ราคาประเมิน</p>
              <p className="text-2xl font-bold text-green-700">
                ฿{item.estimatedValue.toLocaleString()}
              </p>
            </div>
          )}

          {/* Store Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ร้านจำนำ*
            </label>
            <select
              value={selectedStore}
              onChange={(e) => handleStoreSelect(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">เลือกร้านจำนำ</option>
              {stores.map(store => (
                <option key={store._id} value={store._id}>
                  {store.storeName}
                </option>
              ))}
            </select>
          </div>

          {/* Pawn Duration */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ระยะเวลาที่ต้องการจำนำ*
            </label>
            <select
              value={pawnDuration}
              onChange={(e) => setPawnDuration(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="7">7 วัน</option>
              <option value="14">14 วัน</option>
              <option value="30">30 วัน</option>
              <option value="60">60 วัน</option>
              <option value="90">90 วัน</option>
            </select>
          </div>

          {/* Interest Calculation */}
          {selectedStore && item.estimatedValue && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-blue-600">ราคาประเมิน:</span>
                <span className="font-semibold">฿{item.estimatedValue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-blue-600">ดอกเบี้ย ({calculateInterest() > 0 ? '10%' : '0%'}):</span>
                <span className="font-semibold">฿{calculateInterest().toLocaleString()}</span>
              </div>
              <hr className="my-2" />
              <div className="flex justify-between">
                <span className="text-sm font-semibold text-blue-700">รวม:</span>
                <span className="font-bold text-blue-700">
                  ฿{(item.estimatedValue + calculateInterest()).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Success/Error Messages */}
          {success && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg">
              {success}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* 1. ดำเนินการต่อ - disabled ถ้ายังไม่มี customer */}
            <button
              onClick={handleContinue}
              disabled={!selectedStore || !customer}
              className="w-full py-3 px-4 rounded-lg transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
            >
              ดำเนินการต่อ
            </button>

            {/* 2. ลงทะเบียน */}
            <button
              onClick={handleRegister}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors"
            >
              ลงทะเบียน
            </button>

            {/* 3. บันทึกชั่วคราว (สำหรับ temporary items) */}
            <button
              onClick={handleSaveTemporary}
              disabled={isSubmitting}
              className="w-full bg-orange-600 text-white py-3 px-4 rounded-lg hover:bg-orange-700 disabled:bg-orange-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกชั่วคราว'}
            </button>

            {/* 4. ประเมินสินค้าอื่นๆ */}
            <button
              onClick={() => window.location.href = '/estimate'}
              className="w-full bg-gray-600 text-white py-3 px-4 rounded-lg hover:bg-gray-700 transition-colors"
            >
              ประเมินสินค้าอื่นๆ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
