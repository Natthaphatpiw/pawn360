'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Noto_Sans_Thai } from 'next/font/google';
import ContractForm from '@/components/ContractForm';
import { useLiff } from '@/lib/liff/liff-provider';

const sarabun = Noto_Sans_Thai({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

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

export default function StoreContractPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = use(params);
  const { isLoading: liffLoading, error: liffError } = useLiff();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<'login' | 'contract'>('login');
  const [loading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Login data
  const [username, setUsername] = useState<string>('');
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

  const fetchItemData = async (storeId: string) => {
    try {
      const response = await axios.post(`/api/pawn-requests/${itemId}`, {
        action: 'claim-preview',
        storeId,
      }, {
        headers: { 'X-LIFF-Role': 'STORE' },
      });
      if (response.data.success) {
        setItem(response.data.item);
        setCustomer(response.data.customer);
        return true;
      } else {
        setError('ไม่พบข้อมูลรายการขอสินเชื่อ');
        return false;
      }
    } catch (err: any) {
      console.error('Error fetching item data:', err);
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
      return false;
    }
  };

  const handleLogin = async () => {
    if (!username || !password) {
      setError('กรุณากรอก Username และรหัสผ่าน');
      return;
    }

    setLoginLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/stores', {
        username,
        password,
      });

      if (response.data.success) {
        const claimed = await fetchItemData(response.data.store._id);
        if (!claimed) return;
        setSelectedStore(response.data.store);
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
    setError(null);
    void contractData;
    setSuccess('สร้างสัญญาสินเชื่อเรียบร้อยแล้ว');
    setContractSteps({ contractSigned: true, photoTaken: true });
    setShowContractModal(false);

    setTimeout(() => {
      router.push('/contracts');
    }, 2000);
  };

  if (loading || liffLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${sarabun.className}`} style={{ backgroundColor: '#FAFBFA' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (liffError) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${sarabun.className}`}>
        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
          ไม่สามารถยืนยันบัญชี LINE ของร้านค้าได้ กรุณาเปิดลิงก์ผ่าน LINE ใหม่
        </div>
      </div>
    );
  }

  if (error && currentStep === 'contract' && !item) {
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
                <p className="text-sm" style={{ color: '#6B7280' }}>กรุณากรอก Username และรหัสผ่าน</p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#FEE', border: '1px solid #FCC', color: '#C33' }}>
                  {error}
                </div>
              )}

              {/* Username Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" style={{ color: '#666666' }}>
                  Username ร้านค้า*
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 focus:outline-none"
                  style={{
                    border: '1px solid #E0E0E0',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '8px',
                    color: '#333333',
                    height: '44px'
                  }}
                  placeholder="กรอก Username ร้านค้า"
                  autoComplete="username"
                />
                <p className="text-xs mt-1" style={{ color: '#999999' }}>กรอก Username ที่ลงทะเบียนกับร้านค้า</p>
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

              {/* Login Button */}
              <button
                onClick={handleLogin}
                disabled={loginLoading || !username || !password}
                className="w-full py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-base"
                style={{
                  backgroundColor: loginLoading ? '#D1D5DB' : '#2D7A46',
                  color: loginLoading ? '#9CA3AF' : 'white'
                }}
              >
                {loginLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>

              {/* Item Preview */}
              {item && customer && (
                <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: '#F9F9F9', border: '1px solid #E0E0E0' }}>
                  <h3 className="font-semibold mb-2" style={{ color: '#1E293B' }}>ข้อมูลรายการขอสินเชื่อ</h3>
                  <p className="text-sm text-gray-600">สินค้า: {item.brand} {item.model}</p>
                  <p className="text-sm text-gray-600">ผู้ขอสินเชื่อ: {customer.fullName}</p>
                  <p className="text-sm text-gray-600">เบอร์โทร: {customer.phone}</p>
                </div>
              )}
            </div>
          )}

          {currentStep === 'contract' && item && customer && (
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold mb-2" style={{ color: '#1E293B' }}>สร้างสัญญาสินเชื่อ</h1>
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
                  <h4 className="font-semibold mb-2" style={{ color: '#1E293B' }}>ข้อมูลผู้ขอสินเชื่อ</h4>
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
                  {loading ? 'กำลังสร้างสัญญา...' : 'สร้างสัญญาสินเชื่อ'}
                </button>
              )}

              {/* Item ID */}
              <p className="text-xs text-center mt-4" style={{ color: '#9CA3AF' }}>
                Item ID: {itemId.substring(0, 8)}...
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
          storeId={selectedStore?._id || ''}
          onComplete={handleContractComplete}
          onClose={() => setShowContractModal(false)}
        />
      )}
    </div>
  );
}
