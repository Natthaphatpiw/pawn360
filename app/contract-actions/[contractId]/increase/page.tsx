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

export default function IncreasePrincipalPage({ params }: { params: { contractId: string } }) {
  const { contractId } = params;
  const router = useRouter();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchContract = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/contracts/${contractId}`);
        if (response.data.success) {
          setContract(response.data.contract);
        }
      } catch (err: any) {
        setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        setLoading(false);
      }
    };

    if (contractId) {
      fetchContract();
    }
  }, [contractId]);

  const handleSubmit = async () => {
    const increaseAmount = parseFloat(amount);
    if (!increaseAmount || increaseAmount <= 0) {
      alert('กรุณาระบุจำนวนเงินที่ถูกต้อง');
      return;
    }

    try {
      setSubmitting(true);

      const response = await axios.post('/api/contracts/request-action', {
        contractId,
        actionType: 'increase_principal',
        amount: increaseAmount,
      });

      if (response.data.success) {
        alert('ส่งคำขอเพิ่มเงินต้นเรียบร้อยแล้ว ร้านค้าจะติดต่อกลับภายใน 24 ชั่วโมง');
        router.push('/contracts');
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการส่งคำขอ');
    } finally {
      setSubmitting(false);
    }
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
        <h1 className="text-xl font-bold text-black">เพิ่มเงินต้น</h1>
        <div></div>
      </div>

      {/* Contract Info */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <h2 className="font-bold text-black text-lg mb-2">
          {contract.item.brand} {contract.item.model}
        </h2>
        <div className="space-y-1 text-sm" style={{ color: '#4A4644' }}>
          <p>รหัสสัญญา: {contract.contractNumber}</p>
          <p>เงินต้นปัจจุบัน: {contract.pawnDetails.pawnedPrice.toLocaleString()} บาท</p>
        </div>
      </div>

      {/* Amount Input */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <h3 className="font-bold text-black mb-4">จำนวนเงินที่ต้องการเพิ่ม</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-2" style={{ color: '#4A4644' }}>
              จำนวนเงิน (บาท)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full p-3 border border-gray-300 rounded-lg text-lg"
              min="1"
            />
          </div>

          {amount && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-sm" style={{ color: '#4A4644' }}>สรุป</p>
              <div className="flex justify-between items-center mt-2">
                <span className="font-medium">เงินต้นใหม่:</span>
                <span className="font-bold text-purple-600">
                  {(contract.pawnDetails.pawnedPrice + parseFloat(amount || '0')).toLocaleString()} บาท
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={!amount || parseFloat(amount) <= 0 || submitting}
        className="w-full bg-purple-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอเพิ่มเงินต้น'}
      </button>
    </div>
  );
}