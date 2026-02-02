'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ChevronLeft, Upload, X, CheckCircle } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';

export default function RedemptionUploadPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const redemptionId = searchParams.get('redemptionId');

  const { profile } = useLiff();

  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [redemptionDetails, setRedemptionDetails] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const companyBank = {
    bank_name: 'พร้อมเพย์',
    bank_account_no: '0626092941',
    bank_account_name: 'ณัฐภัทร ต้อยจัตุรัส',
    promptpay_number: '0626092941',
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (redemptionId) {
      fetchRedemptionDetails();
    }
  }, [redemptionId]);

  const fetchRedemptionDetails = async () => {
    try {
      const response = await axios.get(`/api/redemptions/${redemptionId}`);
      if (response.data.success) {
        setRedemptionDetails(response.data.redemption);
        if (response.data.redemption?.payment_slip_url) {
          setShowSuccess(true);
        }
      }
    } catch (error) {
      console.error('Error fetching redemption:', error);
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
    if (!slipFile || !redemptionId) {
      alert('กรุณาอัพโหลดสลิปการโอนเงิน');
      return;
    }

    setUploading(true);

    try {
      // Upload slip to S3
      const formData = new FormData();
      formData.append('file', slipFile);
      formData.append('folder', 'redemption-slips');

      const uploadRes = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!uploadRes.data.url) {
        throw new Error('Failed to upload slip');
      }

      // Update redemption with slip URL
      const response = await axios.post('/api/redemptions/upload-slip', {
        redemptionId,
        slipUrl: uploadRes.data.url,
        pawnerLineId: profile?.userId,
      });

      if (response.data.success) {
        setShowSuccess(true);
      }
    } catch (error: any) {
      console.error('Error uploading slip:', error);
      alert(error.response?.data?.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setUploading(false);
    }
  };

  const handleGoToReceipt = () => {
    router.push(`/contracts/${contractId}/redeem/receipt?redemptionId=${redemptionId}`);
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">ส่งสลิปเรียบร้อย</h1>
          <p className="text-gray-500 text-sm mb-6">
            ระบบได้รับหลักฐานการโอนเงินแล้ว
          </p>
          <button
            onClick={handleGoToReceipt}
            className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            ไปขั้นถัดไป
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

      <div className="flex-1 flex flex-col items-center p-6">

        {/* Payment Summary */}
        {redemptionDetails && (
          <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-6 shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600 text-sm">ยอดชำระ:</span>
              <span className="font-bold text-[#B85C38] text-lg">
                {redemptionDetails.total_amount?.toLocaleString()} บาท
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {redemptionDetails.contract?.items?.brand} {redemptionDetails.contract?.items?.model}
            </p>
          </div>
        )}

        <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-6 shadow-sm">
          <div className="text-sm font-bold text-gray-800 mb-2">ข้อมูลบัญชีรับเงิน</div>
          <div className="text-xs text-gray-600 space-y-1">
            <p>ธนาคาร: <span className="font-semibold text-gray-800">{companyBank.bank_name}</span></p>
            <p>เลขบัญชี/พร้อมเพย์: <span className="font-semibold text-[#B85C38]">{companyBank.promptpay_number || companyBank.bank_account_no}</span></p>
            <p>ชื่อบัญชี: <span className="font-semibold text-gray-800">{companyBank.bank_account_name}</span></p>
          </div>
        </div>

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
          {slipImage && (
            <button
              onClick={handleRemoveImage}
              className="w-full bg-[#F2E8E3] border border-[#B85C38] hover:bg-[#EBDDD5] text-[#B85C38] rounded-2xl py-3 flex flex-col items-center justify-center mb-8 transition-colors active:scale-[0.98]"
            >
              <span className="text-base font-bold">ลบ</span>
              <span className="text-[10px] font-light opacity-80">Remove</span>
            </button>
          )}

          {/* Instructions */}
          <div className="bg-[#FFF8F5] rounded-2xl p-4 mb-6">
            <h3 className="font-bold text-gray-800 text-sm mb-2">คำแนะนำ:</h3>
            <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
              <li>ถ่ายภาพสลิปให้ชัดเจน เห็นยอดเงินและวันที่</li>
              <li>ตรวจสอบยอดเงินให้ตรงกับที่ระบุ</li>
              <li>หากยอดไม่ตรง การไถ่ถอนจะถูกระงับ</li>
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
