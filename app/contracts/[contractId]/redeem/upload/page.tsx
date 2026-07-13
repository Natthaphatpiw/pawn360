'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { CheckCircle, Upload } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import TransactionHeader from '../../_components/TransactionHeader';
import { getMockRedemption, isPreviewMode, withPreview } from '../../_lib/preview';

export default function RedemptionUploadPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const redemptionId = searchParams.get('redemptionId');
  const previewMode = isPreviewMode(searchParams);
  const previewDeliveryMethod = searchParams.get('deliveryMethod');

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
  const penaltyAmount = Number(redemptionDetails?.penalty_amount || redemptionDetails?.payment_breakdown?.penaltyAmount || 0);
  const overdueInterestAmount = Number(redemptionDetails?.overdue_interest_amount || redemptionDetails?.payment_breakdown?.overdueInterestAmount || 0);
  const baseAmount = Number(redemptionDetails?.base_amount || redemptionDetails?.payment_breakdown?.baseAmount || 0);
  const receiptRedemptionId = redemptionId || `preview-redeem-${contractId}`;
  const returnReceiptPath = previewMode
    ? `${withPreview(`/contracts/${contractId}/return-receipt`, 'redemptionId', receiptRedemptionId)}${redemptionDetails?.delivery_method ? `&deliveryMethod=${encodeURIComponent(String(redemptionDetails.delivery_method))}` : ''}`
    : `/contracts/${contractId}/return-receipt?redemptionId=${encodeURIComponent(receiptRedemptionId)}`;

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (previewMode) {
      setRedemptionDetails(getMockRedemption(redemptionId || `preview-redeem-${contractId}`, contractId, previewDeliveryMethod || undefined));
    } else if (redemptionId) {
      fetchRedemptionDetails();
    }
  }, [redemptionId, previewMode, contractId, previewDeliveryMethod]);

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

    if (previewMode) {
      setUploading(true);
      setTimeout(() => {
        setShowSuccess(true);
        setUploading(false);
      }, 400);
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

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-background-white font-sans flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl bg-background-white p-8 text-center">
          <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-24 h-24 text-green-500" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">ส่งหลักฐานการชำระเงินแล้ว</h1>
          <p className="text-sm text-foreground-subtle mb-6">ระบบบันทึกคำขอไถ่ถอนเรียบร้อยแล้ว กรุณารอจุดรับฝากดำเนินการส่งคืนสินค้า</p>
          <button
            onClick={() => router.replace(returnReceiptPath)}
            className="w-full rounded-full bg-primary py-4 font-medium text-white"
          >
            ดูใบรับของ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-white font-sans flex flex-col">

      {/* Header */}
      <TransactionHeader title="ส่งหลักฐานการชำระเงิน" subtitle="Upload Payment Slip" />

      <div className="flex-1 flex flex-col items-center p-4 pb-20">

        {/* Payment Summary */}
        {redemptionDetails && (
          <div className="w-full max-w-sm bg-background rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-foreground-subtle text-sm">ยอดหลักของรายการ:</span>
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
            {overdueInterestAmount > 0 && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-foreground-subtle text-sm">ดอกเบี้ยเลท (3%/เดือน):</span>
                <span className="font-medium text-primary">
                  {overdueInterestAmount.toLocaleString()} บาท
                </span>
              </div>
            )}
            <div className="flex justify-between items-center mb-2">
              <span className="text-foreground-subtle text-sm">ยอดชำระ:</span>
              <span className="font-bold text-primary text-lg">
                {redemptionDetails.total_amount?.toLocaleString()} บาท
              </span>
            </div>
            <p className="text-xs text-foreground-subtle">
              {redemptionDetails.contract?.items?.brand} {redemptionDetails.contract?.items?.model}
            </p>
          </div>
        )}

        <div className="w-full max-w-sm bg-background rounded-xl p-4 mb-4">
          <div className="text-sm font-bold text-foreground mb-2">ข้อมูลบัญชีรับเงิน</div>
          <div className="text-sm text-foreground-subtle space-y-1">
            <p>ธนาคาร: <span className="font-semibold text-foreground">{companyBank.bank_name}</span></p>
            <p>เลขบัญชี/พร้อมเพย์: <span className="font-semibold text-primary">{companyBank.promptpay_number || companyBank.bank_account_no}</span></p>
            <p>ชื่อบัญชี: <span className="font-semibold text-foreground">{companyBank.bank_account_name}</span></p>
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
