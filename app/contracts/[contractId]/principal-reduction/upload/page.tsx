'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ChevronLeft, Upload, X, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';

interface CompanyBank {
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  promptpay_number: string;
}

export default function PrincipalReductionUploadPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const requestId = searchParams.get('requestId');
  const { profile } = useLiff();

  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [showVoided, setShowVoided] = useState(false);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [companyBank, setCompanyBank] = useState<CompanyBank | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (requestId) {
      fetchRequestDetails();
    }
    fetchCompanyBank();
  }, [requestId]);

  const fetchRequestDetails = async () => {
    try {
      const response = await axios.get(`/api/contract-actions/${requestId}`);
      if (response.data.success) {
        setRequestDetails(response.data.request);
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

    setUploading(true);

    try {
      // Upload slip to S3
      const formData = new FormData();
      formData.append('file', slipFile);
      formData.append('folder', 'contract-action-slips');

      const uploadRes = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!uploadRes.data.url) {
        throw new Error('Failed to upload slip');
      }

      // Verify slip with AI
      const response = await axios.post('/api/contract-actions/verify-slip', {
        requestId,
        slipUrl: uploadRes.data.url,
        pawnerLineId: profile?.userId,
      });

      const result = response.data;
      setVerificationResult(result);

      if (result.success) {
        // Success - redirect to sign page
        router.push(`/contracts/${contractId}/principal-reduction/sign?requestId=${requestId}`);
      } else if (result.result === 'VOIDED') {
        setShowVoided(true);
      } else if (result.result === 'UNDERPAID') {
        setShowRetry(true);
        handleRemoveImage();
      } else {
        // Other errors - allow retry
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

  const handleRetry = () => {
    setSlipImage(null);
    setSlipFile(null);
    setVerificationResult(null);
    setShowRetry(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const requiredAmount = verificationResult?.expectedAmount ?? requestDetails?.total_amount;

  if (showVoided) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-red-500" />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-2">การดำเนินการเป็นโมฆะ</h1>
          <p className="text-gray-500 text-sm mb-6">
            ยอดเงินที่โอนไม่ถูกต้องถึง 2 ครั้ง<br />
            กรุณาติดต่อฝ่ายสนับสนุน
          </p>

          <button
            onClick={() => router.push('/contracts')}
            className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center shadow-sm sticky top-0 z-10">
        <ChevronLeft
          className="w-6 h-6 text-gray-800 cursor-pointer"
          onClick={() => router.back()}
        />
        <div className="flex-1 text-center">
          <h1 className="font-bold text-lg text-gray-800">ส่งหลักฐานการชำระเงิน</h1>
          <p className="text-xs text-gray-400">Upload payment slip</p>
        </div>
        <div className="w-6"></div>
      </div>

      <div className="flex-1 flex flex-col items-center p-6 pb-32 overflow-y-auto">
        {/* Payment Summary */}
        {requestDetails && (
          <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-6 shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600 text-sm">ยอดชำระ:</span>
              <span className="font-bold text-[#B85C38] text-lg">
                {requestDetails.total_amount?.toLocaleString()} บาท
              </span>
            </div>
            <p className="text-xs text-gray-500">
              ลดเงินต้น {requestDetails.reduction_amount?.toLocaleString()} บาท
            </p>
          </div>
        )}

        {/* Retry Warning */}
        {showRetry && (
          <div className="w-full max-w-sm bg-red-50 rounded-2xl p-4 mb-4 border border-red-200">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-red-700 text-sm mb-1">ยอดเงินไม่ครบ!</h3>
                <p className="text-red-600 text-xs mb-2">
                  กรุณาโอนใหม่เต็มจำนวน {requiredAmount?.toLocaleString()} บาท
                </p>
                <p className="text-red-600 text-xs">
                  หากมีปัญหา กรุณาติดต่อฝ่าย Support โทร 0626092941
                </p>
              </div>
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
            className={`bg-white rounded-3xl p-4 h-64 mb-6 shadow-sm flex flex-col items-center justify-center border-2 border-dashed transition-all cursor-pointer ${
              slipImage ? 'border-[#B85C38]' : 'border-gray-300 hover:border-[#B85C38]'
            }`}
          >
            {slipImage ? (
              <div className="relative w-full h-full">
                <img
                  src={slipImage}
                  alt="Slip Preview"
                  className="w-full h-full object-contain rounded-2xl"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveImage();
                  }}
                  className="absolute top-2 right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center shadow-lg"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 mb-4 text-gray-400">
                  <Upload className="w-full h-full" />
                </div>
                <span className="text-gray-600 font-medium">แตะเพื่ออัปโหลดสลิป</span>
                <span className="text-xs text-gray-400 mt-1">Tap to upload slip</span>
              </div>
            )}
          </div>

          {/* Remove Button */}
          {slipImage && !showRetry && (
            <button
              onClick={handleRemoveImage}
              className="w-full bg-[#F2E8E3] border border-[#B85C38] hover:bg-[#EBDDD5] text-[#B85C38] rounded-2xl py-3 flex flex-col items-center justify-center mb-8 transition-colors active:scale-[0.98]"
            >
              <span className="text-base font-bold">ลบ</span>
              <span className="text-[10px] font-light opacity-80">Remove</span>
            </button>
          )}

          {/* Retry Button */}
          {showRetry && (
            <button
              onClick={handleRetry}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-2xl py-3 flex flex-col items-center justify-center mb-8 transition-colors active:scale-[0.98]"
            >
              <span className="text-base font-bold">อัปโหลดสลิปใหม่</span>
              <span className="text-[10px] font-light opacity-80">Upload new slip</span>
            </button>
          )}

          {/* Instructions */}
          <div className="bg-[#FFF8F5] rounded-2xl p-4 mb-6">
            <h3 className="font-bold text-gray-800 text-sm mb-2">คำแนะนำ:</h3>
            <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
              <li>ถ่ายภาพสลิปให้ชัดเจน เห็นยอดเงินและวันที่</li>
              <li>ตรวจสอบยอดเงินให้ตรงกับที่ระบุ</li>
              <li>หากยอดไม่ตรง การลดเงินต้นจะถูกระงับ</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F2]">
        <div className="max-w-sm mx-auto">
          <button
            onClick={handleSubmit}
            disabled={!slipImage || uploading}
            className={`w-full py-4 rounded-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-[0.98] ${
              slipImage && !uploading
                ? 'bg-[#B85C38] hover:bg-[#A04D2D] text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {uploading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <span className="text-lg font-bold">ส่ง</span>
                <span className="text-xs font-light opacity-80">Submit</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
