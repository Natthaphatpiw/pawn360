'use client';

import { useState, useEffect, Suspense } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { useSearchParams } from 'next/navigation';

interface Store {
  _id: string;
  storeName: string;
}

interface PawnRequest {
  _id: string;
  lineId: string;
  brand: string;
  model: string;
  type: string;
  serialNo: string;
  condition: number;
  defects: string;
  note: string;
  accessories: string;
  images: string[];
  desiredAmount?: number;
  estimatedValue?: number;
  loanDays?: number;
  interestRate?: number;
  negotiatedAmount?: number;
  negotiatedDays?: number;
  negotiatedInterestRate?: number;
  negotiationStatus?: string;
  customer: {
    title: string;
    firstName: string;
    lastName: string;
    phone: string;
    idNumber: string;
  };
}

function StoreVerifyPawnContent() {
  const { isLoading: liffLoading, error: liffError } = useLiff();
  const searchParams = useSearchParams();
  const itemId = searchParams.get('itemId');

  const [pawnRequest, setPawnRequest] = useState<PawnRequest | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ข้อมูลการต่อรอง
  const [isEditingTerms, setIsEditingTerms] = useState(false);
  const [editedAmount, setEditedAmount] = useState<number>(0);
  const [editedDays, setEditedDays] = useState<number>(0);
  const [editedInterestRate, setEditedInterestRate] = useState<number>(0);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ดึงข้อมูลรายการจำนำ
  useEffect(() => {
    if (itemId) {
      fetchPawnRequest();
    }
  }, [itemId]);

  const fetchPawnRequest = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`/api/pawn-requests/${itemId}`);
      if (response.data.success && response.data.item && response.data.customer) {
        // รวม item และ customer เป็น pawnRequest object
        const item = response.data.item;
        setPawnRequest({
          _id: item._id,
          lineId: response.data.customer.lineId || '',
          brand: item.brand,
          model: item.model,
          type: item.type,
          serialNo: item.serialNo,
          condition: item.condition,
          defects: item.defects,
          note: item.note,
          accessories: item.accessories,
          images: item.images,
          desiredAmount: item.desiredAmount,
          estimatedValue: item.estimatedValue,
          loanDays: item.loanDays,
          interestRate: item.interestRate,
          negotiatedAmount: item.negotiatedAmount,
          negotiatedDays: item.negotiatedDays,
          negotiatedInterestRate: item.negotiatedInterestRate,
          negotiationStatus: item.negotiationStatus,
          customer: {
            title: response.data.customer.title,
            firstName: response.data.customer.firstName,
            lastName: response.data.customer.lastName,
            phone: response.data.customer.phone,
            idNumber: response.data.customer.idNumber,
          },
        });

        // ตั้งค่าเริ่มต้นสำหรับการแก้ไข (ใช้ค่าที่ต่อรองแล้วถ้ามี ไม่งั้นใช้ค่าเดิม)
        setEditedAmount(item.negotiatedAmount || item.desiredAmount || 0);
        setEditedDays(item.negotiatedDays || item.loanDays || 30);
        setEditedInterestRate(item.negotiatedInterestRate || item.interestRate || 3);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'ไม่พบรายการจำนำ');
    } finally {
      setIsLoading(false);
    }
  };

  const findStoreByPhone = async (phone: string): Promise<Store | null> => {
    try {
      const response = await axios.get('/api/stores');
      if (response.data.success) {
        const store = response.data.stores.find((s: any) => s.phone === phone);
        return store || null;
      }
      return null;
    } catch (err) {
      console.error('Error fetching stores:', err);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phoneNumber) {
      setError('กรุณากรอกเบอร์โทรศัพท์ร้านค้า');
      return;
    }

    if (!password) {
      setError('กรุณากรอกรหัสผ่าน');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // ค้นหาร้านค้าจากเบอร์โทร
      const store = await findStoreByPhone(phoneNumber);
      
      if (!store) {
        setError('ไม่พบร้านค้าที่ใช้เบอร์โทรนี้');
        setIsSubmitting(false);
        return;
      }

      // ตรวจสอบรหัสผ่าน
      const verifyResponse = await axios.post('/api/stores', {
        storeId: store._id,
        password: password
      });

      if (!verifyResponse.data.success) {
        setError('รหัสผ่านไม่ถูกต้อง');
        setIsSubmitting(false);
        return;
      }

      setSelectedStore(store);
      // กำหนดค่าที่จะใช้ในการสร้างสัญญา (ใช้ค่าที่แก้ไขแล้ว)
      const finalAmount = editedAmount;
      const finalDays = editedDays;
      const finalRate = editedInterestRate;

      // กำหนดค่าดั้งเดิมสำหรับแสดงการเปลี่ยนแปลง
      const originalAmount = pawnRequest?.negotiatedAmount || pawnRequest?.desiredAmount || 0;
      const originalDays = pawnRequest?.negotiatedDays || pawnRequest?.loanDays || 30;
      const originalRate = pawnRequest?.negotiatedInterestRate || pawnRequest?.interestRate || 3;

      // ตรวจสอบว่ามีการแก้ไขหรือไม่
      const hasChanges =
        finalAmount !== originalAmount ||
        finalDays !== originalDays ||
        finalRate !== originalRate;

      // ส่งคำขอยืนยันให้ลูกค้าเสมอ
      if (!pawnRequest) {
        setError('ไม่พบข้อมูลรายการจำนำ');
        return;
      }

      const confirmResponse = await axios.post('/api/contracts/send-confirmation', {
        lineId: pawnRequest.lineId,
        itemId,
        modifications: {
          original: {
            amount: originalAmount,
            days: originalDays,
            rate: originalRate
          },
          new: {
            amount: finalAmount,
            days: finalDays,
            rate: finalRate
          },
          hasChanges: hasChanges
        },
        newContract: {
          pawnPrice: finalAmount,
          interestRate: finalRate,
          loanDays: finalDays,
          item: `${pawnRequest.brand} ${pawnRequest.model}`,
          storeId: store._id,
          storeName: store.storeName
        }
      });

      if (confirmResponse.data.success) {
        setSuccess(true);
        setTimeout(() => {
          if (window.liff && window.liff.isInClient()) {
            window.liff.closeWindow();
          } else {
            // ถ้าไม่ใช่ LIFF ให้ redirect กลับไปหน้าแรก
            window.location.href = '/';
          }
        }, 3000);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาด');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (liffLoading || isLoading) {
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold text-lg mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-red-600">{liffError || error}</p>
        </div>
      </div>
    );
  }

  if (!pawnRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-md">
          <h2 className="text-yellow-800 font-semibold text-lg mb-2">ไม่พบข้อมูล</h2>
          <p className="text-yellow-600">ไม่พบรายการจำนำที่ต้องการ</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 max-w-md text-center">
          <div className="text-green-600 text-5xl mb-4">✓</div>
          <h2 className="text-green-800 font-semibold text-lg mb-2">สร้างสัญญาสำเร็จ!</h2>
          <p className="text-green-600">กำลังปิดหน้าต่าง...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">ตรวจสอบรายการจำนำ</h1>

        {/* Customer Info */}
        <div className="mb-6 bg-blue-50 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">ข้อมูลลูกค้า</h2>
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">ชื่อ:</span> {pawnRequest.customer.title}{pawnRequest.customer.firstName} {pawnRequest.customer.lastName}</p>
            <p><span className="font-medium">เบอร์โทร:</span> {pawnRequest.customer.phone}</p>
            <p><span className="font-medium">บัตรประชาชน:</span> {pawnRequest.customer.idNumber}</p>
          </div>
        </div>

        {/* Item Info */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">ข้อมูลสินค้า</h2>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">ยี่ห้อ</p>
                <p className="font-medium">{pawnRequest.brand}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">รุ่น</p>
                <p className="font-medium">{pawnRequest.model}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">ประเภท</p>
                <p className="font-medium">{pawnRequest.type}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">สภาพ</p>
                <p className="font-medium">{pawnRequest.condition}%</p>
              </div>
            </div>
            {pawnRequest.serialNo && (
              <div>
                <p className="text-sm text-gray-600">Serial No.</p>
                <p className="font-medium">{pawnRequest.serialNo}</p>
              </div>
            )}
            {pawnRequest.defects && (
              <div>
                <p className="text-sm text-gray-600">ตำหนิ</p>
                <p className="font-medium">{pawnRequest.defects}</p>
              </div>
            )}
            {pawnRequest.accessories && (
              <div>
                <p className="text-sm text-gray-600">อุปกรณ์เสริม</p>
                <p className="font-medium">{pawnRequest.accessories}</p>
              </div>
            )}
            {pawnRequest.note && (
              <div>
                <p className="text-sm text-gray-600">หมายเหตุ</p>
                <p className="font-medium">{pawnRequest.note}</p>
              </div>
            )}
          </div>

          {/* Images */}
          {pawnRequest.images.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">รูปภาพสินค้า</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {pawnRequest.images.map((img, index) => (
                  <img
                    key={index}
                    src={img}
                    alt={`Item ${index + 1}`}
                    className="w-full h-32 object-cover rounded-md"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ข้อมูลการจำนำ */}
        <div className="mb-6 border-t pt-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-700">ข้อมูลการจำนำ</h2>
            {!isEditingTerms && (
              <button
                type="button"
                onClick={() => setIsEditingTerms(true)}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                แก้ไข
              </button>
            )}
          </div>

          {!isEditingTerms ? (
            <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">ราคาประเมิน AI</p>
                  <p className="font-medium text-gray-900">
                    {pawnRequest.estimatedValue?.toLocaleString() || '-'} บาท
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">ราคาที่ลูกค้าต้องการจำนำ</p>
                  <p className="font-medium text-green-600">
                    {(pawnRequest.negotiatedAmount || pawnRequest.desiredAmount)?.toLocaleString() || '-'} บาท
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">จำนวนวัน</p>
                  <p className="font-medium">
                    {pawnRequest.negotiatedDays || pawnRequest.loanDays || '-'} วัน
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">อัตราดอกเบี้ย</p>
                  <p className="font-medium">
                    {pawnRequest.negotiatedInterestRate || pawnRequest.interestRate || '-'}% ต่อเดือน
                  </p>
                </div>
              </div>
              <div className="border-t pt-3 mt-2">
                <p className="text-sm text-gray-600">ยอดไถ่ถอนโดยประมาณ</p>
                <p className="text-xl font-bold text-blue-600">
                  {(() => {
                    const amount = pawnRequest.negotiatedAmount || pawnRequest.desiredAmount || 0;
                    const days = pawnRequest.negotiatedDays || pawnRequest.loanDays || 30;
                    const rate = pawnRequest.negotiatedInterestRate || pawnRequest.interestRate || 3;
                    const interest = (amount * rate * (days / 30)) / 100;
                    return (amount + interest).toLocaleString();
                  })()} บาท
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  (รวมต้นเงิน + ดอกเบี้ย)
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ราคาประเมิน (อ่านอย่างเดียว)
                </label>
                <input
                  type="number"
                  value={pawnRequest.estimatedValue || 0}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ราคาที่จำนำ (บาท) *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editedAmount}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d]/g, '');
                    setEditedAmount(value === '' ? 0 : parseInt(value));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    จำนวนวัน *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editedDays}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^\d]/g, '');
                      setEditedDays(value === '' ? 0 : parseInt(value));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    อัตราดอกเบี้ย (%) *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedInterestRate}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^\d.]/g, '');
                      setEditedInterestRate(value === '' ? 0 : parseFloat(value));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingTerms(false);
                    // Reset to original values
                    setEditedAmount(pawnRequest.negotiatedAmount || pawnRequest.desiredAmount || 0);
                    setEditedDays(pawnRequest.negotiatedDays || pawnRequest.loanDays || 30);
                    setEditedInterestRate(pawnRequest.negotiatedInterestRate || pawnRequest.interestRate || 3);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTerms(false)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  บันทึก
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Store Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">เบอร์โทรศัพท์ร้านค้า</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="กรอกเบอร์โทรศัพท์ร้านค้า (เช่น 0812345678)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">กรอกเบอร์โทรศัพท์ที่ลงทะเบียนกับร้านค้า</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">รหัสผ่าน</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านร้านค้า"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white py-3 rounded-md font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'กำลังดำเนินการ...' : 'ส่งคำขอยืนยันไปยังลูกค้า'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function StoreVerifyPawnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <StoreVerifyPawnContent />
    </Suspense>
  );
}
