'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle, ChevronLeft, Upload, X } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';

interface PenaltyInfo {
  contractId: string;
  contractNumber: string;
  contractStartDate: string;
  contractEndDate: string;
  today: string;
  daysOverdue: number;
  penaltyAmount: number;
}

interface CompanyBank {
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  promptpay_number: string;
}

function PenaltyPaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contractId = searchParams.get('contractId') || '';
  const returnTo = searchParams.get('returnTo') || '';
  const { profile } = useLiff();

  const [loading, setLoading] = useState(true);
  const [penaltyInfo, setPenaltyInfo] = useState<PenaltyInfo | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [showVoided, setShowVoided] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [companyBank, setCompanyBank] = useState<CompanyBank | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCompanyBank({
      bank_name: 'พร้อมเพย์',
      bank_account_no: '0626092941',
      bank_account_name: 'ณัฐภัทร ต้อยจัตุรัส',
      promptpay_number: '0626092941',
    });
  }, []);

  useEffect(() => {
    if (!contractId) {
      setLoading(false);
      setErrorMessage('ไม่พบสัญญาที่ต้องชำระค่าปรับ');
      return;
    }
    fetchPenaltyStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, profile?.userId]);

  const fetchPenaltyStatus = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/penalties/status', {
        params: {
          contractId,
          lineId: profile?.userId,
        },
      });

      if (response.data?.penalty) {
        setPenaltyInfo(response.data.penalty);
      }

      if (!response.data?.penaltyRequired) {
        setAlreadyPaid(Boolean(response.data?.alreadyPaid));
        setShowSuccess(Boolean(response.data?.alreadyPaid));
        setLoading(false);
        return;
      }

      if (response.data?.payment?.paymentId) {
        setPaymentId(response.data.payment.paymentId);
        setLoading(false);
        return;
      }

      await createPenaltyPayment();
    } catch (error: any) {
      console.error('Error fetching penalty status:', error);
      setErrorMessage(error.response?.data?.error || 'ไม่สามารถโหลดข้อมูลค่าปรับได้');
    } finally {
      setLoading(false);
    }
  };

  const createPenaltyPayment = async () => {
    try {
      const response = await axios.post('/api/penalties/create', {
        contractId,
        pawnerLineId: profile?.userId,
      });

      if (response.data?.paymentId) {
        setPaymentId(response.data.paymentId);
      }
    } catch (error: any) {
      console.error('Error creating penalty payment:', error);
      setErrorMessage(error.response?.data?.error || 'ไม่สามารถสร้างรายการค่าปรับได้');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSlipFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSlipImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setSlipImage(null);
    setSlipFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!slipFile || !paymentId) {
      alert('กรุณาอัพโหลดสลิปการโอนเงิน');
      return;
    }

    setUploading(true);
    setVerificationResult(null);

    try {
      const formData = new FormData();
      formData.append('file', slipFile);
      formData.append('folder', 'penalty-slips');

      const uploadRes = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!uploadRes.data.url) {
        throw new Error('Failed to upload slip');
      }

      const verifyRes = await axios.post('/api/penalties/verify-slip', {
        penaltyId: paymentId,
        slipUrl: uploadRes.data.url,
        pawnerLineId: profile?.userId,
      });

      setVerificationResult(verifyRes.data);

      if (verifyRes.data.success) {
        setShowSuccess(true);
      } else if (verifyRes.data.result === 'VOIDED') {
        setShowVoided(true);
      } else {
        setShowRetry(true);
        handleRemoveImage();
      }
    } catch (error: any) {
      console.error('Error uploading slip:', error);
      alert(error.response?.data?.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setUploading(false);
    }
  };

  const getSafeReturnTo = () => {
    if (!returnTo) {
      return null;
    }

    try {
      const decoded = decodeURIComponent(returnTo);
      if (decoded.startsWith('/')) {
        return decoded;
      }
    } catch (error) {
      return null;
    }

    return null;
  };

  const handleContinue = () => {
    const nextPath = getSafeReturnTo();
    if (nextPath) {
      router.push(nextPath);
      return;
    }
    router.push('/contracts');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#B85C38]"></div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 text-center shadow-md max-w-sm w-full">
          <h2 className="text-lg font-bold text-gray-800 mb-2">ไม่สามารถโหลดข้อมูล</h2>
          <p className="text-sm text-gray-500 mb-4">{errorMessage}</p>
          <button
            onClick={() => router.back()}
            className="w-full bg-[#B85C38] text-white rounded-xl py-3 font-bold hover:bg-[#A04D2D] transition-colors"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  if (showVoided) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-red-500" />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-2">การดำเนินการเป็นโมฆะ</h1>
          <p className="text-gray-500 text-sm mb-6">
            เนื่องจากคุณโอนเงินไม่ตรงตามจำนวนถึง 2 ครั้ง
          </p>

          <div className="bg-red-50 rounded-2xl p-4 mb-6">
            <p className="text-sm text-red-700">
              กรุณาติดต่อฝ่าย Support<br />
              <span className="font-bold text-lg">โทร: 0626092941</span>
            </p>
          </div>

          <button
            onClick={handleContinue}
            className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            กลับไปหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  if (showSuccess || alreadyPaid) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-2">ชำระค่าปรับสำเร็จ</h1>
          <p className="text-gray-500 text-sm mb-6">
            คุณสามารถกลับไปทำรายการต่อได้ทันที
          </p>

          <button
            onClick={handleContinue}
            className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            ดำเนินการต่อ
          </button>
        </div>
      </div>
    );
  }

  if (!penaltyInfo || penaltyInfo.daysOverdue <= 0) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <h1 className="text-xl font-bold text-gray-800 mb-2">ไม่มีค่าปรับค้างชำระ</h1>
          <p className="text-gray-500 text-sm mb-6">
            คุณสามารถกลับไปทำรายการได้ตามปกติ
          </p>
          <button
            onClick={handleContinue}
            className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            กลับไปหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  const startDateText = new Date(penaltyInfo.contractStartDate).toLocaleDateString('th-TH');
  const endDateText = new Date(penaltyInfo.contractEndDate).toLocaleDateString('th-TH');
  const todayText = new Date(penaltyInfo.today).toLocaleDateString('th-TH');
  const requiredAmount = verificationResult?.expectedAmount ?? penaltyInfo.penaltyAmount;

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col">
      <div className="bg-white px-4 py-3 flex items-center shadow-sm sticky top-0 z-10">
        <ChevronLeft
          className="w-6 h-6 text-gray-800 cursor-pointer"
          onClick={() => router.back()}
        />
        <div className="flex-1 text-center">
          <h1 className="font-bold text-lg text-gray-800">ชำระค่าปรับ</h1>
          <p className="text-xs text-gray-400">Penalty Payment</p>
        </div>
        <div className="w-6"></div>
      </div>

      <div className="flex-1 flex flex-col items-center p-6">
        {showRetry && verificationResult && (
          <div className="w-full max-w-sm bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-red-700 text-sm mb-1">ยอดไม่ตรง</h3>
                <p className="text-xs text-red-600 mb-2">
                  กรุณาโอนใหม่เต็มจำนวน {requiredAmount?.toLocaleString()} บาท
                </p>
                <p className="text-xs text-red-600">
                  หากมีปัญหา กรุณาติดต่อฝ่าย Support โทร 0626092941
                </p>
                <p className="text-xs text-red-500 mt-2">
                  เหลือโอกาสอีก {verificationResult.remainingAttempts} ครั้ง
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-gray-800 text-sm mb-3">รายละเอียดค่าปรับ</h2>
          <p className="text-xs text-gray-600 leading-relaxed mb-3">
            คุณมีสัญญาที่เริ่มต้นวันที่ {startDateText} และสิ้นสุดวันที่ {endDateText}
            วันนี้วันที่ {todayText} ซึ่งเกินกำหนดมาแล้ว {penaltyInfo.daysOverdue} วัน
            ค่าปรับวันละ 100 บาท รวมเป็น {penaltyInfo.penaltyAmount.toLocaleString()} บาท
          </p>
          <div className="bg-[#FFF8F5] rounded-xl p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">วันเกินกำหนด</span>
              <span className="font-medium text-gray-800">{penaltyInfo.daysOverdue} วัน</span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">ค่าปรับ/วัน</span>
              <span className="font-medium text-gray-800">100 บาท</span>
            </div>
            <div className="border-t border-[#F0D4C8] my-2"></div>
            <div className="flex justify-between text-base">
              <span className="font-semibold text-gray-700">ยอดค่าปรับรวม</span>
              <span className="font-bold text-[#B85C38]">{penaltyInfo.penaltyAmount.toLocaleString()} บาท</span>
            </div>
          </div>
        </div>

        {companyBank && (
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-sm mb-4">
            <h2 className="font-bold text-gray-800 text-sm mb-3">รายละเอียดการโอนเงิน</h2>
            <div className="bg-[#FFF8F5] rounded-xl p-4 border border-[#F0D4C8] text-sm text-gray-700">
              <div className="flex justify-between mb-2">
                <span>ธนาคาร</span>
                <span className="font-medium">{companyBank.bank_name}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span>เลขบัญชี</span>
                <span className="font-medium">{companyBank.bank_account_no}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span>ชื่อบัญชี</span>
                <span className="font-medium">{companyBank.bank_account_name}</span>
              </div>
              {companyBank.promptpay_number && (
                <div className="flex justify-between">
                  <span>PromptPay</span>
                  <span className="font-medium">{companyBank.promptpay_number}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-gray-800 text-sm mb-3">อัพโหลดสลิปการโอนเงิน</h2>

          {slipImage ? (
            <div className="relative mb-4">
              <img src={slipImage} alt="Slip" className="w-full rounded-xl border border-gray-200" />
              <button
                type="button"
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center text-gray-500 cursor-pointer mb-4">
              <Upload className="w-8 h-8 mb-2 text-gray-400" />
              <span className="text-sm">แตะเพื่ออัพโหลดสลิป</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          )}

          <button
            onClick={handleSubmit}
            disabled={!slipFile || uploading || !paymentId}
            className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-xl py-3 font-bold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {uploading ? 'กำลังตรวจสอบ...' : 'ยืนยันการชำระค่าปรับ'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#B85C38]"></div>
    </div>
  );
}

export default function PenaltyPaymentPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PenaltyPaymentContent />
    </Suspense>
  );
}
