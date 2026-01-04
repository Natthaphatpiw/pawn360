'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChevronLeft, Upload, X, AlertTriangle, CheckCircle, Wallet } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';

export default function InvestorPrincipalIncreaseUploadPage() {
  const router = useRouter();
  const params = useParams();
  const requestId = params.requestId as string;
  const { profile } = useLiff();

  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [showVoided, setShowVoided] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (requestId) {
      fetchRequestDetails();
    }
  }, [requestId]);

  const fetchRequestDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/contract-actions/${requestId}`);
      if (response.data.success) {
        setRequestDetails(response.data.request);
      }
    } catch (error) {
      console.error('Error fetching request:', error);
    } finally {
      setLoading(false);
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
    if (!slipFile || !requestId) {
      alert('กรุณาอัพโหลดสลิปการโอนเงิน');
      return;
    }

    setUploading(true);
    setVerificationResult(null);

    try {
      // Upload slip to S3
      const formData = new FormData();
      formData.append('file', slipFile);
      formData.append('folder', 'investor-slips');

      const uploadRes = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!uploadRes.data.url) {
        throw new Error('Failed to upload slip');
      }

      // Verify slip with AI (investor side)
      const verifyRes = await axios.post('/api/contract-actions/investor-verify-slip', {
        requestId,
        slipUrl: uploadRes.data.url,
        investorLineId: profile?.userId,
      });

      setVerificationResult(verifyRes.data);

      if (verifyRes.data.success) {
        setShowSuccess(true);
      } else if (verifyRes.data.result === 'VOIDED') {
        setShowVoided(true);
      } else if (verifyRes.data.result === 'UNDERPAID') {
        setShowRetry(true);
        handleRemoveImage();
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

  const handleGoToContracts = () => {
    router.push('/investor/contracts');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] font-sans flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A]"></div>
      </div>
    );
  }

  const requiredAmount = verificationResult?.expectedAmount ?? requestDetails?.increase_amount;

  // Show voided state
  if (showVoided) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-red-500" />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-2">การดำเนินการเป็นโมฆะ</h1>
          <p className="text-gray-500 text-sm mb-6">
            เนื่องจากโอนเงินไม่ตรงตามจำนวนถึง 2 ครั้ง
          </p>

          <div className="bg-red-50 rounded-2xl p-4 mb-6">
            <p className="text-sm text-red-700">
              กรุณาติดต่อฝ่าย Support<br />
              <span className="font-bold text-lg">โทร: 0626092941</span>
            </p>
          </div>

          <button
            onClick={handleGoToContracts}
            className="w-full bg-[#1E3A8A] hover:bg-[#1E40AF] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  // Show success state
  if (showSuccess) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-2">โอนเงินสำเร็จ</h1>
          <p className="text-gray-500 text-sm mb-6">
            ระบบได้ส่งการแจ้งเตือนไปยังผู้จำนำให้ยืนยันการรับเงินแล้ว
          </p>

          {requestDetails && (
            <div className="bg-[#EFF6FF] rounded-2xl p-4 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">จำนวนเงิน:</span>
                  <span className="font-bold text-[#1E3A8A]">
                    {requestDetails.increase_amount?.toLocaleString()} บาท
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">โอนไปยัง:</span>
                  <span className="font-bold">{requestDetails.pawner_bank_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">เลขบัญชี:</span>
                  <span className="font-bold">{requestDetails.pawner_bank_account_no}</span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleGoToContracts}
            className="w-full bg-[#1E3A8A] hover:bg-[#1E40AF] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  const contract = requestDetails?.contract;
  const pawner = contract?.pawners;

  return (
    <div className="min-h-screen bg-[#F0F4F8] font-sans flex flex-col">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center shadow-sm sticky top-0 z-10">
        <ChevronLeft
          className="w-6 h-6 text-gray-800 cursor-pointer"
          onClick={() => router.back()}
        />
        <div className="flex-1 text-center">
          <h1 className="font-bold text-lg text-gray-800">อัปโหลดสลิปโอนเงิน</h1>
          <p className="text-xs text-gray-400">Upload Transfer Slip</p>
        </div>
        <div className="w-6"></div>
      </div>

      <div className="flex-1 flex flex-col items-center p-6">
        {/* Retry Warning */}
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

        {/* Transfer Info */}
        {requestDetails && (
          <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#1E3A8A]" />
              โอนเงินไปที่
            </h3>

            <div className="bg-[#EFF6FF] rounded-xl p-3 border border-[#BFDBFE] mb-3">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">ธนาคาร:</span>
                  <span className="font-bold">{requestDetails.pawner_bank_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">เลขบัญชี:</span>
                  <span className="font-bold text-[#1E3A8A]">{requestDetails.pawner_bank_account_no}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">ชื่อบัญชี:</span>
                  <span className="font-bold">{requestDetails.pawner_bank_account_name}</span>
                </div>
              </div>
            </div>

            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-sm text-green-700">
                จำนวนเงินที่ต้องโอน
              </p>
              <p className="text-2xl font-bold text-green-700">
                {requestDetails.increase_amount?.toLocaleString()} บาท
              </p>
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
            className={`bg-white rounded-3xl p-4 h-72 mb-6 shadow-sm flex flex-col items-center justify-center border-2 border-dashed transition-all cursor-pointer ${
              slipImage ? 'border-[#1E3A8A]' : 'border-gray-300 hover:border-[#1E3A8A]'
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
          {slipImage && (
            <button
              onClick={handleRemoveImage}
              className="w-full bg-[#EFF6FF] border border-[#1E3A8A] hover:bg-[#DBEAFE] text-[#1E3A8A] rounded-2xl py-3 flex flex-col items-center justify-center mb-8 transition-colors active:scale-[0.98]"
            >
              <span className="text-base font-bold">ลบ</span>
              <span className="text-[10px] font-light opacity-80">Remove</span>
            </button>
          )}

          {/* Instructions */}
          <div className="bg-[#EFF6FF] rounded-2xl p-4 mb-6">
            <h3 className="font-bold text-gray-800 text-sm mb-2">คำแนะนำ:</h3>
            <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
              <li>ถ่ายภาพสลิปให้ชัดเจน เห็นยอดเงินและวันที่</li>
              <li>ตรวจสอบยอดเงินให้ตรงกับที่ระบุ</li>
              <li>ระบบจะตรวจสอบสลิปอัตโนมัติ</li>
              <li>หากยอดไม่ตรง คุณมีโอกาสโอนเพิ่มได้ 1 ครั้ง</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F0F4F8]">
        <div className="max-w-sm mx-auto">
          <button
            onClick={handleSubmit}
            disabled={!slipImage || uploading}
            className={`w-full py-4 rounded-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-[0.98] ${
              slipImage && !uploading
                ? 'bg-[#1E3A8A] hover:bg-[#1E40AF] text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mb-1"></div>
                <span className="text-xs">กำลังตรวจสอบสลิป...</span>
              </>
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
