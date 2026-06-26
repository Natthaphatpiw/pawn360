'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Upload, X } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import TransactionHeader from '../../_components/TransactionHeader';
import { getMockInterestPaymentRequest, isPreviewMode, withPreview } from '../../_lib/preview';

interface CompanyBank {
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  promptpay_number: string;
}

export default function InterestPaymentUploadPage() {
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
  const [showVoided, setShowVoided] = useState(false);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [companyBank, setCompanyBank] = useState<CompanyBank | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (previewMode) {
      setRequestDetails(getMockInterestPaymentRequest(requestId || `preview-interest-${contractId}`, contractId));
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

        if (request?.request_status === 'AWAITING_SIGNATURE' || request?.request_status === 'SLIP_VERIFIED') {
          router.replace(`/contracts/${contractId}/interest-payment/sign?requestId=${requestId}`);
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
      setTimeout(() => {
        setUploading(false);
        handleProceedToSign();
      }, 400);
      return;
    }

    setUploading(true);

    try {
      // Upload slip to S3
      const formData = new FormData();
      formData.append('file', slipFile);
      formData.append('folder', 'payment-slips');

      const uploadRes = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!uploadRes.data.url) {
        throw new Error('Failed to upload slip');
      }

      // Verify slip with AI
      const verifyRes = await axios.post('/api/contract-actions/verify-slip', {
        requestId,
        slipUrl: uploadRes.data.url,
        pawnerLineId: profile?.userId,
      });

      if (verifyRes.data.success) {
        handleProceedToSign();
      } else if (verifyRes.data.result === 'VOIDED') {
        // Request voided
        setShowVoided(true);
      } else if (verifyRes.data.result === 'UNDERPAID') {
        const nextPath = `/contracts/${contractId}/interest-payment/sign`;
        const params = new URLSearchParams({
          requestId: requestId || '',
          slipStatus: 'invalid',
          expectedAmount: String(verifyRes.data.expectedAmount || requestDetails?.total_amount || 0),
          remainingAttempts: String(verifyRes.data.remainingAttempts ?? 0),
        });
        if (previewMode) {
          params.set('preview', '1');
        }
        router.replace(`${nextPath}?${params.toString()}`);
      } else {
        const nextPath = `/contracts/${contractId}/interest-payment/sign`;
        const params = new URLSearchParams({
          requestId: requestId || '',
          slipStatus: 'invalid',
          expectedAmount: String(verifyRes.data.expectedAmount || requestDetails?.total_amount || 0),
          remainingAttempts: String(verifyRes.data.remainingAttempts ?? 0),
        });
        if (previewMode) {
          params.set('preview', '1');
        }
        router.replace(`${nextPath}?${params.toString()}`);
      }

    } catch (error: any) {
      console.error('Error uploading slip:', error);
      alert(error.response?.data?.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setUploading(false);
    }
  };

  const handleProceedToSign = () => {
    const nextPath = `/contracts/${contractId}/interest-payment/sign`;
    router.replace(previewMode ? withPreview(nextPath, 'requestId', requestId || `preview-interest-${contractId}`) : `${nextPath}?requestId=${requestId}`);
  };

  const handleGoBack = () => {
    router.push('/contracts');
  };

  const penaltyAmount = Number(requestDetails?.penalty_amount || requestDetails?.payment_breakdown?.penaltyAmount || 0);
  const overdueInterestAmount = Number(requestDetails?.overdue_interest_amount || requestDetails?.payment_breakdown?.overdueInterestAmount || 0);
  const baseAmount = Number(requestDetails?.base_amount || requestDetails?.payment_breakdown?.baseAmount || requestDetails?.interest_to_pay || 0);

  // Show voided state
  if (showVoided) {
    return (
      <div className="min-h-screen bg-background-white font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-background-white rounded-lg p-4 text-center max-w-sm w-full">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-red-500" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2">การดำเนินการเป็นโมฆะ</h1>
          <p className="text-foreground-subtle text-sm mb-6">
            เนื่องจากคุณโอนเงินไม่ตรงตามจำนวนถึง 2 ครั้ง
          </p>

          <div className="bg-red-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-700">
              กรุณาติดต่อฝ่าย Support<br />
              <span className="font-bold text-lg">โทร: 0626092941</span>
            </p>
          </div>

          <button
            onClick={handleGoBack}
            className="w-full bg-primary hover:bg-primary/80 text-white rounded-full py-4 font-bold transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-white font-sans flex flex-col pb-20">
      {/* Header */}
      <TransactionHeader title="ส่งหลักฐานการชำระเงิน" subtitle="Upload Payment Slip" />

      <div className="flex-1 flex flex-col items-center p-4">
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

        {/* Payment Summary */}
        {requestDetails && (
          <div className="w-full max-w-sm bg-background rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-foreground-subtle text-sm">ดอกเบี้ยและค่าธรรมเนียม:</span>
              <span className="font-medium text-foreground">{baseAmount.toLocaleString()} บาท</span>
            </div>
            {penaltyAmount > 0 && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-foreground-subtle text-sm">ค่าปรับเกินกำหนด:</span>
                <span className="font-medium text-primary">{penaltyAmount.toLocaleString()} บาท</span>
              </div>
            )}
            {overdueInterestAmount > 0 && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-foreground-subtle text-sm">ดอกเบี้ยเลท (3%/เดือน):</span>
                <span className="font-medium text-primary">{overdueInterestAmount.toLocaleString()} บาท</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-foreground-subtle text-sm">ยอดที่ต้องชำระ:</span>
              <span className="font-bold text-primary text-lg">
                {requestDetails.total_amount?.toLocaleString()} บาท
              </span>
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
                  className="w-full h-full object-contain rounded-lg overflow-hidden"
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
          {slipImage && (
            <button
              onClick={handleRemoveImage}
              className="w-full bg-background-white border border-primary text-primary rounded-full py-2 flex flex-col items-center justify-center mb-4 transition-colors"
            >
              <span className="text-base font-medium">ลบ</span>
              <span className="text-xs font-light opacity-80">Remove</span>
            </button>
          )}

          {/* Instructions */}
          <div className="bg-primary-soft rounded-xl p-4 mb-6 border border-primary-border">
            <h3 className="font-bold text-foreground text-sm mb-2">คำแนะนำ:</h3>
            <ul className="text-xs text-foreground space-y-1 list-disc list-inside">
              <li>ถ่ายภาพสลิปให้ชัดเจน เห็นยอดเงินและวันที่</li>
              <li>ตรวจสอบยอดเงินให้ตรงกับที่ระบุ</li>
              <li>ระบบจะตรวจสอบสลิปอัตโนมัติ</li>
              <li>หากยอดไม่ตรง คุณมีโอกาสโอนเพิ่มได้ 1 ครั้ง</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background-white/10 backdrop-blur-md border-t border-background-white/50">
        <div className="max-w-sm mx-auto">
          <button
            onClick={handleSubmit}
            disabled={!slipImage || uploading}
            className={`w-full py-2 rounded-full flex flex-col items-center justify-center transition-all ${
              slipImage && !uploading
                ? 'btn-transition btn-sheen bg-[image:var(--background-image-grad-primary)] hover:bg-primary/80 text-white'
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
