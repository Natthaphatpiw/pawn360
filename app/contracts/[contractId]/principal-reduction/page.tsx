'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChevronLeft, AlertTriangle, TrendingDown, Calculator } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';

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
  const [contract, setContract] = useState<any>(null);
  const [calculation, setCalculation] = useState<any>(null);
  const [companyBank, setCompanyBank] = useState<CompanyBank | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [reductionAmount, setReductionAmount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchContractDetails();
    fetchCompanyBank();
  }, [contractId]);

  useEffect(() => {
    if (contract && reductionAmount) {
      calculateReduction();
    }
  }, [reductionAmount, contract]);

  const fetchContractDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/contracts/${contractId}`);
      if (response.data.success) {
        setContract(response.data.contract);
      }
    } catch (error) {
      console.error('Error fetching contract:', error);
      setError('ไม่สามารถโหลดข้อมูลสัญญาได้');
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanyBank = async () => {
    setCompanyBank({
      bank_name: 'พร้อมเพย์',
      bank_account_no: '0626092941',
      bank_account_name: 'ณัฐภัทร ต้อยจัตุรัส',
      promptpay_number: '0626092941',
    });
  };

  const calculateReduction = async () => {
    const amount = parseFloat(reductionAmount);
    if (!amount || amount <= 0) {
      setCalculation(null);
      return;
    }

    try {
      const response = await axios.post('/api/contract-actions/calculate', {
        contractId,
        actionType: 'PRINCIPAL_REDUCTION',
        reductionAmount: amount,
      });

      if (response.data.success) {
        setCalculation(response.data.calculation);
        setError(null);
      }
    } catch (error: any) {
      console.error('Error calculating:', error);
      setError(error.response?.data?.error || 'ไม่สามารถคำนวณได้');
      setCalculation(null);
    }
  };

  const handleProceed = async () => {
    if (!termsAccepted || !calculation) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await axios.post('/api/contract-actions/create', {
        contractId,
        actionType: 'PRINCIPAL_REDUCTION',
        reductionAmount: parseFloat(reductionAmount),
        pawnerLineId: profile?.userId,
      });

      if (response.data.success) {
        router.push(`/contracts/${contractId}/principal-reduction/upload?requestId=${response.data.requestId}`);
      } else {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
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

  const currentPrincipal = contract?.current_principal_amount || contract?.principal_amount || 0;

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
          <p className="text-xs text-gray-400">Reduce Principal</p>
        </div>
        <div className="w-6"></div>
      </div>

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
              <TrendingDown className="w-5 h-5 text-[#B85C38]" />
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
              <span className="text-gray-600">อัตราดอกเบี้ย:</span>
              <span className="font-bold">{contract?.interest_rate}% / เดือน</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">วันครบกำหนด:</span>
              <span className="font-bold">
                {new Date(contract?.end_date).toLocaleDateString('th-TH', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Reduction Amount Input */}
        <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-[#B85C38]" />
            ระบุจำนวนเงินที่ต้องการลด
          </h3>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-2">จำนวนเงินต้นที่ต้องการลด (บาท)</label>
            <input
              type="number"
              value={reductionAmount}
              onChange={(e) => setReductionAmount(e.target.value)}
              placeholder="เช่น 5000"
              min="1"
              max={currentPrincipal}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#B85C38] text-lg font-bold text-center"
            />
            <p className="text-xs text-gray-500 mt-2 text-center">
              สามารถลดได้สูงสุด {currentPrincipal.toLocaleString()} บาท
            </p>
          </div>

          {/* Quick Amount Buttons */}
          <div className="flex flex-wrap gap-2 justify-center">
            {[1000, 2000, 5000, 10000].map((amount) => (
              <button
                key={amount}
                onClick={() => setReductionAmount(Math.min(amount, currentPrincipal).toString())}
                disabled={amount > currentPrincipal}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  amount <= currentPrincipal
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
                  <span className="text-gray-600">ดอกเบี้ยสะสม ({calculation.daysElapsed} วัน):</span>
                  <span className="font-bold">{calculation.interestAccrued?.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">จำนวนเงินต้นที่ลด:</span>
                  <span className="font-bold text-green-600">{calculation.reductionAmount?.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[#F0D4C8]">
                  <span className="font-bold text-gray-800">ยอดที่ต้องชำระ:</span>
                  <span className="font-bold text-[#B85C38] text-lg">{calculation.totalToPay?.toLocaleString()} บาท</span>
                </div>
              </div>

              <div className="bg-green-50 rounded-xl p-3">
                <h4 className="font-bold text-green-800 mb-2">ผลลัพธ์หลังลดเงินต้น</h4>
                <div className="flex justify-between mb-1">
                  <span className="text-green-700">เงินต้นใหม่:</span>
                  <span className="font-bold text-green-800">{calculation.newPrincipal?.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-green-700">ดอกเบี้ยต่อเดือนใหม่:</span>
                  <span className="font-bold text-green-800">{calculation.newMonthlyInterest?.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700">ประหยัดดอกเบี้ย/เดือน:</span>
                  <span className="font-bold text-green-600">{calculation.monthlySavings?.toLocaleString()} บาท</span>
                </div>
              </div>

              {/* Interest Comparison */}
              <div className="bg-blue-50 rounded-xl p-3">
                <h4 className="font-bold text-blue-800 mb-2">เปรียบเทียบดอกเบี้ย</h4>
                <div className="text-xs text-blue-700 space-y-1">
                  <p>ดอกเบี้ยเดิม: {(currentPrincipal * (contract?.interest_rate || 0) / 100).toLocaleString()} บาท/เดือน</p>
                  <p>ดอกเบี้ยใหม่: {calculation.newMonthlyInterest?.toLocaleString()} บาท/เดือน</p>
                  <p className="font-bold text-green-600">ประหยัดได้: {calculation.monthlySavings?.toLocaleString()} บาท/เดือน</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bank Info */}
        {companyBank && calculation && (
          <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-3">โอนเงินมาที่</h3>
            <div className="bg-[#FFF8F5] rounded-xl p-3 border border-[#F0D4C8]">
              <p className="text-sm"><span className="text-gray-600">ธนาคาร:</span> <span className="font-bold">{companyBank.bank_name}</span></p>
              <p className="text-sm"><span className="text-gray-600">เลขบัญชี:</span> <span className="font-bold text-[#B85C38]">{companyBank.bank_account_no}</span></p>
              <p className="text-sm"><span className="text-gray-600">ชื่อบัญชี:</span> <span className="font-bold">{companyBank.bank_account_name}</span></p>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              กรุณาโอนเงินจำนวน <span className="font-bold text-[#B85C38]">{calculation.totalToPay?.toLocaleString()} บาท</span>
            </p>
          </div>
        )}

        {/* Warning Section */}
        <div className="w-full max-w-sm bg-red-50 rounded-2xl p-4 mb-4 border border-red-200">
          <h3 className="font-bold text-red-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            คำเตือน
          </h3>
          <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
            <li>การลดเงินต้นไม่สามารถยกเลิกได้หลังจากยืนยัน</li>
            <li>กรุณาตรวจสอบยอดเงินให้ถูกต้องก่อนโอน</li>
            <li>หลังจากลดเงินต้นแล้ว วันครบกำหนดจะยังคงเดิม</li>
            <li>ยอดชำระรวมดอกเบี้ยสะสมจนถึงวันที่ทำรายการ</li>
          </ul>
        </div>

        {/* Terms Acceptance */}
        {calculation && (
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
                และยืนยันว่าจะชำระเงินจำนวน {calculation.totalToPay?.toLocaleString()} บาท
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
            disabled={!termsAccepted || !calculation || submitting}
            className={`w-full py-4 rounded-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-[0.98] ${
              termsAccepted && calculation && !submitting
                ? 'bg-[#B85C38] hover:bg-[#A04D2D] text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <span className="text-lg font-bold">ดำเนินการต่อ</span>
                <span className="text-xs font-light opacity-80">Proceed to Payment</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
