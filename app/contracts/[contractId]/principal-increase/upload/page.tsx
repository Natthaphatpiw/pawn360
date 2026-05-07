'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Upload, X, AlertTriangle, CheckCircle } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import TransactionHeader from '../../_components/TransactionHeader';
import { getMockPrincipalIncreaseRequest, isPreviewMode, withPreview } from '../../_lib/preview';

interface CompanyBank {
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  promptpay_number: string;
}

export default function PrincipalIncreaseUploadPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const requestId = searchParams.get('requestId');
  const previewMode = isPreviewMode(searchParams);
  const { profile } = useLiff();

  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [showVoided, setShowVoided] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [companyBank, setCompanyBank] = useState<CompanyBank | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (previewMode) {
      setRequestDetails(getMockPrincipalIncreaseRequest(requestId || `preview-increase-${contractId}`, contractId));
    } else if (requestId) {
      fetchRequestDetails();
    }
    fetchCompanyBank();
  }, [requestId, previewMode, contractId]);

  const fetchRequestDetails = async () => {
    try {
      const response = await axios.get(`/api/contract-actions/${requestId}`);
      if (response.data.success) {
        const request = response.data.request;
        setRequestDetails(request);

        if (['SLIP_VERIFIED', 'PENDING_INVESTOR_APPROVAL', 'AWAITING_INVESTOR_APPROVAL', 'INVESTOR_APPROVED', 'AWAITING_INVESTOR_PAYMENT', 'INVESTOR_SLIP_UPLOADED', 'INVESTOR_SLIP_VERIFIED', 'INVESTOR_TRANSFERRED', 'AWAITING_PAWNER_CONFIRM'].includes(request?.request_status)) {
          router.replace(`/contracts/${contractId}/principal-increase/waiting?requestId=${requestId}`);
          return;
        }

        if (request?.request_status === 'COMPLETED') {
          router.replace('/contracts');
        }
      }
    } catch (error) {
      console.error('Error fetching request:', error);
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
    if (!slipFile || !requestId) {
      alert('กรุณาอัพโหลดสลิปการโอนเงิน');
      return;
    }

    if (previewMode) {
      setUploading(true);
      setVerificationResult({ success: true, expectedAmount: requestDetails?.total_amount });
      setTimeout(() => {
        setShowSuccess(true);
        setUploading(false);
      }, 400);
      return;
    }

    setUploading(true);
    setVerificationResult(null);

    try {
      const formData = new FormData();
      formData.append('file', slipFile);
      formData.append('folder', 'contract-action-slips');

      const uploadRes = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!uploadRes.data.url) {
        throw new Error('Failed to upload slip');
      }

      const verifyRes = await axios.post('/api/contract-actions/verify-slip', {
        requestId,
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

  const handleProceed = () => {
    const nextPath = `/contracts/${contractId}/principal-increase/waiting`;
    router.push(previewMode ? withPreview(nextPath, 'requestId', requestId || `preview-increase-${contractId}`) : `${nextPath}?requestId=${requestId}`);
  };

  const requiredAmount = verificationResult?.expectedAmount ?? requestDetails?.total_amount;
  const penaltyAmount = Number(requestDetails?.penalty_amount || requestDetails?.payment_breakdown?.penaltyAmount || 0);
  const baseAmount = Number(requestDetails?.base_amount || requestDetails?.payment_breakdown?.baseAmount || requestDetails?.interest_for_period || 0);

  if (showVoided) {
    return (
      <div className="min-h-screen bg-background-white font-sans flex flex-col items-center justify-center p-4">
        <div className="bg-background-white rounded-xl p-4 text-center max-w-sm w-full">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-red-500" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2">การดำเนินการเป็นโมฆะ</h1>
          <p className="text-foreground-subtle text-sm mb-6">
            เนื่องจากคุณโอนเงินไม่ตรงตามจำนวนถึง 2 ครั้ง
          </p>

          <div className="bg-red-50 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-700">
              กรุณาติดต่อฝ่าย Support<br />
              <span className="font-bold text-lg">โทร: 0626092941</span>
            </p>
          </div>

          <button
            onClick={() => router.push('/contracts')}
            className="w-full bg-primary hover:bg-primary/80 text-white rounded-full py-4 font-bold transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-background-white font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-background-white rounded-xl p-4 text-center max-w-sm w-full">
          <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-24 h-24 text-green-500" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2">ส่งคำขอแล้ว</h1>
          <p className="text-foreground-subtle text-sm mb-6">
            กรุณารอการตอบรับจากนักลงทุน โดยจะมีการแจ้งเตือนผ่าน LINE เมื่อมีการอัปเดตสถานะคำขอของคุณ
          </p>

          <button
            onClick={handleProceed}
            className="w-full bg-primary hover:bg-primary/80 text-white rounded-full py-4 font-medium transition-colors"
          >
            ดูสถานะคำขอ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-white font-sans flex flex-col">
      <TransactionHeader title="ชำระดอกเบี้ยวันนี้" subtitle="Upload Payment Slip" />

      <div className="flex-1 flex flex-col items-center p-4 pb-20 overflow-y-auto">
        {showRetry && (
          <div className="w-full max-w-sm bg-red-50 rounded-xl p-4 mb-4 border border-red-200">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-red-700 text-sm mb-1">ยอดเงินไม่ตรง</h3>
                <p className="text-red-600 text-xs mb-2">
                  กรุณาโอนใหม่เต็มจำนวน {requiredAmount?.toLocaleString()} บาท
                </p>
                <p className="text-red-600 text-xs">
                  หากมีปัญหา กรุณาติดต่อฝ่าย Support โทร 0626092941
                </p>
                <p className="text-xs text-red-500 mt-2">
                  เหลือโอกาสอีก {verificationResult?.remainingAttempts} ครั้ง
                </p>
              </div>
            </div>
          </div>
        )}

        {requestDetails && (
          <div className="w-full max-w-sm bg-background rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-foreground-subtle text-sm">ดอกเบี้ยและค่าธรรมเนียม:</span>
              <span className="font-medium text-foreground">
                {baseAmount.toLocaleString()} บาท
              </span>
            </div>
            {penaltyAmount > 0 && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-foreground-subtle text-sm">ค่าปรับเกินกำหนด:</span>
                <span className="font-medium text-primary">
                  {penaltyAmount.toLocaleString()} บาท
                </span>
              </div>
            )}
            <div className="flex justify-between items-center mb-2">
              <span className="text-foreground-subtle text-sm">ยอดดอกเบี้ยที่ต้องชำระวันนี้:</span>
              <span className="font-bold text-primary text-lg">
                {requestDetails.total_amount?.toLocaleString()} บาท
              </span>
            </div>
            <p className="text-xs text-foreground-subtle">
              เพิ่มเงินต้น {requestDetails.increase_amount?.toLocaleString()} บาท
            </p>
          </div>
        )}

        {companyBank && (
          <div className="w-full max-w-sm bg-background rounded-xl p-4 mb-4">
            <h3 className="font-bold text-foreground text-sm mb-2">โอนเงินไปที่</h3>
            <div className="bg-primary-soft rounded-lg p-3 border border-primary-border">
              <p className="text-sm"><span className="text-foreground-subtle">ธนาคาร:</span> <span className="font-bold">{companyBank.bank_name}</span></p>
              <p className="text-sm"><span className="text-foreground-subtle">เลขบัญชี:</span> <span className="font-bold text-primary">{companyBank.bank_account_no}</span></p>
              <p className="text-sm"><span className="text-foreground-subtle">ชื่อบัญชี:</span> <span className="font-bold">{companyBank.bank_account_name}</span></p>
            </div>
          </div>
        )}

        {/* Upload Area */}
        <div className="w-full max-w-sm">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div
            onClick={() => !slipImage && fileInputRef.current?.click()}
            className={`bg-background rounded-xl h-72 mb-4 flex flex-col items-center justify-center border-2 border-dashed transition-all cursor-pointer ${
              slipImage ? 'border-primary' : 'border-primary-border hover:border-primary'
            }`}
          >
            {slipImage ? (
              <div className="relative w-full h-full">
                <img
                  src={slipImage}
                  alt="Slip Preview"
                  className="w-full h-full object-contain rounded-xl"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 mb-4 text-foreground-subtle">
                  <Upload className="w-full h-full" />
                </div>
                <span className="text-foreground-subtle font-medium">แตะเพื่ออัปโหลดสลิป</span>
                <span className="text-xs text-foreground-subtle mt-1">Tap to upload slip</span>
              </div>
            )}
          </div>

          {/* Remove Button */}
          {slipImage && !showRetry && (
            <button
              onClick={handleRemoveImage}
              className="w-full bg-background-white border border-primary text-primary rounded-full py-2 flex flex-col items-center justify-center mb-4 transition-colors"
            >
              <span className="text-base font-medium">ลบ</span>
              <span className="text-xs font-light opacity-80">Remove</span>
            </button>
          )}

          {/* Instructions */}
          <div className="bg-primary-soft rounded-xl p-4 mb-4 border border-primary-border">
            <h3 className="font-bold text-foreground text-sm mb-2">คำแนะนำ:</h3>
            <ul className="text-xs text-foreground space-y-1 list-disc list-inside">
              <li>ถ่ายภาพสลิปให้ชัดเจน เห็นยอดเงินและวันที่</li>
              <li>ตรวจสอบยอดเงินให้ตรงกับที่ระบุ</li>
              <li>หากยอดไม่ตรง การไถ่ถอนจะถูกระงับ</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background-white/10 backdrop-blur-md border-t border-background-white/50">
        <div className="max-w-sm mx-auto">
          <button
            onClick={handleSubmit}
            disabled={!slipImage || uploading}
            className={`w-full py-2 rounded-full flex flex-col items-center justify-center transition-all ${
              slipImage && !uploading
                ? 'bg-primary hover:bg-primary/80 text-white'
                : 'bg-background-subtle text-foreground-subtle cursor-not-allowed'
            }`}
          >
            {uploading ? (
              <span className="text-md font-medium">กำลังส่ง...</span>
            ) : (
              <>
                <span className="text-md font-medium">ส่ง</span>
                <span className="text-xs font-light opacity-80">Submit</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
