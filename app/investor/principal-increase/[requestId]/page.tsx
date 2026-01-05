'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChevronLeft, TrendingUp, User, AlertTriangle, CheckCircle, X, Wallet } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';

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
      const response = await axios.post('/api/contract-actions/investor-response', {
        requestId,
        action: 'REJECT',
        reason: rejectReason,
        investorLineId: profile?.userId,
      });

      if (response.data.success) {
        router.push('/investor/contracts');
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
      <div className="min-h-screen bg-[#F0F4F8] font-sans flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">เกิดข้อผิดพลาด</h1>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <button
            onClick={() => router.push('/investor/contracts')}
            className="w-full bg-[#1E3A8A] hover:bg-[#1E40AF] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  const contract = requestDetails?.contract;
  const item = contract?.items;
  const pawner = contract?.pawners;
  const status = requestDetails?.request_status;

  // Show different states based on status
  if (status === 'COMPLETED' || status === 'INVESTOR_TRANSFERRED') {
    return (
      <div className="min-h-screen bg-[#F0F4F8] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">ดำเนินการเรียบร้อย</h1>
          <p className="text-gray-500 text-sm mb-6">
            คำขอเพิ่มเงินต้นนี้ได้รับการดำเนินการแล้ว
          </p>
          <button
            onClick={() => router.push('/investor/contracts')}
            className="w-full bg-[#1E3A8A] hover:bg-[#1E40AF] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  if (status === 'INVESTOR_REJECTED') {
    return (
      <div className="min-h-screen bg-[#F0F4F8] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">คำขอถูกปฏิเสธ</h1>
          <p className="text-gray-500 text-sm mb-6">
            คุณได้ปฏิเสธคำขอเพิ่มเงินต้นนี้แล้ว
          </p>
          <button
            onClick={() => router.push('/investor/contracts')}
            className="w-full bg-[#1E3A8A] hover:bg-[#1E40AF] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  const rawInterestRate = Number(contract?.interest_rate || 0);
  const normalizedInterestRate = rawInterestRate > 1 ? rawInterestRate / 100 : rawInterestRate;
  const newMonthlyInterest = Math.round(((requestDetails?.principal_after_increase || requestDetails?.new_principal_amount || 0) * normalizedInterestRate) * 100) / 100;
  const increaseMonthlyInterest = Math.round(((requestDetails?.increase_amount || 0) * normalizedInterestRate) * 100) / 100;
  const formatAmount = (value: number) => (
    value % 1
      ? value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : value.toLocaleString('th-TH')
  );

  return (
    <div className="min-h-screen bg-[#F0F4F8] font-sans flex flex-col">
      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-red-50">
              <h3 className="text-lg font-bold text-center text-red-800">ปฏิเสธคำขอ</h3>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600">
                กรุณาระบุเหตุผลในการปฏิเสธคำขอเพิ่มเงินต้น
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="เหตุผลในการปฏิเสธ..."
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 h-24 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleReject}
                  disabled={!rejectReason.trim() || submitting}
                  className="flex-1 py-3 px-4 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-medium disabled:opacity-50"
                >
                  {submitting ? 'กำลังดำเนินการ...' : 'ยืนยันปฏิเสธ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center shadow-sm sticky top-0 z-10">
        <ChevronLeft
          className="w-6 h-6 text-gray-800 cursor-pointer"
          onClick={() => router.back()}
        />
        <div className="flex-1 text-center">
          <h1 className="font-bold text-lg text-gray-800">คำขอเพิ่มเงินต้น</h1>
          <p className="text-xs text-gray-400">Principal Increase Request</p>
        </div>
        <div className="w-6"></div>
      </div>

      <div className="flex-1 flex flex-col items-center p-6 pb-32">
        {/* Request Info */}
        <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#EFF6FF] rounded-full flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[#1E3A8A]" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800">สัญญาเลขที่ {contract?.contract_number}</h2>
              <p className="text-xs text-gray-500">{item?.brand} {item?.model}</p>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">เงินต้นปัจจุบัน:</span>
              <span className="font-bold">{(contract?.current_principal_amount || contract?.loan_principal_amount || contract?.original_principal_amount)?.toLocaleString()} บาท</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">จำนวนที่ขอเพิ่ม:</span>
              <span className="font-bold text-green-600">+ {requestDetails?.increase_amount?.toLocaleString()} บาท</span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="font-bold text-gray-800">เงินต้นใหม่:</span>
              <span className="font-bold text-[#1E3A8A] text-lg">{(requestDetails?.principal_after_increase || requestDetails?.new_principal_amount)?.toLocaleString()} บาท</span>
            </div>
          </div>
        </div>

        {/* Pawner Info */}
        <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <User className="w-5 h-5 text-[#1E3A8A]" />
            ข้อมูลผู้จำนำ
          </h3>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">ชื่อ:</span>
              <span className="font-bold">{pawner?.firstname} {pawner?.lastname}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">เบอร์โทร:</span>
              <span className="font-bold">{pawner?.phone_number}</span>
            </div>
          </div>

          {requestDetails?.pawner_signature_url && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-gray-500 mb-2">ลายเซ็นผู้จำนำ:</p>
              <div className="border border-gray-200 rounded-xl p-2 bg-gray-50">
                <img
                  src={requestDetails.pawner_signature_url}
                  alt="Pawner Signature"
                  className="w-full h-20 object-contain"
                />
              </div>
            </div>
          )}
        </div>

        {/* Pawner Bank Account */}
        <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#1E3A8A]" />
            บัญชีรับเงินของผู้จำนำ
          </h3>

          <div className="bg-[#EFF6FF] rounded-xl p-3 border border-[#BFDBFE]">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">ธนาคาร:</span>
                <span className="font-bold">{requestDetails?.pawner_bank_name || requestDetails?.contract?.pawners?.bank_name || ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">เลขบัญชี:</span>
                <span className="font-bold text-[#1E3A8A]">{requestDetails?.pawner_bank_account_no || requestDetails?.contract?.pawners?.bank_account_no || ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">ชื่อบัญชี:</span>
                <span className="font-bold">{requestDetails?.pawner_bank_account_name || requestDetails?.contract?.pawners?.bank_account_name || ''}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Interest Info */}
        <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3">ข้อมูลดอกเบี้ย</h3>

          <div className="bg-green-50 rounded-xl p-3">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">อัตราดอกเบี้ย:</span>
                <span className="font-bold">{contract?.interest_rate}% / เดือน</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">ดอกเบี้ยใหม่/เดือน:</span>
                <span className="font-bold text-green-700">
                  {formatAmount(newMonthlyInterest)} บาท
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">เพิ่มขึ้น/เดือน:</span>
                <span className="font-bold text-green-700">
                  + {formatAmount(increaseMonthlyInterest)} บาท
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="w-full max-w-sm bg-amber-50 rounded-2xl p-4 mb-4 border border-amber-200">
          <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            ข้อควรทราบ
          </h3>
          <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
            <li>หากอนุมัติ คุณต้องโอนเงิน {requestDetails?.increase_amount?.toLocaleString()} บาท ไปยังบัญชีผู้จำนำ</li>
            <li>หลังจากโอนเงิน กรุณาอัปโหลดสลิปเพื่อยืนยัน</li>
            <li>เงินต้นจะเพิ่มขึ้นหลังจากผู้จำนำยืนยันรับเงินแล้ว</li>
          </ul>
        </div>
      </div>

      {/* Fixed Bottom Buttons */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F0F4F8]">
        <div className="max-w-sm mx-auto flex gap-3">
          <button
            onClick={() => setShowRejectModal(true)}
            className="flex-1 py-4 rounded-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-[0.98] bg-white border-2 border-red-500 text-red-500 hover:bg-red-50"
          >
            <span className="text-base font-bold">ปฏิเสธ</span>
            <span className="text-xs font-light opacity-80">Reject</span>
          </button>
          <button
            onClick={handleApprove}
            className="flex-1 py-4 rounded-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-[0.98] bg-[#1E3A8A] hover:bg-[#1E40AF] text-white"
          >
            <span className="text-base font-bold">อนุมัติ</span>
            <span className="text-xs font-light opacity-80">Approve</span>
          </button>
        </div>
      </div>
    </div>
  );
}
