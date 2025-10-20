'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import Image from 'next/image';

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

export default function PaymentPage({ params }: { params: { contractId: string } }) {
  const { contractId } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  const actionType = searchParams.get('action') || 'redeem';
  const initialAmount = parseFloat(searchParams.get('amount') || '0');

  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [customAmount, setCustomAmount] = useState<string>(initialAmount > 0 ? initialAmount.toString() : '');
  const [amount, setAmount] = useState<number>(initialAmount);

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

  const getActionTitle = () => {
    switch (actionType) {
      case 'redeem': return 'ไถ่ถอนสินค้า';
      case 'renew': return 'ต่อดอกเบี้ย';
      case 'reduce': return 'ลดเงินต้น';
      default: return 'ชำระเงิน';
    }
  };

  const getActionDescription = () => {
    switch (actionType) {
      case 'redeem': return 'ชำระเงินต้นและดอกเบี้ยเพื่อรับสินค้าคืน';
      case 'renew': return 'ชำระดอกเบี้ยเพื่อต่อสัญญา';
      case 'reduce': return 'ชำระเงินต้นบางส่วนเพื่อลดดอกเบี้ย';
      default: return '';
    }
  };

  const handleAmountChange = (value: string) => {
    setCustomAmount(value);
    setAmount(parseFloat(value) || 0);
  };

  const handleSlipUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSlipFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setSlipPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!slipFile) {
      alert('กรุณาอัพโหลดสลิปการโอนเงิน');
      return;
    }

    if (actionType === 'reduce' && (amount <= 0 || amount > contract!.pawnDetails.pawnedPrice)) {
      alert('กรุณาระบุจำนวนเงินที่ถูกต้อง');
      return;
    }

    try {
      setSubmitting(true);

      // Send request action with slip
      const formData = new FormData();
      formData.append('slip', slipFile);
      formData.append('contractId', contractId);
      formData.append('actionType', actionType);
      formData.append('amount', amount.toString());

      const response = await axios.post('/api/contracts/request-action', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        alert('ส่งคำขอเรียบร้อยแล้ว ร้านค้าจะติดต่อกลับภายใน 24 ชั่วโมง');
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
        <h1 className="text-xl font-bold text-black">{getActionTitle()}</h1>
        <div></div>
      </div>

      {/* Contract Info */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <h2 className="font-bold text-black text-lg mb-2">
          {contract.item.brand} {contract.item.model}
        </h2>
        <div className="space-y-1 text-sm" style={{ color: '#4A4644' }}>
          <p>รหัสสัญญา: {contract.contractNumber}</p>
          <p>{getActionDescription()}</p>
        </div>
      </div>

      {/* Amount */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
        {actionType === 'reduce' ? (
          <div>
            <p className="text-sm mb-2" style={{ color: '#4A4644' }}>จำนวนเงินที่ต้องการลด</p>
            <input
              type="number"
              value={customAmount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0"
              className="w-full p-3 border border-gray-300 rounded-lg text-xl text-center font-bold"
              min="1"
              max={contract.pawnDetails.pawnedPrice}
            />
            <p className="text-xs mt-2 text-center" style={{ color: '#4A4644' }}>
              สูงสุด: {contract.pawnDetails.pawnedPrice.toLocaleString()} บาท
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm" style={{ color: '#4A4644' }}>จำนวนเงินที่ต้องชำระ</p>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {amount.toLocaleString()} บาท
            </p>
          </div>
        )}
      </div>

      {/* QR Code */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <h3 className="font-bold text-black text-center mb-4">QR Code สำหรับการโอนเงิน</h3>
        <div className="flex justify-center">
          <Image
            src="https://piwp360.s3.ap-southeast-2.amazonaws.com/bank/QRCode.png"
            alt="QR Code"
            width={200}
            height={200}
            className="rounded-lg"
          />
        </div>
        <p className="text-center text-sm mt-4" style={{ color: '#4A4644' }}>
          สแกน QR Code เพื่อโอนเงิน หรือโอนไปยังบัญชีใน QR Code
        </p>
      </div>

      {/* Upload Slip */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <h3 className="font-bold text-black mb-4">อัพโหลดสลิปการโอนเงิน</h3>

        <div className="space-y-4">
          <input
            type="file"
            accept="image/*"
            onChange={handleSlipUpload}
            className="w-full p-3 border border-gray-300 rounded-lg"
          />

          {slipPreview && (
            <div className="mt-4">
              <p className="text-sm mb-2" style={{ color: '#4A4644' }}>ภาพสลิป:</p>
              <img
                src={slipPreview}
                alt="Slip preview"
                className="w-full max-w-sm mx-auto rounded-lg border"
              />
            </div>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={!slipFile || submitting}
        className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'กำลังส่งคำขอ...' : 'ยืนยันการชำระเงิน'}
      </button>
    </div>
  );
}
