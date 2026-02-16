'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ChevronLeft, AlertTriangle, Info } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';

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
  principalAfterReduction: number;
  newInterestForRemaining: number;
  interestSavings: number;
  description: string;
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
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const reductionAmount = searchParams.get('amount') || '0';
  const { profile } = useLiff();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [calculation, setCalculation] = useState<Calculation | null>(null);
  const [contract, setContract] = useState<any>(null);
  const [companyBank, setCompanyBank] = useState<CompanyBank | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  useEffect(() => {
    if (contractId && reductionAmount) {
      fetchCalculation();
      fetchCompanyBank();
    }
  }, [contractId, reductionAmount]);

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

  const fetchCalculation = async () => {
    try {
      const response = await axios.post('/api/contract-actions/calculate', {
        contractId,
        actionType: 'PRINCIPAL_REDUCTION',
        amount: parseFloat(reductionAmount),
      });

      if (response.data.success) {
        setCalculation(response.data.calculation);
        setContract(response.data.contract);
      }
    } catch (error: any) {
      if (redirectToPenalty(error?.response?.data)) {
        return;
      }
      console.error('Error fetching calculation:', error);
    } finally {
      setLoading(false);
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

    setSubmitting(true);

    try {
      const response = await axios.post('/api/contract-actions/create', {
        contractId,
        actionType: 'PRINCIPAL_REDUCTION',
        amount: parseFloat(reductionAmount),
        pawnerLineId: profile?.userId,
        termsAccepted: true,
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
      if (redirectToPenalty(error?.response?.data)) {
        return;
      }
      console.error('Error creating request:', error);
      alert(error.response?.data?.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  const DetailRow = ({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) => (
    <div className="flex justify-between items-center py-2">
      <span className="text-gray-600 text-sm">{label}</span>
      <span className={`text-sm font-medium ${highlight ? 'text-[#B85C38] font-bold' : 'text-gray-800'}`}>{value}</span>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#B85C38]"></div>
      </div>
    );
  }

  if (!calculation || !contract) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600">ไม่พบข้อมูลสัญญา</p>
        </div>
      </div>
    );
  }

  const interestFirstPart = calculation.interestFirstPart ?? calculation.interestForPeriod ?? 0;
  const interestRemaining = calculation.interestRemaining ?? calculation.newInterestForRemaining ?? 0;
  const feeAmount = calculation.feeAmount ?? 0;
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const originalTotalInterest = round2(
    calculation.currentPrincipal * calculation.dailyInterestRate * calculation.daysInContract + feeAmount
  );
  const totalInterestAfterAction = round2(interestFirstPart + interestRemaining);
  const totalToPayNow = calculation.reductionAmount + interestFirstPart;

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center shadow-sm sticky top-0 z-10">
        <ChevronLeft
          className="w-6 h-6 text-gray-800 cursor-pointer"
          onClick={() => router.back()}
        />
        <div className="flex-1 text-center">
          <h1 className="font-bold text-lg text-gray-800">ลดเงินต้น</h1>
          <p className="text-xs text-gray-400">Principal Reduction</p>
        </div>
        <button
          type="button"
          onClick={() => setShowInfoModal(true)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          aria-label="ข้อมูลการลดเงินต้น"
        >
          <Info className="w-5 h-5 text-[#B85C38]" />
        </button>
      </div>

      {showInfoModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-xl">
            <h2 className="text-lg font-bold text-gray-800 mb-2">รายละเอียดการลดเงินต้น</h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              การลดเงินต้นคือการชำระเงินต้นบางส่วนทันที ดอกเบี้ยที่ค้างถึงวันนี้ต้องชำระพร้อมกัน
              และระบบจะสร้างสัญญาใหม่ตามเงินต้นหลังลด โดยเริ่มนับระยะเวลาใหม่ตามสัญญาเดิม
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

      <div className="flex-1 px-4 py-6 pb-36 overflow-y-auto">
        {/* Contract Info */}
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-[#B85C38]" />
            <h2 className="font-bold text-gray-800 text-sm">ข้อมูลสัญญา</h2>
          </div>
          <DetailRow label="หมายเลขสัญญา" value={contract.contract_number} />
          <DetailRow label="สินค้า" value={`${contract.item?.brand} ${contract.item?.model}`} />
          <DetailRow label="เงินต้นปัจจุบัน" value={`${calculation.currentPrincipal.toLocaleString()} บาท`} />
        </div>

        {/* Calculation Details */}
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <h2 className="font-bold text-gray-800 text-sm mb-3">รายละเอียดการลดเงินต้น</h2>
          <p className="text-xs text-gray-600 mb-3">
            การลดเงินต้นคือการชำระเงินต้นบางส่วน เพื่อให้ดอกเบี้ยที่เหลือลดลง
            โดยสัญญาใหม่จะเริ่มนับระยะเวลาใหม่ตามสัญญาเดิม
          </p>
          <div className="bg-[#FFF8F5] rounded-xl p-4 mb-3">
            <DetailRow label="จำนวนที่ต้องการลด" value={`${calculation.reductionAmount.toLocaleString()} บาท`} />
            <DetailRow label="ดอกเบี้ยถึงวันนี้ (รวมค่าธรรมเนียม)" value={`${interestFirstPart.toLocaleString()} บาท`} />
            <DetailRow label="ค่าธรรมเนียมคงที่" value={`${feeAmount.toLocaleString()} บาท`} />
            <DetailRow label="ดอกเบี้ยในสัญญาใหม่" value={`${interestRemaining.toLocaleString()} บาท`} />
            <DetailRow label="ดอกเบี้ยตามสัญญาเดิม" value={`${originalTotalInterest.toLocaleString()} บาท`} />
            <DetailRow label="ดอกเบี้ยรวมหลังทำรายการ" value={`${totalInterestAfterAction.toLocaleString()} บาท`} />
            <div className="border-t border-[#F0D4C8] my-2"></div>
            <DetailRow label="เงินต้นหลังลด" value={`${calculation.principalAfterReduction.toLocaleString()} บาท`} highlight />
            <DetailRow label="ดอกเบี้ยที่ประหยัด" value={`${calculation.interestSavings.toLocaleString()} บาท`} highlight />
          </div>
          <div className="bg-amber-50 rounded-xl p-3 mb-3">
            <h3 className="font-bold text-amber-800 text-sm mb-2">การชำระดอกเบี้ย</h3>
            <p className="text-xs text-amber-800">
              ต้องชำระดอกเบี้ยที่เกิดขึ้นถึงวันนี้ (รวมค่าธรรมเนียม) ทันที
              และระบบจะเริ่มสัญญาใหม่ตามเงินต้นหลังลด
            </p>
          </div>
          <div className="bg-[#B85C38] rounded-xl p-4 text-white">
            <div className="flex justify-between items-center">
              <span className="text-sm">ยอดที่ต้องชำระ</span>
              <span className="text-2xl font-bold">{totalToPayNow.toLocaleString()} บาท</span>
            </div>
          </div>
        </div>

        {/* Bank Info */}
        {companyBank && (
          <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <h2 className="font-bold text-gray-800 text-sm mb-3">รายละเอียดการโอนเงิน</h2>
            <div className="bg-[#FFF8F5] rounded-xl p-4 border border-[#F0D4C8]">
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
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
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

        {/* Terms Acceptance */}
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 w-5 h-5 accent-[#B85C38] cursor-pointer"
            />
            <span className="text-sm text-gray-700">
              ข้าพเจ้ารับทราบและยอมรับว่าหากโอนเงินเกินหรือขาดไม่ตรงตามจำนวน ทาง Pawnly จะไม่รับผิดชอบใดๆ ทั้งสิ้น และการดำเนินการอาจถูกยกเลิก ข้าพเจ้าได้ตรวจสอบยอดเงินและข้อมูลการโอนเงินเรียบร้อยแล้ว
            </span>
          </label>
        </div>
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F2] border-t border-gray-200">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleProceedToPayment}
            disabled={!acceptedTerms || submitting}
            className={`w-full py-4 rounded-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-[0.98] ${
              acceptedTerms && !submitting
                ? 'bg-[#B85C38] hover:bg-[#A04D2D] text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <span className="text-base font-bold">ดำเนินการต่อ</span>
                <span className="text-xs font-light opacity-80">Proceed to payment</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
