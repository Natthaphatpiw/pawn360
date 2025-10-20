'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface Contract {
  _id: string;
  contractNumber: string;
  status: string;
  item: {
    brand: string;
    model: string;
  };
  pawnDetails: {
    pawnedPrice: number;
    interestRate: number;
    periodDays: number;
  };
  dates: {
    startDate: string;
    dueDate: string;
  };
}

export default function ContractActionsPage({ params }: { params: { contractId: string } }) {
  const { contractId } = params;
  const router = useRouter();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContract = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/contracts/${contractId}`);
        if (response.data.success) {
          setContract(response.data.contract);
        }
      } catch (err: any) {
        setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูลสัญญา');
      } finally {
        setLoading(false);
      }
    };

    if (contractId) {
      fetchContract();
    }
  }, [contractId]);

  const handleAction = (actionType: string) => {
    switch (actionType) {
      case 'redeem':
        // ไถ่ถอน - จ่ายเงินต้น + ดอก
        router.push(`/contract-actions/${contractId}/payment?action=${actionType}&amount=${calculateTotalAmount()}`);
        break;
      case 'renew':
        // ต่อดอกเบี้ย - จ่ายเฉพาะดอก
        router.push(`/contract-actions/${contractId}/payment?action=${actionType}&amount=${calculateInterest()}`);
        break;
      case 'increase':
        // เพิ่มต้น - ไปหน้าเพิ่มจำนวน
        router.push(`/contract-actions/${contractId}/increase`);
        break;
      case 'reduce':
        // ลดต้น - จ่ายเงินต้นบางส่วน (ไปหน้า payment แต่ให้ user ระบุจำนวน)
        router.push(`/contract-actions/${contractId}/payment?action=${actionType}&amount=0`);
        break;
    }
  };

  const calculateInterest = () => {
    if (!contract) return 0;
    const { pawnedPrice, interestRate, periodDays } = contract.pawnDetails;
    // คำนวณดอกเบี้ยแบบประมาณ (30 วัน = 1 เดือน)
    return Math.round((pawnedPrice * interestRate * periodDays) / (100 * 30));
  };

  const calculateTotalAmount = () => {
    if (!contract) return 0;
    return contract.pawnDetails.pawnedPrice + calculateInterest();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold text-lg mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-red-600">{error || 'ไม่พบข้อมูลสัญญา'}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 w-full bg-gray-500 text-white py-2 rounded-lg"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.back()}
          className="text-gray-600 hover:text-gray-800 text-xl"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-black">จัดการสัญญา</h1>
        <div></div> {/* Spacer */}
      </div>

      {/* Contract Info */}
      <div className="rounded-xl p-4 mb-6" style={{ backgroundColor: '#F0EFEF' }}>
        <h2 className="font-bold text-lg mb-2" style={{ color: '#2C2A28' }}>
          {contract.item.brand} {contract.item.model}
        </h2>
        <div className="space-y-1 text-sm" style={{ color: '#2C2A28' }}>
          <p>รหัสสัญญา: {contract.contractNumber}</p>
          <p>มูลค่า: {contract.pawnDetails.pawnedPrice.toLocaleString()} บาท</p>
          <p>ดอกเบี้ย: {calculateInterest().toLocaleString()} บาท</p>
          <p>รวมทั้งสิ้น: {calculateTotalAmount().toLocaleString()} บาท</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        {/* ไถ่ถอน */}
        <button
          onClick={() => handleAction('redeem')}
          className="w-full py-4 rounded-xl font-bold text-left px-4 border-2 transition-colors"
          style={{
            backgroundColor: '#E7EFE9',
            color: '#0A4215',
            borderColor: '#B4CDB9'
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold">ไถ่ถอนสินค้า</div>
              <div className="text-sm font-normal opacity-75">
                จ่ายเงินต้นและดอกเบี้ยเพื่อรับสินค้าคืน
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold">{calculateTotalAmount().toLocaleString()}</div>
              <div className="text-sm">บาท</div>
            </div>
          </div>
        </button>

        {/* ต่อดอกเบี้ย */}
        <button
          onClick={() => handleAction('renew')}
          className="w-full py-4 rounded-xl font-bold text-left px-4 border-2 transition-colors"
          style={{
            backgroundColor: '#E6EBF2',
            color: '#042657',
            borderColor: '#B2C1D6'
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold">ต่อดอกเบี้ย</div>
              <div className="text-sm font-normal opacity-75">
                จ่ายดอกเบี้ยเพื่อต่อสัญญา
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold">{calculateInterest().toLocaleString()}</div>
              <div className="text-sm">บาท</div>
            </div>
          </div>
        </button>

        {/* เพิ่มต้น */}
        <button
          onClick={() => handleAction('increase')}
          className="w-full py-4 rounded-xl font-bold text-left px-4 border-2 transition-colors"
          style={{
            backgroundColor: '#FFF4E5',
            color: '#EEA842',
            borderColor: '#FFECD1'
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold">เพิ่มเงินต้น</div>
              <div className="text-sm font-normal opacity-75">
                เพิ่มจำนวนเงินกู้
              </div>
            </div>
            <div className="text-2xl">➕</div>
          </div>
        </button>

        {/* ลดต้น */}
        <button
          onClick={() => handleAction('reduce')}
          className="w-full py-4 rounded-xl font-bold text-left px-4 border-2 transition-colors"
          style={{
            backgroundColor: '#FEEDEE',
            color: '#CB5960',
            borderColor: '#FFDBDD'
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold">ลดเงินต้น</div>
              <div className="text-sm font-normal opacity-75">
                จ่ายเงินต้นบางส่วน
              </div>
            </div>
            <div className="text-2xl">➖</div>
          </div>
        </button>
      </div>
    </div>
  );
}
