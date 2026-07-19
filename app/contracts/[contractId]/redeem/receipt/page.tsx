'use client';

import React, { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Upload, X, CheckCircle } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import TransactionHeader from '../../_components/TransactionHeader';
import { isPreviewMode } from '../../_lib/preview';

export default function RedemptionReceiptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redemptionId = searchParams.get('redemptionId');
  const previewMode = isPreviewMode(searchParams);

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

    if (previewMode) {
      setUploading(true);
      setTimeout(() => {
        setSubmitted(true);
        setUploading(false);
      }, 400);
      return;
    }

    setUploading(true);

    try {
      // Upload images to Vercel Blob
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
      <div className="min-h-screen bg-background-white font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-background-white rounded-xl p-8 text-center max-w-sm w-full">
          <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-24 h-24 text-green-500" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2">การไถ่ถอนเสร็จสิ้น!</h1>
          <p className="text-foreground-subtle text-sm mb-6">
            ขอบคุณที่ใช้บริการ Pawnly<br />
            หากมีปัญหาใดๆ สามารถติดต่อได้ที่ 062-6092941
          </p>

          <button
            onClick={() => router.push('/contracts')}
            className="w-full bg-primary hover:bg-primary/80 text-white rounded-full py-4 font-medium transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-white font-sans flex flex-col">
      {/* Header */}
      <TransactionHeader title="ส่งหลักฐานการได้รับสินค้า" subtitle="Upload Item Receipt Photos" />

      <div className="flex-1 flex flex-col items-center p-6">
        {/* Instructions */}
        <div className="w-full max-w-sm bg-primary-soft rounded-xl p-4 mb-6 border border-primary-border">
          <h3 className="font-bold text-foreground text-sm mb-2">คำแนะนำ:</h3>
          <ul className="text-xs text-foreground space-y-1 list-disc list-inside">
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
              className="bg-background-white rounded-xl p-4 h-64 mb-6 flex flex-col items-center justify-center border-2 border-dashed border-primary-border hover:border-primary transition-all cursor-pointer"
            >
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 mb-4 text-foreground-subtle">
                  <Upload className="w-full h-full" />
                </div>
                <span className="text-foreground-subtle font-medium">แตะเพื่ออัปโหลดรูป</span>
                <span className="text-xs text-foreground-subtle mt-1">Tap to upload photos</span>
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
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ))}
                {receiptImages.length < 6 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-primary-border rounded-lg h-24 flex items-center justify-center text-primary"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none"><path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M11 20a1 1 0 1 0 2 0v-7h7a1 1 0 1 0 0-2h-7V4a1 1 0 1 0-2 0v7H4a1 1 0 1 0 0 2h7z"/></g></svg>
                  </button>
                )}
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-background-white border border-primary hover:bg-primary-hover text-primary rounded-full py-2 flex flex-col items-center justify-center mb-4 transition-colors"
              >
                <span className="text-base font-medium">เพิ่มรูปภาพ</span>
                <span className="text-xs font-light opacity-80">Add more photos</span>
              </button>
            </div>
          )}

          {/* Support Contact */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-xs text-foreground-subtle text-center">
              หากมีปัญหาในการใช้งาน สามารถติดต่อฝ่ายสนับสนุนได้ที่<br />
              <span className="font-bold text-primary">062-6092941</span>
            </p>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background-white/10 backdrop-blur-md border-t border-background-white/50">
        <div className="max-w-sm mx-auto">
          <button
            onClick={handleSubmit}
            disabled={!receiptImages.length || uploading}
            className={`w-full py-2 rounded-full flex flex-col items-center justify-center transition-all ${
              receiptImages.length && !uploading
                ? 'bg-primary hover:bg-primary/80 text-white'
                : 'bg-background-subtle text-foreground-subtle cursor-not-allowed'
            }`}
          >
            {uploading ? (
              <span className="text-md font-medium">กำลังส่ง...</span>
            ) : (
              <>
                <span className="text-md font-medium">ยืนยันการได้รับสินค้า</span>
                <span className="text-xs font-light opacity-80">Confirm item receipt</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
