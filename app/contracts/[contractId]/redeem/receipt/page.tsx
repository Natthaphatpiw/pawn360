'use client';

import React, { useState, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ChevronLeft, Upload, X, CheckCircle } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';

export default function RedemptionReceiptPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const redemptionId = searchParams.get('redemptionId');

  const { profile } = useLiff();

  const [receiptImages, setReceiptImages] = useState<string[]>([]);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files);
    const totalImages = receiptImages.length + newFiles.length;

    if (totalImages > 6) {
      alert('สามารถอัปโหลดรูปได้สูงสุด 6 รูป');
      return;
    }

    setReceiptFiles(prev => [...prev, ...newFiles]);
    const newUrls = newFiles.map(file => URL.createObjectURL(file));
    setReceiptImages(prev => [...prev, ...newUrls]);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(receiptImages[index]);
    setReceiptImages(prev => prev.filter((_, i) => i !== index));
    setReceiptFiles(prev => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!redemptionId || receiptFiles.length === 0) {
      alert('กรุณาอัปโหลดรูปภาพการได้รับสินค้า');
      return;
    }

    setUploading(true);

    try {
      // Upload images to S3
      const uploadPromises = receiptFiles.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'redemption-receipts');

        const uploadRes = await axios.post('/api/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        return uploadRes.data.url;
      });

      const uploadedUrls = await Promise.all(uploadPromises);

      // Submit receipt photos
      const response = await axios.post('/api/redemptions/upload-receipt', {
        redemptionId,
        receiptPhotos: uploadedUrls,
        pawnerLineId: profile?.userId,
      });

      if (response.data.success) {
        setSubmitted(true);
      }
    } catch (error: any) {
      console.error('Error uploading receipt:', error);
      alert(error.response?.data?.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setUploading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-2">การไถ่ถอนเสร็จสิ้น!</h1>
          <p className="text-gray-500 text-sm mb-6">
            ขอบคุณที่ใช้บริการ Pawnly<br />
            หากมีปัญหาใดๆ สามารถติดต่อได้ที่ 062-6092941
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
          <h1 className="font-bold text-lg text-gray-800">ส่งหลักฐานการได้รับสินค้า</h1>
          <p className="text-xs text-gray-400">Upload item receipt photos</p>
        </div>
        <div className="w-6"></div>
      </div>

      <div className="flex-1 flex flex-col items-center p-6">
        {/* Instructions */}
        <div className="w-full max-w-sm bg-[#FFF8F5] rounded-2xl p-4 mb-6 border border-[#F0D4C8]">
          <h3 className="font-bold text-gray-800 text-sm mb-2">คำแนะนำ:</h3>
          <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
            <li>ถ่ายรูปสินค้าที่ได้รับคืนให้เห็นชัดเจน</li>
            <li>ถ่ายรูปใบเสร็จหรือเอกสารที่เกี่ยวข้อง (ถ้ามี)</li>
            <li>รูปภาพจะช่วยยืนยันว่าการไถ่ถอนเสร็จสิ้น</li>
          </ul>
        </div>

        {/* Upload Area */}
        <div className="w-full max-w-sm">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            multiple
          />

          {receiptImages.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="bg-white rounded-3xl p-4 h-64 mb-6 shadow-sm flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-[#B85C38] transition-all cursor-pointer"
            >
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 mb-4 text-gray-400">
                  <Upload className="w-full h-full" />
                </div>
                <span className="text-gray-600 font-medium">แตะเพื่ออัปโหลดรูป</span>
                <span className="text-xs text-gray-400 mt-1">Tap to upload photos</span>
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <div className="grid grid-cols-3 gap-2 mb-4">
                {receiptImages.map((url, index) => (
                  <div key={index} className="relative">
                    <img
                      src={url}
                      alt={`Receipt ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-lg"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ))}
                {receiptImages.length < 6 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 rounded-lg h-24 flex items-center justify-center text-gray-400"
                  >
                    +
                  </button>
                )}
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-[#F2E8E3] border border-[#B85C38] hover:bg-[#EBDDD5] text-[#B85C38] rounded-2xl py-3 flex flex-col items-center justify-center mb-4 transition-colors"
              >
                <span className="text-base font-bold">เพิ่มรูปภาพ</span>
                <span className="text-[10px] font-light opacity-80">Add more photos</span>
              </button>
            </div>
          )}

          {/* Support Contact */}
          <div className="bg-gray-50 rounded-2xl p-4 mb-6">
            <p className="text-xs text-gray-600 text-center">
              หากมีปัญหาในการใช้งาน สามารถติดต่อฝ่ายสนับสนุนได้ที่<br />
              <span className="font-bold text-[#B85C38]">062-6092941</span>
            </p>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F2]">
        <div className="max-w-sm mx-auto">
          <button
            onClick={handleSubmit}
            disabled={!receiptImages.length || uploading}
            className={`w-full py-4 rounded-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-[0.98] ${
              receiptImages.length && !uploading
                ? 'bg-[#B85C38] hover:bg-[#A04D2D] text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {uploading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <span className="text-lg font-bold">ยืนยันการได้รับสินค้า</span>
                <span className="text-xs font-light opacity-80">Confirm item receipt</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}