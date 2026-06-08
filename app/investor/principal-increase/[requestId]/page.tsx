'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { TrendingUp, User, CheckCircle, X, Wallet } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import { openLiffEntry } from '@/lib/liff/navigation';
import { getInvestorPrincipalIncreaseStatusMeta, getMockPrincipalIncreaseRequest, isInvestorPreviewMode } from '@/lib/mock-investment';

function DetailRow({
  label,
  value,
  valueClassName = 'text-foreground',
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-foreground-subtle">{label}</span>
      <span className={`text-right font-semibold ${valueClassName}`}>{value}</span>
    </div>
  );
}

export default function InvestorPrincipalIncreaseApprovalPage() {
  const router = useRouter();
  const params = useParams();
  const requestId = params.requestId as string;
  const { profile } = useLiff();

  const [loading, setLoading] = useState(true);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const goToInvestment = () => {
    openLiffEntry({
      liffIdCandidates: [
        process.env.NEXT_PUBLIC_LIFF_ID_INVESTMENT,
        process.env.NEXT_PUBLIC_LIFF_ID_INVEST_DASHBOARD,
      ],
      fallbackPath: '/investment',
    });
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
        setError(null);
        return;
      }
      const response = await axios.get(`/api/contract-actions/${requestId}?viewer=investor`);
      if (response.data.success) {
        setRequestDetails(response.data.request);
      }
    } catch (error) {
      console.error('Error fetching request:', error);
      setError('ไม่พบข้อมูลคำขอ');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = () => {
    // Navigate to upload slip page
    router.push(`/investor/principal-increase/${requestId}/upload`);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      if (isInvestorPreviewMode()) {
        setRequestDetails((current: any) => current ? { ...current, request_status: 'INVESTOR_REJECTED' } : current);
        return;
      }
      const response = await axios.post('/api/contract-actions/investor-response', {
        requestId,
        action: 'REJECT',
        reason: rejectReason,
        investorLineId: profile?.userId,
      });

      if (response.data.success) {
        goToInvestment();
      } else {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
      console.error('Error rejecting:', error);
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
      setShowRejectModal(false);
    }
  };

  if (loading) {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background-white px-4 py-6 font-sans text-foreground">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md items-center justify-center">
          <div className="w-full rounded-[var(--radius-xl)] border border-error-border bg-error-soft/70 p-4 text-center shadow-soft">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-background-white text-error shadow-soft">
              <X className="h-10 w-10" />
            </div>
            <h1 className="mb-2 text-xl font-semibold text-foreground">เกิดข้อผิดพลาด</h1>
            <p className="mb-6 text-sm text-foreground-subtle">{error}</p>
            <button
              onClick={goToInvestment}
              className="btn-transition w-full rounded-full bg-[image:var(--background-image-grad-investor)] py-4 font-semibold text-s2-fg shadow-soft"
            >
              กลับหน้าการลงทุน
            </button>
          </div>
        </div>
      </div>
    );
  }

  const contract = requestDetails?.contract;
  const item = contract?.items;
  const status = requestDetails?.request_status;
  const statusMeta = getInvestorPrincipalIncreaseStatusMeta(status);

  // Show different states based on status
  if (status === 'COMPLETED' || status === 'INVESTOR_TRANSFERRED') {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background-white px-4 py-6 font-sans text-foreground">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md items-center justify-center">
          <div className="w-full rounded-xl border border-s2-border bg-s2-soft/55 p-4 text-center shadow-soft">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-success-soft text-success shadow-soft">
              <CheckCircle className="h-10 w-10" />
            </div>
            <h1 className="mb-2 text-xl font-semibold text-foreground">ดำเนินการเรียบร้อย</h1>
            <p className="mb-6 text-sm text-foreground-subtle">
              คำขอเพิ่มเงินต้นนี้ได้รับการดำเนินการแล้ว
            </p>
            <button
              onClick={goToInvestment}
              className="btn-transition w-full rounded-full bg-[image:var(--background-image-grad-investor)] py-4 font-semibold text-s2-fg shadow-soft"
            >
              กลับหน้าการลงทุน
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'INVESTOR_REJECTED') {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background-white px-4 py-6 font-sans text-foreground">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md items-center justify-center">
          <div className="w-full rounded-xl p-4 text-center">
            <div className="mx-auto mb-4 rounded-full w-40 h-40 bg-error-soft flex items-center justify-center text-error">
              <svg xmlns="http://www.w3.org/2000/svg" width="128px" height="128px" viewBox="0 0 50 50">
                <path d="M0 0h50v50H0z" fill="none" />
                <g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                  <path stroke="currentColor" d="m21.875 21.875l6.25 6.25m0-6.25l-6.25 6.25" />
                  <path stroke="currentColor" d="M14.583 6.25H37.5a2.083 2.083 0 0 1 2.083 2.083v33.334A2.083 2.083 0 0 1 37.5 43.75h-25a2.083 2.083 0 0 1-2.083-2.083v-31.25zm-4.166 4.167h4.166V6.25z" />
                </g>
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-semibold text-foreground">คำขอถูกปฏิเสธเรียบร้อย</h1>
            <p className="mb-6 text-sm text-foreground-subtle">
              คุณได้ปฏิเสธคำขอเพิ่มเงินต้นนี้แล้ว
            </p>
            <button
              onClick={goToInvestment}
              className="btn-transition w-full rounded-full bg-s2 py-4 font-semibold text-s2-fg shadow-soft"
            >
              กลับหน้าการลงทุน
            </button>
          </div>
        </div>
      </div>
    );
  }

  const investorRate = Number(contract?.investor_rate || 0.015);
  const investorRatePercent = investorRate * 100;
  const newMonthlyInterest = Math.round(((requestDetails?.principal_after_increase || requestDetails?.new_principal_amount || 0) * investorRate) * 100) / 100;
  const increaseMonthlyInterest = Math.round(((requestDetails?.increase_amount || 0) * investorRate) * 100) / 100;
  const formatAmount = (value: number) => (
    value % 1
      ? value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : value.toLocaleString('th-TH')
  );

  return (
    <div className="theme-liff theme-investor min-h-screen bg-background-white px-4 py-6 font-sans text-foreground">
      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background-darker/60 p-4 backdrop-blur-sm">
          <div className="modal-pop-in w-full max-w-sm overflow-hidden rounded-xl bg-background-white shadow-strong">
            <div className="border-b border-error bg-error px-4 py-4">
              <h3 className="text-center text-lg font-semibold text-error-fg">ปฏิเสธคำขอ</h3>
            </div>
            <div className="space-y-4 p-4">
              <p className="text-sm text-foreground-subtle">
                กรุณาระบุเหตุผลในการปฏิเสธคำขอเพิ่มเงินต้น
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="เหตุผลในการปฏิเสธ..."
                className="w-full h-24 resize-none rounded-lg border border-error-border bg-background-white px-3 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:ring-1 focus:ring-error autofill:bg-background-white autofill:text-foreground"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="btn-transition flex-1 rounded-full border border-error-border bg-background-white px-4 py-3 font-medium text-error hover:bg-background-subtle"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleReject}
                  disabled={!rejectReason.trim() || submitting}
                  className="btn-transition flex-1 rounded-full bg-error px-4 py-3 font-semibold text-primary-fg shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'กำลังดำเนินการ...' : 'ยืนยันปฏิเสธ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-md flex-col mb-24">
        <div className="mb-5 rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
            <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-s2/70">
              Investor Request
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-s2">
                  คำขอเพิ่มเงินต้น
                </div>
                <p className="mt-2 text-xs text-foreground-subtle">
                  Principal Increase Request
                </p>
              </div>
              <div className="text-right text-sm font-light text-foreground-subtle">
                {statusMeta.label}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-3 no-scrollbar">
          <div className="rounded-xl border border-s2-border bg-s2-soft p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between gap-3 flex-nowrap">
              <h3 className="min-w-0 flex-1 truncate whitespace-nowrap text-md font-medium text-foreground">
                {contract?.contract_number || 'รายละเอียดคำขอ'}
              </h3>
              <div className="shrink-0 rounded-full bg-background-white px-2 py-1">
                <span className="whitespace-nowrap rounded-full bg-background-white px-4 py-1.5 text-xs font-medium text-s2">
                  {statusMeta.label}
                </span>
              </div>
            </div>

            <div className="mb-3 space-y-1">
              <div className="text-sm text-foreground-subtle">
                สินทรัพย์: <span className="text-foreground-muted">{item?.brand} {item?.model}</span>
              </div>
              <div className="text-sm text-foreground-subtle">
                สถานะ: <span className="text-s2">{statusMeta.description}</span>
              </div>
            </div>

            <div className="mt-4 w-full rounded-full bg-s2/20 px-3 py-2 text-center text-xs font-light text-s2">
              Investor request detail
            </div>
          </div>

          <div className="rounded-xl border border-s2-border bg-s2-soft p-4">
            <div className="flex items-center justify-between gap-3 flex-nowrap">
              <h3 className="min-w-0 flex-1 truncate whitespace-nowrap text-lg font-medium text-foreground">
                สรุปจำนวนเงิน
              </h3>
              <div className="text-sm font-light text-foreground-subtle">
                {requestDetails?.increase_amount?.toLocaleString()} บาท
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-background-white bg-background-white p-4">
                <div className="space-y-3">
                  <DetailRow
                    label="เงินต้นปัจจุบัน"
                    value={`${(contract?.current_principal_amount || contract?.loan_principal_amount || contract?.original_principal_amount)?.toLocaleString()} บาท`}
                  />
                  <DetailRow
                    label="จำนวนที่ขอเพิ่ม"
                    value={`+ ${requestDetails?.increase_amount?.toLocaleString()} บาท`}
                    valueClassName="text-s2"
                  />
                  <div className="border-t border-s2-border pt-3">
                    <DetailRow
                      label="เงินต้นใหม่"
                      value={`${(requestDetails?.principal_after_increase || requestDetails?.new_principal_amount)?.toLocaleString()} บาท`}
                      valueClassName="text-base text-s2"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pawner Info (Redacted) */}
        <div className="my-3 rounded-xl border border-s2-border bg-s2-soft p-4">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background-white text-s2">
              <User className="h-5 w-5" />
            </span>
            ข้อมูลผู้ขอสินเชื่อ
          </h3>
          <div className="rounded-lg border border-s2-border bg-background-white/50 p-4 text-sm leading-7 text-foreground-subtle">
            ข้อมูลส่วนบุคคลของผู้ขอสินเชื่อถูกปกปิดตามนโยบายความเป็นส่วนตัว
          </div>
        </div>

        {/* Pawner Bank Account */}
        <div className="rounded-xl border border-s2-border bg-s2-soft p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between gap-3 flex-nowrap">
            <h3 className="min-w-0 flex-1 truncate whitespace-nowrap text-md font-medium text-foreground">
              บัญชีรับเงินของผู้ขอสินเชื่อ
            </h3>
            <div className="shrink-0 rounded-full bg-background-white px-2 py-1">
              <span className="whitespace-nowrap rounded-full bg-background-white px-4 py-1.5 text-xs font-medium text-s2">
                Bank Account
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-background-white bg-background-white p-4">
            <div className="space-y-3">
              <DetailRow
                label="ธนาคาร"
                value={requestDetails?.pawner_bank_name || requestDetails?.contract?.pawners?.bank_name || ''}
              />
              <DetailRow
                label="เลขบัญชี"
                value={requestDetails?.pawner_bank_account_no || requestDetails?.contract?.pawners?.bank_account_no || ''}
                valueClassName="text-s2"
              />
              <DetailRow
                label="ชื่อบัญชี"
                value={requestDetails?.pawner_bank_account_name || requestDetails?.contract?.pawners?.bank_account_name || ''}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-s2-border bg-s2-soft p-4">
          <div className="mb-3 flex items-center justify-between gap-3 flex-nowrap">
            <h3 className="min-w-0 flex-1 truncate whitespace-nowrap text-md font-medium text-foreground">
              ข้อมูลดอกเบี้ย
            </h3>
            <div className="shrink-0 rounded-full bg-background-white px-2 py-1">
              <span className="whitespace-nowrap rounded-full bg-background-white px-4 py-1.5 text-xs font-medium text-s2">
                Interest
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-background-white bg-background-white p-4">
            <div className="space-y-3">
              <DetailRow
                label="อัตราดอกเบี้ยสุทธิ (นักลงทุน)"
                value={`${investorRatePercent.toFixed(2)}% / เดือน`}
              />
              <DetailRow
                label="ดอกเบี้ยใหม่ / เดือน"
                value={`${formatAmount(newMonthlyInterest)} บาท`}
                valueClassName="text-s2"
              />
              <DetailRow
                label="เพิ่มขึ้น / เดือน"
                value={`+ ${formatAmount(increaseMonthlyInterest)} บาท`}
                valueClassName="text-s2"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-warning-border bg-warning-soft p-4 shadow-soft">
          <div className="mb-2 flex items-center justify-between gap-3 flex-nowrap">
            <h3 className="min-w-0 flex-1 truncate whitespace-nowrap text-md font-medium text-warning">
              ข้อควรทราบ
            </h3>
            <div className="shrink-0 rounded-full bg-background-white px-2 py-1">
              <span className="whitespace-nowrap rounded-full bg-background-white px-4 py-1.5 text-xs font-medium text-warning">
                Notice
              </span>
            </div>
          </div>
          <ul className="list-inside list-disc space-y-1 text-xs leading-6 text-warning">
            <li>หากอนุมัติ คุณต้องโอนเงิน {requestDetails?.increase_amount?.toLocaleString()} บาท ไปยังบัญชีผู้ขอสินเชื่อ</li>
            <li>หลังจากโอนเงิน กรุณาอัปโหลดสลิปเพื่อยืนยัน</li>
            <li>เงินต้นจะเพิ่มขึ้นหลังจากผู้ขอสินเชื่อยืนยันรับเงินแล้ว</li>
          </ul>
        </div>
      </div>

      {/* Fixed Bottom Buttons */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-background-white/50 bg-background-white/25 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-3">
          <button
            onClick={() => setShowRejectModal(true)}
            className="btn-transition flex flex-1 flex-col items-center justify-center rounded-full border border-error py-3 text-error shadow-soft active:scale-[0.98] hover:bg-error-soft"
          >
            <span className="text-base font-semibold">ปฏิเสธ</span>
            <span className="text-xs text-error/60">Reject</span>
          </button>
          <button
            onClick={handleApprove}
            className="btn-transition btn-sheen flex flex-1 flex-col items-center justify-center rounded-full bg-s2 py-3 text-s2-fg shadow-soft active:scale-[0.98]"
          >
            <span className="text-base font-semibold">อนุมัติ</span>
            <span className="text-xs text-s2-fg/80">Approve</span>
          </button>
        </div>
      </div>
    </div>
  );
}
