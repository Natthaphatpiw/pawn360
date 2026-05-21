'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Upload, X, AlertTriangle, CheckCircle, Wallet } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import { getInvestorPrincipalIncreaseStatusMeta, getMockPrincipalIncreaseRequest, isInvestorPreviewMode } from '@/lib/mock-investment';
import TransactionHeader from '@/app/contracts/[contractId]/_components/TransactionHeader';

export default function InvestorPrincipalIncreaseUploadPage() {
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

  const handleGoToContracts = () => {
    if (typeof window !== 'undefined') {
      window.location.assign('/investment');
    }
  };

  useEffect(() => {
    if (requestId) {
      fetchRequestDetails();
    }
  }, [requestId]);

  const fetchRequestDetails = async () => {
    try {
      setLoading(true);
      if (isInvestorPreviewMode()) {
        setRequestDetails(getMockPrincipalIncreaseRequest(requestId));
        return;
      }
      const response = await axios.get(`/api/contract-actions/${requestId}?viewer=investor`);
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
      if (isInvestorPreviewMode()) {
        setVerificationResult({
          success: true,
          expectedAmount: requestDetails?.increase_amount || 0,
          result: 'APPROVED',
        });
        setShowSuccess(true);
        return;
      }

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

  if (loading) {
    return (
      <div className="theme-liff theme-investor h-[100dvh] min-h-[100dvh] bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  const requiredAmount = verificationResult?.expectedAmount ?? requestDetails?.increase_amount;
  const requestStatus = requestDetails?.request_status;
  const statusMeta = getInvestorPrincipalIncreaseStatusMeta(requestStatus);
  const contract = requestDetails?.contract;
  const allowedStatuses = [
    'AWAITING_INVESTOR_APPROVAL',
    'INVESTOR_APPROVED',
    'AWAITING_INVESTOR_PAYMENT',
    'INVESTOR_SLIP_REJECTED',
    'PENDING_INVESTOR_APPROVAL',
  ];

  // Show voided state
  if (showVoided) {
    return (
      <div className="theme-liff theme-investor h-[100dvh] min-h-[100dvh] bg-background font-sans flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl bg-background p-8 text-center">
          <div className="w-32 h-32 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <X className="w-24 h-24 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">การดำเนินการเป็นโมฆะ</h1>
          <p className="text-sm text-foreground-subtle mb-6">เนื่องจากโอนเงินไม่ตรงตามจำนวนถึง 2 ครั้ง</p>
          <div className="bg-red-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm text-red-700">
              กรุณาติดต่อฝ่าย Support
            </p>
            <p className="text-lg font-bold text-red-700 mt-1">โทร: 0626092941</p>
          </div>
          <button
            onClick={handleGoToContracts}
            className="w-full rounded-full bg-s2 py-4 font-medium text-white"
          >
            กลับหน้าการลงทุน
          </button>
        </div>
      </div>
    );
  }

  // Show success state
  if (showSuccess) {
    return (
      <div className="theme-liff theme-investor h-[100dvh] min-h-[100dvh] bg-background font-sans flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl bg-background p-8 text-center">
          <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-24 h-24 text-green-500" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">ส่งหลักฐานการโอนเงินแล้ว</h1>
          <p className="text-sm text-foreground-subtle mb-6">ระบบบันทึกการโอนเงินเพิ่มเงินต้นเรียบร้อยแล้ว กรุณารอการยืนยันขั้นตอนถัดไป</p>
          <button
            onClick={handleGoToContracts}
            className="w-full rounded-full bg-s2 py-4 font-medium text-white"
          >
            กลับหน้าการลงทุน
          </button>
        </div>
      </div>
    );
  }

  // Show status message if current request status does not allow slip submission
  if (requestDetails && !allowedStatuses.includes(requestStatus)) {
    const statusMessage = requestStatus === 'COMPLETED' || requestStatus === 'INVESTOR_TRANSFERRED'
      ? 'คำขอนี้ดำเนินการเสร็จแล้ว'
      : requestStatus === 'INVESTOR_SLIP_REJECTED_FINAL' || requestStatus === 'VOIDED'
        ? 'คำขอนี้ถูกยกเลิกแล้ว'
        : 'คำขอนี้อยู่ในสถานะที่ไม่สามารถส่งสลิปได้';

    return (
      <div className="theme-liff theme-investor h-[100dvh] min-h-[100dvh] bg-background font-sans flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl bg-background p-8 text-center">
          <div className="w-32 h-32 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-24 h-24 text-amber-500" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">ไม่สามารถส่งสลิปได้</h1>
          <p className="text-sm text-foreground-subtle mb-6">{statusMessage}</p>
          <button
            onClick={handleGoToContracts}
            className="w-full rounded-full bg-s2 py-4 font-medium text-white"
          >
            กลับหน้าการลงทุน
          </button>
        </div>
      </div>
    );
  }

  // Default: show slip upload form
  return (
    <div className="theme-liff theme-investor h-[100dvh] min-h-[100dvh] bg-background-white font-sans flex flex-col">

      <div className="m-4 rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
        <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
          <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-s2/70">
            Contract Transaction
          </div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-s2">
                ส่งหลักฐานการชำระเงิน
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center p-4 pb-20 bg-background-white">
          {showRetry && verificationResult && (
            <div className="w-full max-w-sm bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
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

          {requestDetails && (
            <div className="w-full max-w-sm bg-background rounded-xl p-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-foreground-subtle text-sm">สถานะคำขอ:</span>
                <span className="font-medium text-s2">{statusMeta.label}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-foreground-subtle text-sm">ยอดชำระ:</span>
                <span className="font-bold text-s2 text-lg">
                  {requestDetails.increase_amount?.toLocaleString()} บาท
                </span>
              </div>
              <p className="text-xs text-foreground-subtle">
                {contract?.items?.brand} {contract?.items?.model}
              </p>
              <p className="text-xs text-foreground-subtle mt-1">{statusMeta.description}</p>
            </div>
          )}

          {requestDetails && (
            <div className="w-full max-w-sm bg-background rounded-xl p-4 mb-4">
              <div className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-s2" />
                ข้อมูลบัญชีรับเงิน
              </div>
              <div className="text-sm text-foreground-subtle space-y-1">
                <p>ธนาคาร: <span className="font-semibold text-foreground">{requestDetails.pawner_bank_name || requestDetails.contract?.pawners?.bank_name || ''}</span></p>
                <p>เลขบัญชี/พร้อมเพย์: <span className="font-semibold text-s2">{requestDetails.pawner_bank_account_no || requestDetails.contract?.pawners?.bank_account_no || ''}</span></p>
                <p>ชื่อบัญชี: <span className="font-semibold text-foreground">{requestDetails.pawner_bank_account_name || requestDetails.contract?.pawners?.bank_account_name || ''}</span></p>
              </div>
            </div>
          )}

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
                slipImage ? 'border-s2' : 'border-s2-border hover:border-s2'
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

            {slipImage && (
              <button
                onClick={handleRemoveImage}
                className="w-full bg-background-white border border-s2 text-s2 rounded-full py-2 flex flex-col items-center justify-center mb-4 transition-colors"
              >
                <span className="text-base font-medium">ลบ</span>
                <span className="text-xs font-light opacity-80">Remove</span>
              </button>
            )}

            <div className="bg-s2-soft rounded-xl p-4 mb-4 border border-s2-border">
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

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background-white backdrop-blur-md border-t border-background-white/50">
        <div className="max-w-sm mx-auto">
          <button
            onClick={handleSubmit}
            disabled={!slipImage || uploading}
            className={`w-full py-2 rounded-full flex flex-col items-center justify-center transition-all ${
              slipImage && !uploading
                ? 'bg-s2 hover:bg-s2/80 text-white'
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
