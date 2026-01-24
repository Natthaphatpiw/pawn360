'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ChevronLeft, AlertTriangle, TrendingUp, Calculator, Wallet, Info } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signatureData: string) => void;
  title: string;
}

function SignatureModal({ isOpen, onClose, onSave, title }: SignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      clearCanvas();
    }
  }, [isOpen]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const { x, y } = getCoordinates(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const { x, y } = getCoordinates(e);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    startDrawing(e);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    draw(e);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dataURL = canvas.toDataURL('image/png');
      onSave(dataURL);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-[#FFF8F5]">
          <h3 className="text-lg font-bold text-center text-gray-800">{title}</h3>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">เซ็นลายเซ็นของคุณ</label>
            <div className="border-2 border-dashed border-[#B85C38] rounded-xl bg-white overflow-hidden">
              <canvas
                ref={canvasRef}
                width={300}
                height={150}
                className="w-full h-40 cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={stopDrawing}
                style={{ touchAction: 'none' }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">ใช้นิ้วหรือเมาส์วาดลายเซ็น</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={clearCanvas}
              className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
            >
              ล้าง
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
            >
              ยกเลิก
            </button>
            <button
              onClick={saveSignature}
              className="flex-1 py-3 px-4 bg-[#B85C38] text-white rounded-xl hover:bg-[#A04D2D] transition-colors font-medium"
            >
              บันทึก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrincipalIncreasePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const { profile } = useLiff();

  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<any>(null);
  const [calculation, setCalculation] = useState<any>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [increaseAmount, setIncreaseAmount] = useState<string>(searchParams.get('amount') || '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Bank account info
  const [bankName, setBankName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');

  useEffect(() => {
    fetchContractDetails();
  }, [contractId]);

  useEffect(() => {
    if (contract && increaseAmount) {
      calculateIncrease();
    }
  }, [increaseAmount, contract]);

  const redirectToPenalty = (payload?: any) => {
    if (!payload?.penaltyRequired || !payload?.penaltyLiffUrl) {
      return false;
    }

    try {
      const url = new URL(payload.penaltyLiffUrl);
      if (!url.searchParams.get('contractId')) {
        url.searchParams.set('contractId', contractId);
      }
      url.searchParams.set('returnTo', `${window.location.pathname}${window.location.search}`);
      window.location.href = url.toString();
      return true;
    } catch (error) {
      window.location.href = payload.penaltyLiffUrl;
      return true;
    }
  };

  const fetchContractDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/contracts/${contractId}`);
      if (response.data.success) {
        setContract(response.data.contract);
        // Pre-fill bank account if available
        const pawner = response.data.contract?.pawners;
        if (pawner) {
          setBankName(pawner.bank_name || '');
          setBankAccountNo(pawner.bank_account_no || '');
          setBankAccountName(pawner.bank_account_name || `${pawner.firstname} ${pawner.lastname}`);
        }
      }
    } catch (error) {
      console.error('Error fetching contract:', error);
      setError('ไม่สามารถโหลดข้อมูลสัญญาได้');
    } finally {
      setLoading(false);
    }
  };

  const calculateIncrease = async () => {
    const amount = parseFloat(increaseAmount);
    if (!amount || amount <= 0) {
      setCalculation(null);
      return;
    }

    try {
      const response = await axios.post('/api/contract-actions/calculate', {
        contractId,
        actionType: 'PRINCIPAL_INCREASE',
        increaseAmount: amount,
      });

      if (response.data.success) {
        setCalculation(response.data.calculation);
        setError(null);
      }
    } catch (error: any) {
      if (redirectToPenalty(error?.response?.data)) {
        return;
      }
      console.error('Error calculating:', error);
      setError(error.response?.data?.error || 'ไม่สามารถคำนวณได้');
      setCalculation(null);
    }
  };

  const handleProceed = async () => {
    if (!termsAccepted || !calculation || !signature) {
      return;
    }

    if (!bankName || !bankAccountNo || !bankAccountName) {
      setError('กรุณากรอกข้อมูลบัญชีธนาคารให้ครบถ้วน');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Upload signature to S3
      const signatureBlob = await fetch(signature).then(r => r.blob());
      const formData = new FormData();
      formData.append('file', signatureBlob, 'signature.png');
      formData.append('folder', 'signatures');

      const uploadRes = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!uploadRes.data.url) {
        throw new Error('Failed to upload signature');
      }

      const response = await axios.post('/api/contract-actions/create', {
        contractId,
        actionType: 'PRINCIPAL_INCREASE',
        increaseAmount: parseFloat(increaseAmount),
        pawnerLineId: profile?.userId,
        termsAccepted: true,
        pawnerSignatureUrl: uploadRes.data.url,
        pawnerBankAccount: {
          bank_name: bankName,
          bank_account_no: bankAccountNo,
          bank_account_name: bankAccountName,
        },
      });

      if (response.data.success) {
        router.push(`/contracts/${contractId}/principal-increase/upload?requestId=${response.data.requestId}`);
      } else {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
      if (redirectToPenalty(error?.response?.data)) {
        return;
      }
      console.error('Error creating request:', error);
      setError(error.response?.data?.error || error.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#B85C38]"></div>
      </div>
    );
  }

  const basePrincipal = contract?.loan_principal_amount || contract?.original_principal_amount || 0;
  const currentPrincipal = contract?.current_principal_amount || basePrincipal;
  const itemValue = contract?.items?.estimated_value || basePrincipal * 1.5 || 0;
  const maxIncrease = Math.max(0, itemValue - currentPrincipal);
  const interestFirstPart = calculation?.interestFirstPart ?? calculation?.interestForPeriod ?? 0;
  const interestRemaining = calculation?.interestRemaining ?? calculation?.newInterestForRemaining ?? 0;
  const feeAmount = calculation?.feeAmount ?? 0;
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const originalTotalInterest = calculation
    ? round2(calculation.currentPrincipal * calculation.dailyInterestRate * calculation.daysInContract + feeAmount)
    : 0;
  const totalInterestAfterAction = calculation
    ? round2(interestFirstPart + interestRemaining)
    : 0;
  const payTodayAmount = interestFirstPart;
  const payEndAmount = interestRemaining;
  const rawRate = Number(contract?.interest_rate || 0);
  const totalMonthlyRate = rawRate > 1 ? rawRate / 100 : rawRate;
  const feeRate = 0.01;
  const interestRatePawner = Math.max(0, totalMonthlyRate - feeRate);

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col">
      {/* Signature Modal */}
      <SignatureModal
        isOpen={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onSave={(sig) => setSignature(sig)}
        title="เซ็นลายเซ็น"
      />

      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center shadow-sm sticky top-0 z-10">
        <ChevronLeft
          className="w-6 h-6 text-gray-800 cursor-pointer"
          onClick={() => router.back()}
        />
        <div className="flex-1 text-center">
          <h1 className="font-bold text-lg text-gray-800">เพิ่มเงินต้น</h1>
          <p className="text-xs text-gray-400">Increase Principal</p>
        </div>
        <button
          type="button"
          onClick={() => setShowInfoModal(true)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          aria-label="ข้อมูลการเพิ่มเงินต้น"
        >
          <Info className="w-5 h-5 text-[#B85C38]" />
        </button>
      </div>

      {showInfoModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-xl">
            <h2 className="text-lg font-bold text-gray-800 mb-2">รายละเอียดการเพิ่มเงินต้น</h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              การเพิ่มเงินต้นคือการขอวงเงินเพิ่มในสัญญาเดิม ต้องชำระดอกเบี้ยที่ค้างถึงวันนี้ทันที
              และระบบจะสร้างสัญญาใหม่ตามเงินต้นใหม่ นักลงทุนมีสิทธิ์อนุมัติหรือปฏิเสธ
              เมื่ออนุมัติแล้วจะโอนเงินเพิ่มให้ตามยอดที่ร้องขอ
            </p>
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="w-full bg-[#B85C38] text-white rounded-xl py-3 font-bold hover:bg-[#A04D2D] transition-colors"
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center p-6 pb-32">
        {error && (
          <div className="w-full max-w-sm bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Contract Info */}
        <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#FFF8F5] rounded-full flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[#B85C38]" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800">สัญญาเลขที่ {contract?.contract_number}</h2>
              <p className="text-xs text-gray-500">{contract?.items?.brand} {contract?.items?.model}</p>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">เงินต้นปัจจุบัน:</span>
              <span className="font-bold">{currentPrincipal.toLocaleString()} บาท</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">มูลค่าประเมินทรัพย์:</span>
              <span className="font-bold">{itemValue.toLocaleString()} บาท</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">อัตราดอกเบี้ย:</span>
              <span className="font-bold">
                {(interestRatePawner * 100).toFixed(2)}% + {(feeRate * 100).toFixed(2)}% / เดือน
              </span>
            </div>
          </div>
        </div>

        <div className="w-full max-w-sm bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-4 text-xs text-amber-800">
          การเพิ่มเงินต้นคือการขอวงเงินเพิ่มในสัญญาเดิม
          ต้องชำระดอกเบี้ยที่เกิดขึ้นถึงวันนี้ (รวมค่าธรรมเนียม) ทันที และรออนุมัติจากนักลงทุนก่อนรับเงินเพิ่ม
        </div>

        {/* Increase Amount Input */}
        <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-[#B85C38]" />
            ระบุจำนวนเงินที่ต้องการเพิ่ม
          </h3>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-2">จำนวนเงินต้นที่ต้องการเพิ่ม (บาท)</label>
            <input
              type="number"
              value={increaseAmount}
              onChange={(e) => setIncreaseAmount(e.target.value)}
              placeholder="เช่น 5000"
              min="1"
              max={maxIncrease}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#B85C38] text-lg font-bold text-center"
            />
            <p className="text-xs text-gray-500 mt-2 text-center">
              สามารถเพิ่มได้สูงสุด {maxIncrease.toLocaleString()} บาท
            </p>
          </div>

          {/* Quick Amount Buttons */}
          <div className="flex flex-wrap gap-2 justify-center">
            {[1000, 2000, 5000, 10000].map((amount) => (
              <button
                key={amount}
                onClick={() => setIncreaseAmount(Math.min(amount, maxIncrease).toString())}
                disabled={amount > maxIncrease}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  amount <= maxIncrease
                    ? 'bg-[#FFF8F5] text-[#B85C38] hover:bg-[#F0D4C8]'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {amount.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Calculation Result */}
        {calculation && (
          <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-3">สรุปการคำนวณ</h3>

            <div className="space-y-3 text-sm">
              <div className="bg-[#FFF8F5] rounded-xl p-3">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">เงินต้นปัจจุบัน:</span>
                  <span className="font-bold">{currentPrincipal.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">จำนวนที่เพิ่ม:</span>
                  <span className="font-bold text-green-600">+ {calculation.increaseAmount?.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[#F0D4C8]">
                  <span className="font-bold text-gray-800">เงินต้นใหม่:</span>
                  <span className="font-bold text-[#B85C38] text-lg">{calculation.newPrincipal?.toLocaleString()} บาท</span>
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-3">
                <h4 className="font-bold text-blue-800 mb-2">ดอกเบี้ยตามช่วงเวลา</h4>
                <div className="flex justify-between mb-1">
                  <span className="text-blue-700">ดอกเบี้ยถึงวันนี้ (รวมค่าธรรมเนียม):</span>
                  <span className="font-bold text-blue-800">{interestFirstPart.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-blue-700">ค่าธรรมเนียมคงที่:</span>
                  <span className="font-bold text-blue-800">{feeAmount.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">ดอกเบี้ยในสัญญาใหม่:</span>
                  <span className="font-bold text-blue-800">{interestRemaining.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-blue-700">ดอกเบี้ยตามสัญญาเดิม:</span>
                  <span className="font-bold text-blue-800">{originalTotalInterest.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">ดอกเบี้ยรวมหลังทำรายการ:</span>
                  <span className="font-bold text-blue-800">{totalInterestAfterAction.toLocaleString()} บาท</span>
                </div>
              </div>

              <div className="bg-amber-50 rounded-xl p-3">
                <h4 className="font-bold text-amber-800 mb-2">การชำระดอกเบี้ย</h4>
                <p className="text-xs text-amber-800">
                  ต้องชำระดอกเบี้ยที่เกิดขึ้นถึงวันนี้ (รวมค่าธรรมเนียม) ทันที เพื่อปรับยอดเงินต้นใหม่
                </p>
                <p className="text-[11px] text-amber-700 mt-2">
                  ยอดดอกเบี้ยที่ต้องชำระวันนี้: {payTodayAmount.toLocaleString()} บาท
                </p>
              </div>

              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-xs text-amber-800">
                  <span className="font-bold">หมายเหตุ:</span> นักลงทุนจะโอนเงินจำนวน {calculation.increaseAmount?.toLocaleString()} บาท เข้าบัญชีของคุณหลังจากอนุมัติ
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  ยอดดอกเบี้ยที่บันทึกในสัญญาใหม่: {payEndAmount.toLocaleString()} บาท
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Bank Account Info */}
        {calculation && (
          <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#B85C38]" />
              บัญชีรับเงิน
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              กรุณากรอกข้อมูลบัญชีธนาคารที่ต้องการรับเงิน
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">ชื่อธนาคาร</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="เช่น กสิกรไทย, ไทยพาณิชย์"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#B85C38]"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">เลขบัญชี</label>
                <input
                  type="text"
                  value={bankAccountNo}
                  onChange={(e) => setBankAccountNo(e.target.value)}
                  placeholder="เลขบัญชีธนาคาร"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#B85C38]"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">ชื่อบัญชี</label>
                <input
                  type="text"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  placeholder="ชื่อเจ้าของบัญชี"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#B85C38]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Warning Section */}
        <div className="w-full max-w-sm bg-red-50 rounded-2xl p-4 mb-4 border border-red-200">
          <h3 className="font-bold text-red-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            คำเตือน
          </h3>
          <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
            <li>การเพิ่มเงินต้นต้องได้รับการอนุมัติจากนักลงทุน</li>
            <li>นักลงทุนมีสิทธิ์ปฏิเสธคำขอได้</li>
            <li>หลังจากนักลงทุนอนุมัติ เงินจะโอนเข้าบัญชีที่ระบุ</li>
            <li>ดอกเบี้ยจะคำนวณใหม่ตามเงินต้นที่เพิ่มขึ้น</li>
            <li>การไม่ชำระดอกเบี้ยหรือไถ่ถอนตามกำหนดจะทำให้สูญเสียสิทธิ์ในทรัพย์จำนำ</li>
          </ul>
        </div>

        {/* Signature Section */}
        {calculation && (
          <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-3">ลายเซ็นผู้จำนำ</h3>
            <p className="text-xs text-gray-500 mb-3">
              กรุณาเซ็นลายเซ็นเพื่อยืนยันการขอเพิ่มเงินต้น
            </p>

            {signature ? (
              <div className="space-y-3">
                <div className="border-2 border-[#B85C38] rounded-xl p-2 bg-white">
                  <img
                    src={signature}
                    alt="Signature"
                    className="w-full h-32 object-contain"
                  />
                </div>
                <button
                  onClick={() => setShowSignatureModal(true)}
                  className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  เซ็นใหม่
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSignatureModal(true)}
                className="w-full py-4 border-2 border-dashed border-[#B85C38] rounded-xl text-[#B85C38] font-medium hover:bg-[#FFF8F5] transition-colors"
              >
                แตะเพื่อเซ็นลายเซ็น
              </button>
            )}
          </div>
        )}

        {/* Terms Acceptance */}
        {calculation && signature && (
          <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-[#B85C38] focus:ring-[#B85C38]"
              />
              <span className="text-sm text-gray-700">
                ข้าพเจ้าได้อ่านและยอมรับข้อตกลงและเงื่อนไขทั้งหมด
                และยืนยันว่าต้องการขอเพิ่มเงินต้นจำนวน {calculation.increaseAmount?.toLocaleString()} บาท
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F2]">
        <div className="max-w-sm mx-auto">
          <button
            onClick={handleProceed}
            disabled={!termsAccepted || !calculation || !signature || submitting || !bankName || !bankAccountNo || !bankAccountName}
            className={`w-full py-4 rounded-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-[0.98] ${
              termsAccepted && calculation && signature && !submitting && bankName && bankAccountNo && bankAccountName
                ? 'bg-[#B85C38] hover:bg-[#A04D2D] text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <span className="text-lg font-bold">ส่งคำขอเพิ่มเงินต้น</span>
                <span className="text-xs font-light opacity-80">Submit Request</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
