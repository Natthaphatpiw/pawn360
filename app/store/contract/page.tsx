'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Sarabun } from 'next/font/google';
import ContractForm from '@/components/ContractForm';

const sarabun = Sarabun({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

interface Store {
  _id: string;
  storeName: string;
}

interface Item {
  _id: string;
  brand: string;
  model: string;
  type: string;
  serialNo?: string;
  accessories?: string;
  condition: number;
  defects?: string;
  note?: string;
  images: string[];
  desiredAmount?: number;
  estimatedValue?: number;
  loanDays?: number;
  interestRate?: number;
}

interface Customer {
  lineId: string;
  title: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  idNumber: string;
  address: {
    houseNumber: string;
    street?: string;
    subDistrict: string;
    district: string;
    province: string;
    postcode: string;
  };
}

function StoreContractContent() {
  const [itemId, setItemId] = useState<string | null>(null);

  // Get itemId from URL on client side (try both search and hash)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let id = null;

      // Try search params first
      const urlParams = new URLSearchParams(window.location.search);
      id = urlParams.get('itemId');

      // If not found, try hash
      if (!id && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        id = hashParams.get('itemId');
      }

      console.log('Parsed itemId:', id, 'from URL');
      setItemId(id);
    }
  }, []);

  const [currentStep, setCurrentStep] = useState<'login' | 'contract'>('login');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Login data
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [selectedStore, setSelectedStore] = useState<any>(null);
  const [password, setPassword] = useState<string>('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Contract data
  const [item, setItem] = useState<Item | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showContractModal, setShowContractModal] = useState(false);
  const [contractSteps, setContractSteps] = useState({
    contractSigned: false,
    photoTaken: false
  });

  const findStoreByPhone = async (phone: string) => {
    try {
      const response = await axios.get('/api/stores');
      if (response.data.success) {
        // Normalize phone number: trim whitespace and remove special characters
        const normalizedInputPhone = phone.trim().replace(/[\s-()]/g, '');
        
        console.log('🔍 Searching for phone:', normalizedInputPhone);
        console.log('📋 Total stores:', response.data.stores.length);
        
        const store = response.data.stores.find((s: any) => {
          if (!s.phone) return false;
          const normalizedStorePhone = s.phone.trim().replace(/[\s-()]/g, '');
          console.log(`  Comparing: "${normalizedInputPhone}" vs "${normalizedStorePhone}" (${s.storeName})`);
          return normalizedStorePhone === normalizedInputPhone;
        });
        
        if (store) {
          console.log('✅ Store found:', store.storeName);
        } else {
          console.log('❌ No store found for phone:', normalizedInputPhone);
        }
        
        return store || null;
      }
      return null;
    } catch (err) {
      console.error('Error fetching stores:', err);
      return null;
    }
  };

  const fetchItemData = async (id: string) => {
    try {
      console.log('Fetching data for item:', id);
      setLoading(true);
      setError(null);
      const response = await axios.get(`/api/pawn-requests/${id}`);
      console.log('API Response:', response.data);
      if (response.data.success) {
        setItem(response.data.item);
        setCustomer(response.data.customer);
        console.log('Data loaded successfully');
      } else {
        setError('ไม่พบข้อมูลรายการจำนำ');
      }
    } catch (err: any) {
      console.error('Error fetching item data:', err);
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // Removed: Load stores on mount (now using phone number)

  // Load item and customer data when itemId changes
  useEffect(() => {
    if (itemId) {
      console.log('Loading data for itemId:', itemId);
      fetchItemData(itemId);
    } else {
      console.log('No itemId found, stopping loading');
      setLoading(false);
    }
  }, [itemId]);

  const handleLogin = async () => {
    if (!phoneNumber) {
      setError('กรุณากรอกเบอร์โทรศัพท์ร้านค้า');
      return;
    }

    if (!password) {
      setError('กรุณาใส่รหัสผ่าน');
      return;
    }

    setLoginLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // ค้นหาร้านค้าจากเบอร์โทร
      const store = await findStoreByPhone(phoneNumber);
      
      if (!store) {
        setError('ไม่พบร้านค้าที่ใช้เบอร์โทรนี้');
        setLoginLoading(false);
        return;
      }

      // ตรวจสอบรหัสผ่าน
      const response = await axios.post('/api/stores', {
        storeId: store._id,
        password: password
      });

      if (response.data.success) {
        setSelectedStore(store);
        setCurrentStep('contract');
        setError(null);
      } else {
        setError('รหัสผ่านไม่ถูกต้อง');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    } finally {
      setLoginLoading(false);
    }
  };


  const handleCreateContract = () => {
    if (!item || !customer) {
      setError('ข้อมูลไม่ครบถ้วน ไม่สามารถสร้างสัญญาได้');
      return;
    }

    setShowContractModal(true);
  };

  const handleContractComplete = async (contractData: any) => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/contracts/create', {
        itemId: itemId,
        storeId: selectedStore?._id,
        contractData: contractData
      });

      if (response.data.success) {
        setSuccess('สร้างสัญญาจำนำเรียบร้อยแล้ว');
        setContractSteps({ contractSigned: true, photoTaken: true });
        setShowContractModal(false);
      }
    } catch (err: any) {
      console.error('Error creating contract:', err);
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการสร้างสัญญา');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${sarabun.className}`} style={{ backgroundColor: '#FAFBFA' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error && !item) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${sarabun.className}`} style={{ backgroundColor: '#FAFBFA' }}>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold text-lg mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${sarabun.className}`} style={{ backgroundColor: '#FAFBFA' }}>
      <div className="max-w-md mx-auto py-8 px-4">
        <div className="rounded-xl shadow-sm p-6" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E6E7E8' }}>

          {currentStep === 'login' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold mb-2" style={{ color: '#1E293B' }}>เข้าสู่ระบบร้านค้า</h1>
                <p className="text-sm" style={{ color: '#6B7280' }}>กรุณาเลือกชื่อร้านค้าและใส่รหัสผ่าน</p>
              </div>

              {/* Success Message */}
              {success && (
                <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#D4EDDA', border: '1px solid #C3E6CB', color: '#155724' }}>
                  {success}
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#FEE', border: '1px solid #FCC', color: '#C33' }}>
                  {error}
                </div>
              )}

              {/* Phone Number Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" style={{ color: '#666666' }}>
                  เบอร์โทรศัพท์ร้านค้า*
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full px-3 py-2 focus:outline-none"
                  style={{
                    border: '1px solid #E0E0E0',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '8px',
                    color: '#333333',
                    height: '44px'
                  }}
                  placeholder="กรอกเบอร์โทรศัพท์ร้านค้า"
                />
                <p className="text-xs mt-1" style={{ color: '#999999' }}>กรอกเบอร์โทรศัพท์ที่ลงทะเบียนกับร้านค้า</p>
              </div>

              {/* Password Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2" style={{ color: '#666666' }}>
                  รหัสผ่าน*
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 focus:outline-none"
                  style={{
                    border: '1px solid #E0E0E0',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '8px',
                    color: '#333333',
                    height: '44px'
                  }}
                  placeholder="ใส่รหัสผ่านร้านค้า"
                />
              </div>


              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleLogin}
                  disabled={loginLoading || !phoneNumber || !password}
                  className="w-full py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-base"
                  style={{
                    backgroundColor: loginLoading ? '#D1D5DB' : '#2D7A46',
                    color: loginLoading ? '#9CA3AF' : 'white'
                  }}
                >
                  {loginLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
                </button>
              </div>

              {/* Item Preview */}
              {item && customer && (
                <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: '#F9F9F9', border: '1px solid #E0E0E0' }}>
                  <h3 className="font-semibold mb-2" style={{ color: '#1E293B' }}>ข้อมูลรายการจำนำ</h3>
                  <p className="text-sm text-gray-600">สินค้า: {item.brand} {item.model}</p>
                  <p className="text-sm text-gray-600">ผู้จำนำ: {customer.fullName}</p>
                  <p className="text-sm text-gray-600">เบอร์โทร: {customer.phone}</p>
                </div>
              )}
            </div>
          )}

          {currentStep === 'contract' && item && customer && (
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold mb-2" style={{ color: '#1E293B' }}>สร้างสัญญาจำนำ</h1>
                <p className="text-sm" style={{ color: '#6B7280' }}>ตรวจสอบข้อมูลและสร้างสัญญา</p>
              </div>

              {/* Success Message */}
              {success && (
                <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#EFE', border: '1px solid #CFC', color: '#363' }}>
                  {success}
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#FEE', border: '1px solid #FCC', color: '#C33' }}>
                  {error}
                </div>
              )}

              {/* Item and Customer Info */}
              <div className="space-y-4">
                <div className="rounded-lg p-3" style={{ backgroundColor: '#EEECEB' }}>
                  <h4 className="font-semibold mb-2" style={{ color: '#1E293B' }}>ข้อมูลสินค้า</h4>
                  <p className="text-sm text-gray-600">{item.brand} {item.model}</p>
                  <p className="text-sm text-gray-600">ประเภท: {item.type}</p>
                  <p className="text-sm text-gray-600">ซีเรียล: {item.serialNo || 'ไม่ระบุ'}</p>
                  <p className="text-sm text-gray-600">สภาพ: {item.condition}/100</p>
                </div>

                <div className="rounded-lg p-3" style={{ backgroundColor: '#EEECEB' }}>
                  <h4 className="font-semibold mb-2" style={{ color: '#1E293B' }}>ข้อมูลผู้จำนำ</h4>
                  <p className="text-sm text-gray-600">{customer.fullName}</p>
                  <p className="text-sm text-gray-600">เบอร์โทร: {customer.phone}</p>
                  <p className="text-sm text-gray-600">เลขบัตร: {customer.idNumber}</p>
                  <p className="text-sm text-gray-600">ที่อยู่: {customer.address.houseNumber} {customer.address.subDistrict} {customer.address.district} {customer.address.province}</p>
                </div>
              </div>

              {/* Contract Steps Status */}
              {(contractSteps.contractSigned || contractSteps.photoTaken) && (
                <div className="p-4 rounded-lg" style={{ backgroundColor: '#F0F9F0', border: '1px solid #C6F6D5' }}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: '#2F855A' }}>ขั้นตอนการสร้างสัญญา</h3>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <div className={`w-5 h-5 rounded-full mr-3 flex items-center justify-center ${contractSteps.contractSigned ? 'bg-green-600' : 'bg-gray-300'}`}>
                        {contractSteps.contractSigned && <span className="text-white text-xs">✓</span>}
                      </div>
                      <span className={`text-sm ${contractSteps.contractSigned ? 'text-green-700' : 'text-gray-600'}`}>
                        เซ็นสัญญาแล้ว
                      </span>
                    </div>
                    <div className="flex items-center">
                      <div className={`w-5 h-5 rounded-full mr-3 flex items-center justify-center ${contractSteps.photoTaken ? 'bg-green-600' : 'bg-gray-300'}`}>
                        {contractSteps.photoTaken && <span className="text-white text-xs">✓</span>}
                      </div>
                      <span className={`text-sm ${contractSteps.photoTaken ? 'text-green-700' : 'text-gray-600'}`}>
                        ถ่ายรูปยืนยันตัวตนแล้ว
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Create Contract Button */}
              {!contractSteps.contractSigned && (
                <button
                  onClick={handleCreateContract}
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-base"
                  style={{
                    backgroundColor: loading ? '#D1D5DB' : '#2D7A46',
                    color: loading ? '#9CA3AF' : 'white'
                  }}
                >
                  {loading ? 'กำลังสร้างสัญญา...' : 'สร้างสัญญาจำนำ'}
                </button>
              )}

              {/* Item ID */}
              <p className="text-xs text-center mt-4" style={{ color: '#9CA3AF' }}>
                Item ID: {itemId?.substring(0, 8)}...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Contract Modal */}
      {showContractModal && item && customer && (
        <ContractForm
          item={item}
          customer={customer}
          onComplete={handleContractComplete}
          onClose={() => setShowContractModal(false)}
        />
      )}
    </div>
  );
}

export default function StoreContractPage() {
  return <StoreContractContent />;
}
