'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { X, Upload } from 'lucide-react';

function InvestorPaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading } = useLiff();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get contractId from query params or liff.state
  let contractId = searchParams.get('contractId');
  if (!contractId) {
    const liffState = searchParams.get('liff.state');
    if (liffState) {
      const match = liffState.match(/contractId=([^&]+)/);
      if (match) contractId = match[1];
    }
  }

  const [amount, setAmount] = useState('');
  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [uploadingSlip, setUploadingSlip] = useState(false);

  useEffect(() => {
    if (contractId) {
      fetchContractDetails();
    }
  }, [contractId]);

  const fetchContractDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/contracts/${contractId}`);
      setContract(response.data.contract);
      // Pre-fill amount
      setAmount(response.data.contract.loan_principal_amount?.toLocaleString() || '');
    } catch (error: any) {
      console.error('Error fetching contract:', error);
      setError(error.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingSlip(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'payment-slips');

      const response = await axios.post('/api/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.url) {
        setSlipImage(response.data.url);
      }
    } catch (error) {
      console.error('Error uploading slip:', error);
      alert('ไม่สามารถอัปโหลดสลิปได้');
    } finally {
      setUploadingSlip(false);
    }
  };

  const handleRemoveImage = () => {
    setSlipImage(null);
  };

  const handleSubmit = async () => {
    if (!profile?.userId) {
      alert('กรุณาเข้าสู่ระบบ LINE');
      return;
    }

    if (!slipImage) {
      alert('กรุณาอัปโหลดสลิปการโอนเงิน');
      return;
    }

    const amountNum = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('กรุณากรอกยอดเงินที่ถูกต้อง');
      return;
    }

    try {
      setSubmitting(true);

      const response = await axios.post('/api/payments/investor-payment', {
        contractId,
        investorLineId: profile.userId,
        amount: amountNum,
        paymentSlipUrl: slipImage
      });

      if (response.data.success) {
        alert('ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว รอการยืนยันจากผู้จำนำ');
        // Close LIFF
        if (typeof window !== 'undefined' && window.liff) {
          window.liff.closeWindow();
        }
      }
    } catch (error: any) {
      console.error('Error submitting payment:', error);
      alert(error.response?.data?.error || 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'ไม่พบข้อมูลสัญญา'}</p>
          <button
            onClick={() => window.history.back()}
            className="bg-[#1E3A8A] text-white px-6 py-3 rounded-lg"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  const paymentStatus = contract.payment_status as string | undefined;
  const fundingStatus = contract.funding_status as string | undefined;
  const hasSlip = Boolean(contract.payment_slip_url);
  const isRejected = paymentStatus === 'REJECTED';
  const isPaid = paymentStatus === 'INVESTOR_PAID' || paymentStatus === 'COMPLETED';
  const isConfirmed = contract.contract_status === 'CONFIRMED' || Boolean(contract.payment_confirmed_at);
  const isFundingClosed = Boolean(fundingStatus && fundingStatus !== 'PENDING');
  const canSubmit = !isPaid && !isConfirmed && !isFundingClosed && (!hasSlip || isRejected);

  if (!canSubmit) {
    let blockedMessage = 'สัญญานี้อยู่ในสถานะที่ไม่สามารถส่งสลิปได้';
    if (isPaid || hasSlip) {
      blockedMessage = 'คุณได้ส่งหลักฐานการชำระเงินแล้ว กรุณารอผู้จำนำยืนยัน';
    } else if (isConfirmed) {
      blockedMessage = 'รายการนี้ได้รับการยืนยันแล้ว';
    } else if (isFundingClosed) {
      blockedMessage = 'สัญญานี้อยู่ในสถานะที่ไม่สามารถส่งสลิปได้';
    }

    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <p className="text-gray-700 mb-4">{blockedMessage}</p>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.liff) {
                window.liff.closeWindow();
              } else {
                window.history.back();
              }
            }}
            className="bg-[#1E3A8A] text-white px-6 py-3 rounded-lg"
          >
            ปิด
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center p-4 relative pb-24">

      {/* Header */}
      <div className="text-center mt-6 mb-8">
        <h1 className="text-lg font-bold text-gray-800 mb-1">ส่งหลักฐานการชำระเงิน</h1>
        <p className="text-gray-500 text-sm font-light">อัปโหลดสลิปการโอนเงิน</p>
      </div>

      {isRejected && (
        <div className="w-full max-w-sm bg-[#FFF4E5] text-[#B45309] border border-[#FCD34D] rounded-2xl p-4 mb-4 text-sm">
          ผู้จำนำแจ้งว่ายังไม่ได้รับเงิน กรุณาตรวจสอบและส่งสลิปใหม่อีกครั้ง
        </div>
      )}

      {/* Contract Info */}
      <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-2">รายละเอียดสัญญา</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">หมายเลขสัญญา</span>
            <span className="font-medium">{contract.contract_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">สินค้า</span>
            <span className="font-medium">{contract.items?.brand} {contract.items?.model}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">วงเงินจำนำ</span>
            <span className="font-bold text-[#1E3A8A]">{contract.loan_principal_amount?.toLocaleString()} บาท</span>
          </div>
        </div>
      </div>

      {/* Pawner Bank Info */}
      <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-2">บัญชีผู้รับเงิน (Pawner)</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">ธนาคาร</span>
            <span className="font-medium">{contract.pawners?.bank_name || 'ไม่ระบุ'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">ชื่อบัญชี</span>
            <span className="font-medium">{contract.pawners?.bank_account_name || `${contract.pawners?.firstname} ${contract.pawners?.lastname}`}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">เลขบัญชี</span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#1E3A8A]">{contract.pawners?.bank_account_no || 'ไม่ระบุ'}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(contract.pawners?.bank_account_no || '');
                  alert('คัดลอกเลขบัญชีแล้ว');
                }}
                className="bg-[#E9EFF6] text-[#1E3A8A] text-xs px-2 py-1 rounded"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm">

        {/* Transfer Amount Input */}
        <div className="mb-4">
          <div className="flex justify-between items-end mb-2">
            <div className="flex items-center gap-2">
              <label className="font-bold text-gray-800 text-base">ยอดที่โอน*</label>
              <span className="bg-[#D1D5DB] text-gray-600 text-xs px-2 py-0.5 rounded-md font-light">Transfer amount</span>
            </div>
            <span className="text-gray-500 text-sm">บาท</span>
          </div>

          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full p-4 bg-white border border-gray-300 rounded-xl text-xl text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
          />
        </div>

        {/* Upload Area */}
        <div
          onClick={() => !slipImage && fileInputRef.current?.click()}
          className={`bg-white rounded-3xl p-4 h-48 mb-4 shadow-sm flex flex-col items-center justify-center border-2 transition-colors relative overflow-hidden ${
            slipImage ? 'border-transparent' : 'border-dashed border-gray-300 hover:border-gray-400 cursor-pointer'
          }`}
        >
          {uploadingSlip ? (
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A]"></div>
          ) : slipImage ? (
            <div className="w-full h-full relative">
              <img
                src={slipImage}
                alt="Slip Preview"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <>
              <div className="w-12 h-12 mb-2 text-gray-600">
                <Upload className="w-full h-full" />
              </div>
              <span className="text-gray-600 font-medium">อัปโหลด slip</span>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* Remove Button */}
        {slipImage && (
          <button
            onClick={handleRemoveImage}
            className="w-full bg-[#E9EFF6] border border-[#1E3A8A] hover:bg-[#DCE4EF] text-[#1E3A8A] rounded-2xl py-3 flex flex-col items-center justify-center mb-8 transition-colors active:scale-[0.98]"
          >
            <span className="text-base font-bold">ลบ</span>
            <span className="text-[10px] font-light opacity-80">Remove</span>
          </button>
        )}

      </div>

      {/* Submit Button (Fixed Bottom) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F2]">
        <div className="max-w-sm mx-auto">
          <button
            onClick={handleSubmit}
            disabled={submitting || !slipImage}
            className="w-full bg-[#1E3A8A] hover:bg-[#152C6F] text-white rounded-2xl py-4 flex flex-col items-center justify-center shadow-lg transition-colors active:scale-[0.98] disabled:opacity-50"
          >
            <span className="text-lg font-bold">{submitting ? 'กำลังส่ง...' : 'ส่ง'}</span>
            <span className="text-xs font-light opacity-80">Submit</span>
          </button>
        </div>
      </div>

    </div>
  );
}

export default function InvestorPaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <InvestorPaymentContent />
    </Suspense>
  );
}
