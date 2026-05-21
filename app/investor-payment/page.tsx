'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { X, Upload } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { openLiffEntry } from '@/lib/liff/navigation';
import { getMockContractById, isInvestorPreviewMode, MOCK_CONTRACT_IDS } from '@/lib/mock-investment';

function InvestorPaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading } = useLiff();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const redirectToInvestorVerification = () => {
    openLiffEntry({
      liffIdCandidates: [
        process.env.NEXT_PUBLIC_LIFF_ID_INVEST_REGISTER,
        process.env.NEXT_PUBLIC_LIFF_ID_INVEST,
      ],
      fallbackPath: '/ekyc-invest',
    });
  };

  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get contractId from query params or liff.state
  const previewMode = isInvestorPreviewMode();
  let contractId = searchParams.get('contractId');
  if (!contractId) {
    const liffState = searchParams.get('liff.state');
    if (liffState) {
      const match = liffState.match(/contractId=([^&]+)/);
      if (match) contractId = match[1];
    }
  }
  const effectiveContractId = contractId || (previewMode ? MOCK_CONTRACT_IDS.offer : null);

  const [amount, setAmount] = useState('');
  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [uploadingSlip, setUploadingSlip] = useState(false);

  useEffect(() => {
    if (liffLoading || !profile?.userId || !effectiveContractId) return;
    fetchContractDetails();
  }, [liffLoading, profile?.userId, effectiveContractId]);

  const fetchContractDetails = async () => {
    try {
      setLoading(true);
      if (previewMode) {
        const mockContract = getMockContractById(effectiveContractId);
        setContract(mockContract);
        setAmount(mockContract?.loan_principal_amount?.toLocaleString() || '');
        return;
      }
      const response = await axios.get(`/api/contracts/${effectiveContractId}?viewer=investor&includeBank=true&lineId=${profile?.userId}`);
      setContract(response.data.contract);
      // Pre-fill amount
      setAmount(response.data.contract.loan_principal_amount?.toLocaleString() || '');
    } catch (error: any) {
      console.error('Error fetching contract:', error);
      if (error.response?.data?.kycRequired) {
        redirectToInvestorVerification();
        return;
      }
      setError(error.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingSlip(true);
      let uploadFile = file;
      try {
        uploadFile = await imageCompression(file, {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: 'image/jpeg',
        });
      } catch (compressionError) {
        console.warn('Compression failed, using original file:', compressionError);
      }

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('folder', 'payment-slips');

      if (previewMode) {
        setSlipImage(URL.createObjectURL(uploadFile));
        return;
      }

      const response = await axios.post('/api/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.url) {
        setSlipImage(response.data.url);
      }
    } catch (error) {
      console.error('Error uploading slip:', error);
      alert('ไม่สามารถอัปโหลดสลิปได้');
    } finally {
      setUploadingSlip(false);
    }
  };

  const handleRemoveImage = () => {
    setSlipImage(null);
  };

  const handleSubmit = async () => {
    if (!profile?.userId) {
      alert('กรุณาเข้าสู่ระบบ LINE');
      return;
    }

    if (!slipImage) {
      alert('กรุณาอัปโหลดสลิปการโอนเงิน');
      return;
    }

    const amountNum = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('กรุณากรอกยอดเงินที่ถูกต้อง');
      return;
    }

    try {
      setSubmitting(true);

      if (previewMode) {
        alert('Mock mode: ส่งหลักฐานการชำระเงินสำเร็จ');
        return;
      }

      const response = await axios.post('/api/payments/investor-payment', {
        contractId: effectiveContractId,
        investorLineId: profile.userId,
        amount: amountNum,
        paymentSlipUrl: slipImage
      });

      if (response.data.success) {
        alert('ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว รอการยืนยันจากผู้ขอสินเชื่อ');
        // Close LIFF
        if (typeof window !== 'undefined' && window.liff) {
          window.liff.closeWindow();
        }
      }
    } catch (error: any) {
      console.error('Error submitting payment:', error);
      alert(error.response?.data?.error || 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  if (liffLoading || loading) {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background px-4 py-6">
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <div className="w-full max-w-sm rounded-xl border border-s2-border bg-s2-soft px-6 py-8 text-center shadow-soft">
            <p className="mb-4 text-error">{error || 'ไม่พบข้อมูลสัญญา'}</p>
            <button
              onClick={() => window.history.back()}
              className="btn-transition inline-flex min-h-12 items-center justify-center rounded-full border border-s2 bg-background-white px-6 py-3 text-sm font-medium text-s2"
            >
              กลับ
            </button>
          </div>
        </div>
      </div>
    );
  }

  const paymentStatus = contract.payment_status as string | undefined;
  const fundingStatus = contract.funding_status as string | undefined;
  const hasSlip = Boolean(contract.payment_slip_url);
  const isRejected = paymentStatus === 'REJECTED';
  const isPaid = paymentStatus === 'INVESTOR_PAID' || paymentStatus === 'COMPLETED';
  const isConfirmed = contract.contract_status === 'CONFIRMED' || Boolean(contract.payment_confirmed_at);
  const isFundingClosed = fundingStatus === 'DISBURSED';
  const canSubmit = !isPaid && !isConfirmed && !isFundingClosed && (!hasSlip || isRejected);

  if (!canSubmit) {
    let blockedMessage = 'สัญญานี้อยู่ในสถานะที่ไม่สามารถส่งสลิปได้';
    if (isPaid || hasSlip) {
      blockedMessage = 'คุณได้ส่งหลักฐานการชำระเงินแล้ว กรุณารอผู้ขอสินเชื่อยืนยัน';
    } else if (isConfirmed) {
      blockedMessage = 'รายการนี้ได้รับการยืนยันแล้ว';
    } else if (isFundingClosed) {
      blockedMessage = 'สัญญานี้อยู่ในสถานะที่ไม่สามารถส่งสลิปได้';
    }

    return (
      <div className="theme-liff theme-investor min-h-screen bg-background px-4 py-6">
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <div className="w-full max-w-sm rounded-xl border border-s2-border bg-s2-soft px-6 py-8 text-center shadow-soft">
            <p className="mb-4 text-foreground-muted">{blockedMessage}</p>
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && window.liff) {
                  window.liff.closeWindow();
                } else {
                  window.history.back();
                }
              }}
              className="btn-transition inline-flex min-h-12 items-center justify-center rounded-full border border-s2 bg-background-white px-6 py-3 text-sm font-medium text-s2"
            >
              ปิด
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-liff theme-investor min-h-screen bg-background px-4 py-6 pb-28">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <div className="mb-5 rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
            <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-s2/70">
              Investor Payment
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-s2">
              ส่งหลักฐานการชำระเงิน
            </div>
            <p className="mt-2 text-xs text-foreground-subtle">อัปโหลดสลิปการโอนเงินสำหรับรายการลงทุนนี้</p>
          </div>
        </div>

        {isRejected && (
          <div className="mb-4 rounded-xl border border-warning-border bg-warning-soft px-4 py-4 text-sm text-warning shadow-soft">
            ผู้ขอสินเชื่อแจ้งว่ายังไม่ได้รับเงิน กรุณาตรวจสอบและส่งสลิปใหม่อีกครั้ง
          </div>
        )}

        <div className="space-y-4 pb-4">
          <div className="rounded-xl border border-s2-border bg-background-white p-4 shadow-soft">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-s2/70">Contract Detail</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-foreground-subtle">หมายเลขสัญญา</span>
                <span className="text-right font-medium text-foreground">{contract.contract_number}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-foreground-subtle">สินค้า</span>
                <span className="text-right font-medium text-foreground">{contract.items?.brand} {contract.items?.model}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-foreground-subtle">วงเงินสินเชื่อ</span>
                <span className="text-right font-medium text-s2">{contract.loan_principal_amount?.toLocaleString()} บาท</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-s2-border bg-s2-soft/45 p-4 shadow-soft">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-s2/70">Receiver Account</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-foreground-subtle">ธนาคาร</span>
                <span className="text-right font-medium text-foreground">{contract.pawners?.bank_name || 'ไม่ระบุ'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-foreground-subtle">ชื่อบัญชี</span>
                <span className="text-right font-medium text-foreground">{contract.pawners?.bank_account_name || 'ไม่ระบุ'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-foreground-subtle">เลขบัญชี</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-s2">{contract.pawners?.bank_account_no || 'ไม่ระบุ'}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(contract.pawners?.bank_account_no || '');
                      alert('คัดลอกเลขบัญชีแล้ว');
                    }}
                    className="btn-transition rounded-full border border-s2-border bg-background-white px-3 py-1 text-xs font-medium text-s2"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-s2-border bg-background-white p-4 shadow-soft">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-semibold uppercase tracking-[0.18em] text-s2/70">Transfer Amount</label>
              <span className="text-sm text-foreground-subtle">บาท</span>
            </div>
            <input
              type="text"
              value={amount}
              readOnly
              className="w-full rounded-xl border border-s2-border bg-s2-soft/30 px-4 py-4 text-xl font-semibold text-s2 outline-none"
            />
            <p className="mt-2 text-xs text-foreground-subtle">ยอดนี้ล็อกตามวงเงินที่ลูกค้าขอ ไม่สามารถแก้ไขได้</p>
          </div>

          <div
            onClick={() => !slipImage && fileInputRef.current?.click()}
            className={`rounded-xl border-2 bg-background-white p-4 h-56 shadow-soft flex flex-col items-center justify-center transition-colors relative overflow-hidden ${
              slipImage ? 'border-s2-border' : 'border-dashed border-s2-border cursor-pointer hover:bg-s2-soft/20'
            }`}
          >
            {uploadingSlip ? (
              <div className="dot-bricks" />
            ) : slipImage ? (
              <div className="w-full h-full relative">
                <img
                  src={slipImage}
                  alt="Slip Preview"
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <>
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-s2-soft text-s2">
                  <Upload className="h-7 w-7" />
                </div>
                <span className="font-medium text-foreground">อัปโหลดสลิปการโอนเงิน</span>
                <span className="mt-1 text-xs text-foreground-subtle">Tap to upload payment proof</span>
              </>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {slipImage && (
            <button
              onClick={handleRemoveImage}
              className="btn-transition w-full rounded-full border border-s2 bg-background-white py-3 text-sm font-medium text-s2"
            >
              ลบรูปสลิป
            </button>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 mx-auto flex w-full max-w-md flex-col gap-3 bg-transparent p-4">
          <button
            onClick={handleSubmit}
            disabled={submitting || !slipImage}
            className="btn-transition btn-sheen w-full rounded-full bg-[image:var(--background-image-grad-investor)] py-3 text-s2-fg shadow-soft disabled:opacity-50"
          >
            <span className="text-base font-medium">{submitting ? 'กำลังส่ง...' : 'ส่งหลักฐานการชำระเงิน'}</span>
            <span className="text-xs font-light opacity-90">Submit payment proof</span>
          </button>
          <button
            onClick={() => {
              router.push('/investment');
            }}
            className="btn-transition w-full rounded-full border border-s2 bg-background-white py-3 text-sm font-medium text-s2"
          >
            กลับพอร์ตการลงทุน
          </button>
        </div>
      </div>
    </div>
    );
  }

export default function InvestorPaymentPage() {
  return (
    <Suspense fallback={
      <div className="theme-liff theme-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    }>
      <InvestorPaymentContent />
    </Suspense>
  );
}
