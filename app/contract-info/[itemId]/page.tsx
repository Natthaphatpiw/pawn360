'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Sarabun } from 'next/font/google';

const sarabun = Sarabun({
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

interface ContractData {
  contractDate: string;
  sellerName: string;
  sellerId: string;
  sellerAddress: string;
  buyerAddress: string;
  itemType: string;
  itemDetails: string;
  price: number;
  periodDays: number;
  principal: number;
  interest: number;
  interestRate: number;
  serviceFee: number;
  total: number;
}

export default function ContractInfoPage({ params }: { params: { itemId: string } }) {
  const { itemId } = params;
  const router = useRouter();

  const [item, setItem] = useState<Item | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contractData, setContractData] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remainingDays, setRemainingDays] = useState<number>(0);

  useEffect(() => {
    const fetchContractData = async () => {
      try {
        setLoading(true);

        // Fetch item and customer data
        const response = await axios.get(`/api/pawn-requests/${itemId}`);
        setItem(response.data.item);
        setCustomer(response.data.customer);

        // Calculate contract data
        const itemData = response.data.item;
        const customerData = response.data.customer;

        // ใช้ข้อมูลจาก confirmationNewContract ถ้ามี (เป็นข้อมูลที่ถูกแก้ไขแล้ว)
        const price = itemData.confirmationNewContract?.pawnPrice || itemData.desiredAmount || itemData.estimatedValue || 0;
        const interestRate = itemData.confirmationNewContract?.interestRate || itemData.interestRate || 10;
        const periodDays = itemData.confirmationNewContract?.loanDays || itemData.loanDays || 30;
        const dailyRate = interestRate / 100 / 30;
        const interest = Math.round(price * dailyRate * periodDays);

        const contract: ContractData = {
          contractDate: new Date().toLocaleDateString('th-TH'),
          sellerName: customerData.fullName,
          sellerId: customerData.idNumber,
          sellerAddress: `${customerData.address.houseNumber} ${customerData.address.street || ''} ${customerData.address.subDistrict} ${customerData.address.district} ${customerData.address.province} ${customerData.address.postcode}`,
          buyerAddress: '1400/84 เขตสวนหลวง แขวงสวนหลวง กทม 10250',
          itemType: itemData.type,
          itemDetails: `${itemData.brand} ${itemData.model}${itemData.serialNo ? ` (S/N: ${itemData.serialNo})` : ''}${itemData.accessories ? ` ${itemData.accessories}` : ''}${itemData.defects ? ` ${itemData.defects}` : ''}${itemData.note ? ` ${itemData.note}` : ''}`,
          price: price,
          periodDays: periodDays,
          principal: price,
          interest: interest,
          interestRate: interestRate,
          serviceFee: 0,
          total: price + interest
        };

        setContractData(contract);

        // Calculate remaining days
        const startDate = new Date();
        const dueDate = new Date(startDate);
        dueDate.setDate(dueDate.getDate() + periodDays);
        const remaining = Math.ceil((dueDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        setRemainingDays(remaining);

      } catch (err: any) {
        console.error('Error fetching contract data:', err);
        setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูลสัญญา');
      } finally {
        setLoading(false);
      }
    };

    if (itemId) {
      fetchContractData();
    }
  }, [itemId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error || !contractData || !item || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-6">
          <div className="text-red-500 text-xl mb-4">❌</div>
          <p className="text-gray-600">{error || 'ไม่พบข้อมูลสัญญา'}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 bg-gray-500 text-white rounded-lg"
          >
            ย้อนกลับ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white ${sarabun.className}`}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
          <h1 className="text-lg font-bold text-gray-800">รายละเอียดสัญญา</h1>
          <div></div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-md mx-auto">
        {/* Contract Details Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4" style={{ backgroundColor: '#F0EFEF' }}>

          {/* Project/Contract Info */}
          <div className="mb-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">เลขที่สัญญา:</span>
              <span className="text-sm font-bold text-gray-800">STORE{Date.now()}</span>
            </div>
          </div>

          {/* Item Info */}
          <div className="mb-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">ชื่อสินค้า:</span>
              <span className="text-sm font-bold text-gray-800">{item.brand} {item.model}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">ราคา:</span>
              <span className="text-sm font-bold" style={{ color: '#0A4215' }}>{contractData.price.toLocaleString()} บาท</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">ดอกเบี้ย:</span>
              <span className="text-sm font-bold text-gray-800">{contractData.interest.toLocaleString()} บาท ({contractData.interestRate || 10}%)</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">ระยะเวลา:</span>
              <span className="text-sm font-bold text-gray-800">{contractData.periodDays} วัน</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">วันที่เริ่ม:</span>
              <span className="text-sm font-bold text-gray-800">{contractData.contractDate}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">วันที่สิ้นสุด:</span>
              <span className="text-sm font-bold text-gray-800">
                {new Date(Date.now() + contractData.periodDays * 24 * 60 * 60 * 1000).toLocaleDateString('th-TH')}
              </span>
            </div>
          </div>

          {/* Description */}
          {contractData.itemDetails && (
            <div className="mb-3">
              <div className="flex justify-between items-start">
                <span className="text-sm text-gray-600">รายละเอียด:</span>
                <span className="text-sm text-gray-800 ml-2 text-right flex-1">{contractData.itemDetails}</span>
              </div>
            </div>
          )}
        </div>

        {/* Remaining Days Badge */}
        <div className="bg-green-50 rounded-full p-4 mb-4 text-center" style={{ backgroundColor: '#E7EFE9' }}>
          <div className="text-sm text-gray-600 mb-1">จำนวนวันที่เหลือ</div>
          <div className="text-2xl font-bold" style={{ color: '#0A4215' }}>{remainingDays}</div>
          <div className="text-xs text-gray-500">วัน</div>
        </div>

        {/* QR Code Section */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-center" style={{ backgroundColor: '#F0EFEF' }}>
          <div className="text-sm font-medium text-gray-700 mb-3">QR Code</div>
          <div className="bg-white p-3 rounded-lg inline-block">
            <div className="w-32 h-32 bg-gray-200 rounded flex items-center justify-center">
              <div className="text-gray-500 text-sm">QR Code</div>
            </div>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={() => router.back()}
          className="w-full py-4 px-6 rounded-lg font-medium text-white text-lg"
          style={{ backgroundColor: '#0A4215' }}
        >
          ปิด
        </button>

        {/* Footer Note */}
        <div className="text-center mt-4 text-xs text-gray-500">
          ข้อมูลสัญญาจำนำ
        </div>
      </div>
    </div>
  );
}
