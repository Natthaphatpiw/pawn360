'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AlertTriangle, Info } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import ContractActionTabs from '../_components/ContractActionTabs';
import TransactionHeader from '../_components/TransactionHeader';
import { withPreview } from '../_lib/preview';

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
    }

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
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
      onSave(canvas.toDataURL('image/png'));
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/35 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-white rounded-xl max-w-sm w-full overflow-hidden">
        <div className="p-4 border-b border-primary-border bg-primary-soft">
          <h3 className="text-lg font-bold text-center text-foreground">{title}</h3>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground-muted">เซ็นลายเซ็นของคุณ</label>
            <div className="border-2 border-dashed border-primary rounded-xl bg-background-white overflow-hidden">
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
            <p className="text-xs text-foreground-subtle mt-2 text-center">ใช้นิ้วหรือเมาส์วาดลายเซ็น</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={clearCanvas}
              className="flex-1 py-3 px-4 bg-background-white text-primary rounded-full hover:bg-gray-200 transition-colors font-medium border border-primary"
            >
              ล้าง
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-primary-soft text-primary rounded-full hover:bg-gray-200 transition-colors font-medium"
            >
              ยกเลิก
            </button>
            <button
              onClick={saveSignature}
              className="flex-1 py-3 px-4 bg-primary text-white rounded-full hover:bg-primary/80 transition-colors font-medium"
            >
              บันทึก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Calculation {
  contractId: string;
  actionType: string;
  currentPrincipal: number;
  interestRate: number;
  dailyInterestRate: number;
  daysInContract: number;
  daysElapsed: number;
  daysRemaining: number;
  interestAccrued: number;
  feeAmount?: number;
  interestAccruedWithFee?: number;
  reductionAmount: number;
  interestForPeriod: number;
  interestFirstPart?: number;
  interestRemaining?: number;
  interestTotalIfPayLater?: number;
  totalToPay: number;
  baseTotalToPay?: number;
  principalAfterReduction: number;
  newInterestForRemaining: number;
  interestSavings: number;
  description: string;
  penaltyRequired?: boolean;
  penaltyAmount?: number;
  penalty?: {
    daysOverdue: number;
    penaltyAmount: number;
  };
}

interface CompanyBank {
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  promptpay_number: string;
}

export default function PrincipalReductionPage() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.contractId as string;
  const { profile } = useLiff();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reductionAmount, setReductionAmount] = useState('');
  const [calculation, setCalculation] = useState<Calculation | null>(null);
  const [contract, setContract] = useState<any>(null);
  const [companyBank, setCompanyBank] = useState<CompanyBank | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contractId) {
      fetchContractSummary();
      fetchCompanyBank();
    }
  }, [contractId]);

  useEffect(() => {
    const amountValue = parseFloat(reductionAmount);
    if (contractId && amountValue > 0) {
      fetchCalculation(amountValue);
    } else {
      setCalculation(null);
    }
  }, [contractId, reductionAmount]);

  const fetchContractSummary = async () => {
    try {
      const response = await axios.get(`/api/contracts/detail/${contractId}`);
      if (response.data.success) {
        setContract(response.data.contract);
        return;
      }
      throw new Error('Contract summary unavailable');
    } catch (error) {
      console.error('Error fetching contract summary:', error);
      setContract({
        contract_id: contractId,
        contract_number: `CT-${contractId}-MOCK`,
        item: { brand: 'Apple', model: 'iPhone 13' },
        remainingPrincipal: 10000,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCalculation = async (amountValue: number) => {
    try {
      const response = await axios.post('/api/contract-actions/calculate', {
        contractId,
        actionType: 'PRINCIPAL_REDUCTION',
        amount: amountValue,
      });

      if (response.data.success) {
        setCalculation(response.data.calculation);
        if (response.data.contract) {
          setContract(response.data.contract);
        }
      } else {
        throw new Error('Principal reduction calculation unavailable');
      }
    } catch (error: any) {
      console.error('Error fetching calculation:', error);
      const mockReductionAmount = amountValue > 0 ? amountValue : 2000;
      setCalculation({
        contractId,
        actionType: 'PRINCIPAL_REDUCTION',
        currentPrincipal: 10000,
        interestRate: 0.03,
        dailyInterestRate: 0.001,
        daysInContract: 30,
        daysElapsed: 30,
        daysRemaining: 0,
        interestAccrued: 300,
        feeAmount: 100,
        interestAccruedWithFee: 400,
        reductionAmount: mockReductionAmount,
        interestForPeriod: 400,
        interestFirstPart: 400,
        interestRemaining: 240,
        interestTotalIfPayLater: 540,
        totalToPay: mockReductionAmount + 400,
        baseTotalToPay: mockReductionAmount + 400,
        principalAfterReduction: 10000 - mockReductionAmount,
        newInterestForRemaining: 240,
        interestSavings: 300,
        description: 'Mock preview calculation',
        penaltyRequired: false,
        penaltyAmount: 0,
      });
    }
  };

  const fetchCompanyBank = async () => {
    // Hardcoded for now, can be fetched from API
    setCompanyBank({
      bank_name: 'พร้อมเพย์',
      bank_account_no: '0626092941',
      bank_account_name: 'ณัฐภัทร ต้อยจัตุรัส',
      promptpay_number: '0626092941',
    });
  };

  const handleProceedToPayment = async () => {
    if (!acceptedTerms) {
      alert('กรุณายอมรับข้อตกลงและเงื่อนไข');
      return;
    }

    if (!signature) {
      setError('กรุณาเซ็นลายเซ็นเพื่อยืนยันรายการ');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const signatureBlob = await fetch(signature).then((r) => r.blob());
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
        actionType: 'PRINCIPAL_REDUCTION',
        amount: parseFloat(reductionAmount),
        pawnerLineId: profile?.userId,
        termsAccepted: true,
        pawnerSignatureUrl: uploadRes.data.url,
      });

      if (response.data.success) {
        const nextRequestId = response.data.requestId;
        if (!nextRequestId) {
          throw new Error('Missing requestId');
        }

        if (response.data.resumeStep === 'SIGN') {
          router.push(`/contracts/${contractId}/principal-reduction/sign?requestId=${nextRequestId}`);
          return;
        }

        router.push(`/contracts/${contractId}/principal-reduction/upload?requestId=${nextRequestId}`);
      }
    } catch (error: any) {
      console.error('Error creating request:', error);
      setError(error.response?.data?.error || error.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      const previewRequestId = `preview-reduction-${contractId}`;
      router.push(withPreview(`/contracts/${contractId}/principal-reduction/upload`, 'requestId', previewRequestId));
    } finally {
      setSubmitting(false);
    }
  };

  const DetailRow = ({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) => (
    <div className="flex justify-between items-center py-2">
      <span className="text-foreground-subtle text-sm">{label}</span>
      <span className={`text-sm font-medium ${highlight ? 'text-primary font-bold' : 'text-foreground'}`}>{value}</span>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen bg-background-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600">ไม่พบข้อมูลสัญญา</p>
        </div>
      </div>
    );
  }

  const interestFirstPart = calculation?.interestFirstPart ?? calculation?.interestForPeriod ?? 0;
  const interestRemaining = calculation?.interestRemaining ?? calculation?.newInterestForRemaining ?? 0;
  const feeAmount = calculation?.feeAmount ?? 0;
  const interestAccruedOnly = Number(calculation?.interestAccrued || Math.max(0, interestFirstPart - feeAmount));
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const originalTotalInterest = calculation
    ? round2(calculation.currentPrincipal * calculation.dailyInterestRate * calculation.daysInContract + feeAmount)
    : 0;
  const totalInterestAfterAction = round2(interestFirstPart + interestRemaining);
  const penaltyAmount = calculation?.penaltyRequired ? Number(calculation.penaltyAmount || calculation.penalty?.penaltyAmount || 0) : 0;
  const maxReduction = Number(contract.remainingPrincipal || calculation?.currentPrincipal || 0);

  return (
    <div className="min-h-screen bg-background-white font-sans flex flex-col">
      <SignatureModal
        isOpen={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onSave={(sig) => setSignature(sig)}
        title="เซ็นลายเซ็น"
      />

      <TransactionHeader
        title="ลดเงินต้น"
        subtitle="Principal Reduction"
        rightSlot={
          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            className="h-8 w-8 rounded-full bg-background-white text-primary transition-colors hover:bg-primary-soft"
            aria-label="ข้อมูลการลดเงินต้น"
          >
            <Info className="h-5 w-5" />
          </button>
        }
      />

      {/* Transaction tabs */}
      {/* <ContractActionTabs contractId={contractId} activeTab="principal-reduction" /> */}

      {showInfoModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowInfoModal(false)}>
          <div className="bg-background-white w-full max-w-sm rounded-xl p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-foreground mb-2">รายละเอียดการลดเงินต้น</h2>
            <p className="text-sm text-foreground-subtle mb-4 leading-relaxed">
              การลดเงินต้นคือการชำระเงินต้นบางส่วนทันที ดอกเบี้ยที่ค้างถึงวันนี้ต้องชำระพร้อมกัน
              และระบบจะสร้างสัญญาใหม่ตามเงินต้นหลังลด โดยเริ่มนับระยะเวลาใหม่ตามสัญญาเดิม
            </p>
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="w-full bg-primary text-white rounded-full py-3 font-bold hover:bg-primary/80 transition-colors"
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 px-4 pt-2 pb-12 overflow-y-auto">
        {error && (
          <div className="w-full max-w-sm bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Contract Info */}
        <div className="bg-background rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-foreground text-sm">ข้อมูลสัญญา</h2>
          </div>
          <DetailRow label="หมายเลขสัญญา" value={contract.contract_number} />
          <DetailRow label="สินค้า" value={`${contract.item?.brand} ${contract.item?.model}`} />
          <DetailRow label="เงินต้นปัจจุบัน" value={`${maxReduction.toLocaleString()} บาท`} />
        </div>

        <div className="bg-background rounded-xl p-4 mb-4">
          <h2 className="font-bold text-foreground mb-3">ระบุจำนวนเงินที่ต้องการลด</h2>
          <div className="mb-4">
            <label className="block text-sm text-foreground-subtle mb-2">จำนวนเงินต้นที่ต้องการลด (บาท)</label>
            <input
              type="number"
              value={reductionAmount}
              onChange={(e) => setReductionAmount(e.target.value)}
              placeholder="เช่น 2000"
              min="1"
              max={maxReduction}
              className="w-full px-4 py-3 bg-background-white border border-primary-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background-white text-lg font-semibold text-center"
            />
            <p className="text-xs text-foreground-subtle mt-2 text-center">
              ลดได้สูงสุด {maxReduction.toLocaleString()} บาท
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            {[1000, 2000, 5000, 10000].map((amount) => (
              <button
                key={amount}
                onClick={() => setReductionAmount(Math.min(amount, maxReduction).toString())}
                disabled={amount > maxReduction}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  amount <= maxReduction
                    ? 'bg-primary-soft text-primary hover:bg-primary-border'
                    : 'bg-primary-soft text-foreground-subtle cursor-not-allowed'
                }`}
              >
                {amount.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {calculation && (
          <div className="bg-background rounded-xl p-4 mb-4">
            <h2 className="font-bold text-foreground text-sm mb-3">รายการที่ต้องชำระ</h2>
          <p className="text-xs text-foreground-subtle mb-3">
            การลดเงินต้นคือการชำระเงินต้นบางส่วน เพื่อให้ดอกเบี้ยที่เหลือลดลง
            โดยสัญญาใหม่จะเริ่มนับระยะเวลาใหม่ตามสัญญาเดิม
          </p>
          <div className="bg-primary-soft rounded-lg p-4 mb-3">
            <DetailRow label="จำนวนที่ต้องการลด" value={`${calculation.reductionAmount.toLocaleString()} บาท`} />
            <DetailRow label="ดอกเบี้ยถึงวันนี้" value={`${interestAccruedOnly.toLocaleString()} บาท`} />
            <DetailRow label="ค่าธรรมเนียมคงที่" value={`${feeAmount.toLocaleString()} บาท`} />
            {penaltyAmount > 0 && (
              <>
                <DetailRow label="ค่าปรับเกินกำหนด" value={`${penaltyAmount.toLocaleString()} บาท`} highlight />
                <p className="text-xs text-primary mt-1">
                  เกินกำหนดแล้ว {calculation.penalty?.daysOverdue || 0} วัน คิดวันละ 100 บาท
                </p>
              </>
            )}
            <DetailRow label="ดอกเบี้ยในสัญญาใหม่" value={`${interestRemaining.toLocaleString()} บาท`} />
            <DetailRow label="ดอกเบี้ยตามสัญญาเดิม" value={`${originalTotalInterest.toLocaleString()} บาท`} />
            <DetailRow label="ดอกเบี้ยรวมหลังทำรายการ" value={`${totalInterestAfterAction.toLocaleString()} บาท`} />
            <div className="border-t border-primary-border my-2"></div>
            <DetailRow label="เงินต้นหลังลด" value={`${calculation.principalAfterReduction.toLocaleString()} บาท`} highlight />
            <DetailRow label="ดอกเบี้ยที่ประหยัด" value={`${calculation.interestSavings.toLocaleString()} บาท`} highlight />
          </div>
          <div className="bg-amber-50 rounded-lg p-3 mb-3 border border-amber-200">
            <h3 className="font-bold text-amber-800 text-sm mb-2">การชำระดอกเบี้ย</h3>
            <p className="text-xs text-amber-800">
              ต้องชำระดอกเบี้ยที่เกิดขึ้นถึงวันนี้ (รวมค่าธรรมเนียม) ทันที
              และระบบจะเริ่มสัญญาใหม่ตามเงินต้นหลังลด
            </p>
          </div>
          <div className="bg-primary rounded-lg p-4 text-white">
            <div className="flex justify-between items-center">
              <span className="text-sm">ยอดที่ต้องชำระ</span>
              <span className="text-2xl font-bold">{Number(calculation.totalToPay || 0).toLocaleString()} บาท</span>
            </div>
          </div>
          </div>
        )}

        {/* Bank Info */}
        {companyBank && (
          <div className="bg-background rounded-xl p-4 mb-4">
            <h2 className="font-bold text-foreground text-sm mb-3">รายละเอียดการโอนเงิน</h2>
            <div className="bg-primary-soft rounded-lg p-4 border border-primary-border">
              <DetailRow label="ธนาคาร" value={companyBank.bank_name} />
              <DetailRow label="เลขบัญชี" value={companyBank.bank_account_no} highlight />
              <DetailRow label="ชื่อบัญชี" value={companyBank.bank_account_name} />
              {companyBank.promptpay_number && (
                <DetailRow label="PromptPay" value={companyBank.promptpay_number} highlight />
              )}
            </div>
          </div>
        )}

        {/* Warning */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-red-700 text-sm mb-2">ข้อควรระวัง</h3>
              <ul className="text-xs text-red-600 space-y-1 list-disc list-inside">
                <li>กรุณาตรวจสอบยอดเงินให้ถูกต้องก่อนโอน</li>
                <li>หากโอนเงินเกินยอดที่กำหนด ทางเราจะไม่รับผิดชอบ</li>
                <li>หากโอนเงินขาดไม่ตรงตามจำนวน การลดเงินต้นจะเป็นโมฆะ</li>
                <li>ทาง Pawnly จะไม่รับผิดชอบความผิดพลาดที่เกิดจากผู้ใช้งาน</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-background rounded-xl p-4 mb-4">
          <h3 className="font-bold text-foreground mb-3">ลายเซ็นผู้ขอสินเชื่อ</h3>

          {signature ? (
            <div className="space-y-3">
              <div className="border-2 border-primary rounded-xl p-2 bg-background-white">
                <img
                  src={signature}
                  alt="Signature"
                  className="w-full h-32 object-contain"
                />
              </div>
              <button
                onClick={() => setShowSignatureModal(true)}
                className="w-full py-3 bg-background-white text-primary rounded-full font-medium border border-primary hover:bg-primary transition-colors"
              >
                เซ็นใหม่
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSignatureModal(true)}
              className="w-full py-4 border-2 border-dashed border-primary rounded-full text-primary font-medium hover:bg-primary-soft transition-colors"
            >
              แตะเพื่อเซ็นลายเซ็น
            </button>
          )}
        </div>

        {/* Terms Acceptance */}
        <div className="bg-background-white rounded-xl p-4 mb-4">
          <h2 className="font-bold text-foreground text-sm mb-3">ข้อตกลงและเงื่อนไข</h2>
          <label className="checkbox flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="sr-only"
            />
            <span aria-hidden="true" className="mt-0.5" />
            <div className="text-sm text-foreground-muted">
              ข้าพเจ้ารับทราบและยอมรับว่าหากโอนเงินเกินหรือขาดไม่ตรงตามจำนวน ทาง Pawnly จะไม่รับผิดชอบใดๆ ทั้งสิ้น และการดำเนินการอาจถูกยกเลิก ข้าพเจ้าได้ตรวจสอบยอดเงินและข้อมูลการโอนเงินเรียบร้อยแล้ว
            </div>
          </label>
        </div>

      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background-white/10 backdrop-blur-md border-t border-background-white/50">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleProceedToPayment}
            disabled={
              !acceptedTerms ||
              !signature ||
              submitting ||
              !calculation ||
              Number(reductionAmount) <= 0 ||
              Number(reductionAmount) > maxReduction
            }
            className={`w-full py-2 rounded-full flex flex-col items-center justify-center transition-all ${
              acceptedTerms &&
              !!signature &&
              !submitting &&
              !!calculation &&
              Number(reductionAmount) > 0 &&
              Number(reductionAmount) <= maxReduction
                ? 'btn-transition btn-sheen bg-[image:var(--background-image-grad-primary)] hover:bg-primary/80 text-white'
                : 'bg-background-subtle text-foreground-subtle cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <span className="text-md font-medium">กำลังส่ง...</span>
            ) : (
              <>
                <span className="text-md font-medium">ดำเนินการต่อ</span>
                <span className="text-xs font-light opacity-80">Proceed to payment</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
