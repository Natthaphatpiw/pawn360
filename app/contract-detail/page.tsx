'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { Sarabun } from 'next/font/google';
import { QRCodeCanvas } from 'qrcode.react';

const sarabun = Sarabun({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

interface Contract {
  _id: string;
  contractNumber: string;
  lineId: string;
  itemId: string;
  storeId: string;
  createdAt: string;
  status: string;
}

interface Item {
  _id: string;
  brand: string;
  model: string;
  type: string;
  serialNo?: string;
  desiredAmount?: number;
  estimatedValue?: number;
  interestRate?: number;
  loanDays?: number;
  accessories?: string;
  defects?: string;
  note?: string;
}

interface Customer {
  fullName: string;
  phone: string;
  idNumber: string;
}

interface Store {
  storeName: string;
  phone: string;
  address: {
    houseNumber: string;
    street?: string;
    subDistrict: string;
    district: string;
    province: string;
    postcode: string;
  };
}

function ContractDetailContent() {
  const searchParams = useSearchParams();
  const contractId = searchParams.get('contractId');

  const [contract, setContract] = useState<Contract | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContractDetails = async () => {
      if (!contractId) {
        setError('ไม่พบรหัสสัญญา');
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get(`/api/contracts/detail/${contractId}`);
        const data = response.data;

        setContract(data.contract);
        setItem(data.item);
        setCustomer(data.customer);
        setStore(data.store);
        setLoading(false);
      } catch (err: any) {
        console.error('Error fetching contract details:', err);
        setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
        setLoading(false);
      }
    };

    fetchContractDetails();
  }, [contractId]);

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${sarabun.className}`} style={{ backgroundColor: '#F0EFEF' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error || !contract || !item) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${sarabun.className}`} style={{ backgroundColor: '#F0EFEF' }}>
        <div className="text-center p-6">
          <p className="text-red-600 text-lg">{error || 'ไม่พบข้อมูลสัญญา'}</p>
        </div>
      </div>
    );
  }

  // Calculate dates and remaining days
  const startDate = new Date(contract.createdAt);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + (item.loanDays || 30));
  const today = new Date();
  const remainingDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const calculateInterest = () => {
    const pawnedPrice = item.desiredAmount || item.estimatedValue || 0;
    const interestRate = item.interestRate || 10;
    const periodDays = item.loanDays || 30;
    const dailyRate = interestRate / 100 / 30;
    return Math.round(pawnedPrice * dailyRate * periodDays);
  };

  const totalAmount = (item.desiredAmount || item.estimatedValue || 0) + calculateInterest();

  return (
    <div className={`min-h-screen py-6 px-4 ${sarabun.className}`} style={{ backgroundColor: '#F0EFEF' }}>
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold" style={{ color: '#0A4215' }}>รายละเอียดสัญญา</h1>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Contract Info */}
          <div className="p-4 space-y-3">
            {/* Contract Number */}
            <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
              <span className="text-sm font-semibold" style={{ color: '#333333' }}>เลขที่สัญญา:</span>
              <span className="text-sm font-bold text-right" style={{ color: '#0A4215' }}>{contract.contractNumber}</span>
            </div>

            {/* Store Name */}
            {store && (
              <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
                <span className="text-sm font-semibold" style={{ color: '#333333' }}>ร้านค้า:</span>
                <span className="text-sm text-right" style={{ color: '#666666' }}>{store.storeName}</span>
              </div>
            )}

            {/* Status */}
            <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
              <span className="text-sm font-semibold" style={{ color: '#333333' }}>สถานะ:</span>
              <span className="text-sm font-bold" style={{ color: remainingDays > 0 ? '#0A4215' : '#D32F2F' }}>
                {remainingDays > 0 ? 'ดำเนินการ' : 'ครบกำหนด'}
              </span>
            </div>

            {/* Item Type */}
            <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
              <span className="text-sm font-semibold" style={{ color: '#333333' }}>ประเภททรัพย์:</span>
              <span className="text-sm text-right" style={{ color: '#666666' }}>{item.type}</span>
            </div>

            {/* Item Name */}
            <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
              <span className="text-sm font-semibold" style={{ color: '#333333' }}>ชื่อสินค้า:</span>
              <span className="text-sm text-right" style={{ color: '#666666' }}>{item.brand} {item.model}</span>
            </div>

            {/* Serial No */}
            {item.serialNo && (
              <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
                <span className="text-sm font-semibold" style={{ color: '#333333' }}>Serial No.:</span>
                <span className="text-sm text-right" style={{ color: '#666666' }}>{item.serialNo}</span>
              </div>
            )}

            {/* Price */}
            <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
              <span className="text-sm font-semibold" style={{ color: '#333333' }}>จำนวนเงิน:</span>
              <span className="text-sm font-bold" style={{ color: '#0A4215' }}>
                {(item.desiredAmount || item.estimatedValue || 0).toLocaleString()} บาท
              </span>
            </div>

            {/* Interest */}
            <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
              <span className="text-sm font-semibold" style={{ color: '#333333' }}>ดอกเบี้ย:</span>
              <span className="text-sm" style={{ color: '#666666' }}>
                {calculateInterest().toLocaleString()} บาท ({item.interestRate || 10}%)
              </span>
            </div>

            {/* Total Amount */}
            <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
              <span className="text-sm font-semibold" style={{ color: '#333333' }}>ยอดชำระทั้งหมด:</span>
              <span className="text-sm font-bold" style={{ color: '#D32F2F' }}>
                {totalAmount.toLocaleString()} บาท
              </span>
            </div>

            {/* Loan Period */}
            <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
              <span className="text-sm font-semibold" style={{ color: '#333333' }}>ระยะเวลา:</span>
              <span className="text-sm" style={{ color: '#666666' }}>{item.loanDays || 30} วัน</span>
            </div>

            {/* Start Date */}
            <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
              <span className="text-sm font-semibold" style={{ color: '#333333' }}>วันที่เริ่ม:</span>
              <span className="text-sm" style={{ color: '#666666' }}>{formatDate(startDate)}</span>
            </div>

            {/* End Date */}
            <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
              <span className="text-sm font-semibold" style={{ color: '#333333' }}>วันที่สิ้นสุด:</span>
              <span className="text-sm font-bold" style={{ color: '#D32F2F' }}>{formatDate(endDate)}</span>
            </div>

            {/* Accessories */}
            {item.accessories && (
              <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
                <span className="text-sm font-semibold" style={{ color: '#333333' }}>อุปกรณ์เสริม:</span>
                <span className="text-sm text-right" style={{ color: '#666666' }}>{item.accessories}</span>
              </div>
            )}

            {/* Defects */}
            {item.defects && (
              <div className="flex justify-between items-start py-2 border-b" style={{ borderColor: '#E0E0E0' }}>
                <span className="text-sm font-semibold" style={{ color: '#333333' }}>ข้อบกพร่อง:</span>
                <span className="text-sm text-right" style={{ color: '#666666' }}>{item.defects}</span>
              </div>
            )}

            {/* Note */}
            {item.note && (
              <div className="flex justify-between items-start py-2" style={{ borderColor: '#E0E0E0' }}>
                <span className="text-sm font-semibold" style={{ color: '#333333' }}>หมายเหตุ:</span>
                <span className="text-sm text-right" style={{ color: '#666666' }}>{item.note}</span>
              </div>
            )}
          </div>

          {/* Remaining Days Badge */}
          <div className="mx-4 mb-4 p-3 rounded-full flex justify-between items-center" style={{ backgroundColor: '#E7EFE9' }}>
            <span className="text-sm font-semibold" style={{ color: '#0A4215' }}>อายุสัญญาคงเหลือ (Remaining days)</span>
            <span className="text-2xl font-bold" style={{ color: '#0A4215' }}>{remainingDays > 0 ? remainingDays : 0}</span>
          </div>

          {/* QR Code Section */}
          <div className="p-4" style={{ backgroundColor: '#F0EFEF' }}>
            <p className="text-sm font-semibold text-center mb-3" style={{ color: '#333333' }}>QR Code สัญญา</p>
            <div className="flex justify-center">
              <div className="bg-white p-4 rounded-lg">
                <QRCodeCanvas 
                  value={`https://pawn360.vercel.app/contract-detail?contractId=${contractId}`}
                  size={200}
                  level="H"
                />
              </div>
            </div>
            <p className="text-xs text-center mt-2" style={{ color: '#666666' }}>แสดง QR Code นี้เมื่อไถ่คืนสินค้า</p>
          </div>
        </div>

        {/* Customer Info Card */}
        {customer && (
          <div className="mt-4 bg-white rounded-lg shadow-md p-4">
            <h3 className="text-md font-bold mb-3" style={{ color: '#0A4215' }}>ข้อมูลลูกค้า</h3>
            <div className="space-y-2">
              <div className="flex justify-between py-1">
                <span className="text-sm" style={{ color: '#333333' }}>ชื่อ-นามสกุล:</span>
                <span className="text-sm" style={{ color: '#666666' }}>{customer.fullName}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-sm" style={{ color: '#333333' }}>เบอร์โทร:</span>
                <span className="text-sm" style={{ color: '#666666' }}>{customer.phone}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-sm" style={{ color: '#333333' }}>เลขบัตรประชาชน:</span>
                <span className="text-sm" style={{ color: '#666666' }}>{customer.idNumber}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContractDetailPage() {
  return (
    <Suspense fallback={
      <div className={`min-h-screen flex items-center justify-center ${sarabun.className}`} style={{ backgroundColor: '#F0EFEF' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <ContractDetailContent />
    </Suspense>
  );
}

