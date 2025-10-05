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
  const [stores, setStores] = useState<Store[]>([]);
  const [filteredStores, setFilteredStores] = useState<Store[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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

  // ดึงรายชื่อร้านค้า
  useEffect(() => {
    fetchStores();
  }, []);

  // Filter stores based on search
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredStores(stores);
    } else {
      const filtered = stores.filter(store =>
        store.storeName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredStores(filtered);
    }
  }, [searchTerm, stores]);

  const fetchPawnRequest = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`/api/pawn-requests/${itemId}`);
      if (response.data.success && response.data.item && response.data.customer) {
        // รวม item และ customer เป็น pawnRequest object
        setPawnRequest({
          _id: response.data.item._id,
          lineId: response.data.customer.lineId || '',
          brand: response.data.item.brand,
          model: response.data.item.model,
          type: response.data.item.type,
          serialNo: response.data.item.serialNo,
          condition: response.data.item.condition,
          defects: response.data.item.defects,
          note: response.data.item.note,
          accessories: response.data.item.accessories,
          images: response.data.item.images,
          customer: {
            title: response.data.customer.title,
            firstName: response.data.customer.firstName,
            lastName: response.data.customer.lastName,
            phone: response.data.customer.phone,
            idNumber: response.data.customer.idNumber,
          },
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'ไม่พบรายการจำนำ');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      const response = await axios.get('/api/stores');
      if (response.data.success) {
        setStores(response.data.stores);
        setFilteredStores(response.data.stores);
      }
    } catch (err) {
      console.error('Error fetching stores:', err);
    }
  };

  const handleStoreSelect = (store: Store) => {
    setSelectedStore(store);
    setSearchTerm(store.storeName);
    setFilteredStores([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedStore) {
      setError('กรุณาเลือกร้านค้า');
      return;
    }

    if (!password) {
      setError('กรุณากรอกรหัสผ่าน');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await axios.post('/api/stores/verify-and-create-contract', {
        itemId,
        storeId: selectedStore._id,
        password,
      });

      if (response.data.success) {
        setSuccess(true);
        setTimeout(() => {
          if (window.liff) {
            window.liff.closeWindow();
          }
        }, 2000);
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

        {/* Store Selection Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">เลือกร้านค้า</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedStore(null);
                }}
                placeholder="ค้นหาร้านค้า..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              {filteredStores.length > 0 && searchTerm && !selectedStore && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredStores.map((store) => (
                    <div
                      key={store._id}
                      onClick={() => handleStoreSelect(store)}
                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer"
                    >
                      {store.storeName}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
            disabled={isSubmitting || !selectedStore}
            className="w-full bg-blue-600 text-white py-3 rounded-md font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'กำลังสร้างสัญญา...' : 'ยืนยันและสร้างสัญญา'}
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
