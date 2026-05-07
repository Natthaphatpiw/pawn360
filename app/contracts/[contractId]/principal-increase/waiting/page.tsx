'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Clock, CheckCircle, X, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import TransactionHeader from '../../_components/TransactionHeader';
import { getMockPrincipalIncreaseRequest, isPreviewMode, withPreview } from '../../_lib/preview';

export default function PrincipalIncreaseWaitingPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const requestId = searchParams.get('requestId');
  const selectedStatus = searchParams.get('status');
  const previewMode = isPreviewMode(searchParams);

  const [loading, setLoading] = useState(true);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [status, setStatus] = useState<string>('PENDING_INVESTOR_APPROVAL');

  const allowedPreviewStatuses = new Set([
    'PENDING_INVESTOR_APPROVAL',
    'AWAITING_INVESTOR_APPROVAL',
    'INVESTOR_APPROVED',
    'AWAITING_INVESTOR_PAYMENT',
    'INVESTOR_SLIP_UPLOADED',
    'INVESTOR_SLIP_VERIFIED',
    'INVESTOR_TRANSFERRED',
    'AWAITING_PAWNER_CONFIRM',
    'AWAITING_PAYMENT',
    'SLIP_REJECTED',
    'INVESTOR_REJECTED',
    'COMPLETED',
  ]);

  useEffect(() => {
    if (previewMode) {
      const mockRequest = getMockPrincipalIncreaseRequest(requestId || `preview-increase-${contractId}`, contractId);
      const resolvedStatus = selectedStatus && allowedPreviewStatuses.has(selectedStatus)
        ? selectedStatus
        : 'PENDING_INVESTOR_APPROVAL';
      setRequestDetails({
        ...mockRequest,
        request_status: resolvedStatus,
      });
      setStatus(resolvedStatus);
      setLoading(false);
      return;
    }

    if (requestId) {
      fetchRequestDetails();
      // Poll for status updates every 10 seconds
      const interval = setInterval(fetchRequestDetails, 10000);
      return () => clearInterval(interval);
    }
  }, [requestId, previewMode, contractId, selectedStatus]);

  useEffect(() => {
    if ((status === 'AWAITING_PAYMENT' || status === 'SLIP_REJECTED') && requestId) {
      const nextPath = `/contracts/${contractId}/principal-increase/upload`;
      router.replace(previewMode ? withPreview(nextPath, 'requestId', requestId) : `${nextPath}?requestId=${requestId}`);
    }
  }, [status, requestId, contractId, router, previewMode]);

  const fetchRequestDetails = async () => {
    try {
      const response = await axios.get(`/api/contract-actions/${requestId}`);
      if (response.data.success) {
        setRequestDetails(response.data.request);
        setStatus(response.data.request.request_status);
      }
    } catch (error) {
      console.error('Error fetching request:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoToContracts = () => {
    router.push('/contracts');
  };

  const handleConfirmReceived = async () => {
    if (previewMode) {
      setStatus('COMPLETED');
      return;
    }

    try {
      const response = await axios.post('/api/contract-actions/confirm-received', {
        requestId,
      });

      if (response.data.success) {
        fetchRequestDetails();
      }
    } catch (error) {
      console.error('Error confirming:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-white font-sans flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  const contract = requestDetails?.contract;
  const item = contract?.items;

  // Show different states based on status
  if (status === 'INVESTOR_REJECTED') {
    return (
      <div className="min-h-screen bg-background-white font-sans flex flex-col">
        
        {/* Header */}
        <TransactionHeader title="การอนุมัติ" subtitle="Approval" />

        <div className="bg-background rounded-xl p-4 text-center w-full max-w-sm mx-auto mt-2">
          <div className="w-32 h-32 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <X className="w-24 h-24 text-red-500" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2">คำขอถูกปฏิเสธ</h1>
          <p className="text-foreground-subtle text-sm mb-6">
            นักลงทุนได้ปฏิเสธคำขอเพิ่มเงินต้นของคุณ
          </p>

          {requestDetails && (
            <div className="bg-primary-soft rounded-lg p-4 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">รายการ:</span>
                  <span className="font-bold">{item?.brand} {item?.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">จำนวนที่ขอเพิ่ม:</span>
                  <span className="font-bold text-primary">
                    {requestDetails.increase_amount?.toLocaleString()} บาท
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">สถานะ:</span>
                  <span className="font-bold text-red-600">
                    คำขอถูกปฏิเสธ
                  </span>
                </div>
              </div>
            </div>
          )}

          {requestDetails?.rejection_reason && (
            <div className="bg-red-50 rounded-xl p-4 mb-6 text-left">
              <p className="text-sm text-red-700">
                <span className="font-bold">เหตุผล:</span> {requestDetails.rejection_reason}
              </p>
            </div>
          )}

          <button
            onClick={handleGoToContracts}
            className="w-full bg-primary text-primary-fg rounded-full py-4 font-medium transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  if (status === 'COMPLETED') {
    return (
      <div className="min-h-screen bg-background-white font-sans flex flex-col items-center justify-center p-4">
        <div className="bg-background-white rounded-xl p-4 text-center max-w-sm w-full">
          <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-24 h-24 text-green-500" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2">เพิ่มเงินต้นสำเร็จ</h1>
          <p className="text-foreground-subtle text-sm mb-6">
            เงินต้นของสัญญาได้รับการเพิ่มเรียบร้อยแล้ว
          </p>

          {contract && (
            <div className="bg-primary-soft rounded-lg p-4 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">เลขที่สัญญา:</span>
                  <span className="font-bold">{contract.contract_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">เงินต้นใหม่:</span>
                  <span className="font-bold text-primary">
                    {(requestDetails.principal_after_increase || requestDetails.new_principal_amount)?.toLocaleString()} บาท
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">เพิ่มขึ้น:</span>
                  <span className="font-bold text-green-600">
                    + {requestDetails.increase_amount?.toLocaleString()} บาท
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleGoToContracts}
            className="w-full bg-primary text-primary-fg rounded-full py-4 font-medium transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  if (status === 'INVESTOR_TRANSFERRED') {
    return (
      <div className="min-h-screen bg-background-white font-sans flex flex-col">
        
        {/* Header */}
        <TransactionHeader title="การอนุมัติ" subtitle="Approval" />

        <div className="bg-background rounded-xl p-4 text-center w-full max-w-sm mx-auto mt-2">
          <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-24 h-24 text-green-500" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2">นักลงทุนโอนเงินแล้ว</h1>
          <p className="text-foreground-subtle text-sm mb-6">
            กรุณาตรวจสอบบัญชีของคุณและยืนยันการได้รับเงิน
          </p>

          {requestDetails && (
            <div className="bg-primary-soft rounded-lg p-4 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">จำนวนเงิน:</span>
                  <span className="font-bold text-primary">
                    {requestDetails.increase_amount?.toLocaleString()} บาท
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">โอนเข้าบัญชี:</span>
                  <span className="font-bold">
                    {requestDetails.pawner_bank_name || requestDetails.contract?.pawners?.bank_name || ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">เลขบัญชี:</span>
                  <span className="font-bold">
                    {requestDetails.pawner_bank_account_no || requestDetails.contract?.pawners?.bank_account_no || ''}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-amber-50 rounded-lg p-3 mb-6 border border-amber-200 text-left">
            <p className="text-xs text-amber-700">
              หมายเหตุ: หากผู้ขอสินเชื่อไม่ยืนยันภายใน 24 ชั่วโมง ระบบจะถือว่าได้รับเงินแล้ว
            </p>
          </div>

          <button
            onClick={handleConfirmReceived}
            className="w-full bg-green-500 hover:bg-green-600 text-white rounded-full py-4 font-medium transition-colors mb-3"
          >
            ยืนยันได้รับเงินแล้ว
          </button>

          <button
            onClick={handleGoToContracts}
            className="w-full bg-primary hover:bg-primary/80 text-primary-fg rounded-full py-4 font-medium transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  if (status === 'AWAITING_PAYMENT' || status === 'SLIP_REJECTED') {
    return (
      <div className="min-h-screen bg-background-white font-sans flex flex-col items-center justify-top p-4">
        <div className="bg-background rounded-xl p-4 text-center max-w-sm w-full">
          <div className="w-32 h-32 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-24 h-24 text-amber-500" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2">รออัปโหลดสลิปดอกเบี้ย</h1>
          <p className="text-foreground-subtle text-sm mb-6">
            กรุณาอัปโหลดสลิปการชำระดอกเบี้ยเพื่อให้ระบบส่งคำขอไปยังนักลงทุน
          </p>

          <button
            onClick={() => {
              const nextPath = `/contracts/${contractId}/principal-increase/upload`;
              router.push(previewMode ? withPreview(nextPath, 'requestId', requestId || `preview-increase-${contractId}`) : `${nextPath}?requestId=${requestId}`);
            }}
            className="w-full bg-primary hover:bg-primary/80 text-white rounded-full py-4 font-bold transition-colors mb-3"
          >
            อัปโหลดสลิป
          </button>

          <button
            onClick={handleGoToContracts}
            className="w-full bg-primary hover:bg-primary/80 text-primary-fg rounded-full py-4 font-medium transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  // Default: Waiting for investor approval
  return (
    <div className="min-h-screen bg-background-white font-sans flex flex-col">
      {/* Header */}
      <TransactionHeader title="รอการอนุมัติ" subtitle="Waiting for Approval" />

      <div className="flex-1 flex flex-col items-center justify-top p-4">
        <div className="bg-background rounded-xl p-4 text-center max-w-sm w-full">
          <div className="w-32 h-32 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-24 h-24 text-amber-500" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2">รอนักลงทุนอนุมัติ</h1>
          <p className="text-foreground-subtle text-sm mb-6">
            คำขอเพิ่มเงินต้นของคุณถูกส่งไปยังนักลงทุนแล้ว<br />
            กรุณารอการพิจารณา
          </p>

          {requestDetails && (
            <div className="bg-primary-soft rounded-lg p-4 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">รายการ:</span>
                  <span className="font-bold">{item?.brand} {item?.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">จำนวนที่ขอเพิ่ม:</span>
                  <span className="font-bold text-primary">
                    {requestDetails.increase_amount?.toLocaleString()} บาท
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">สถานะ:</span>
                  <span className="font-bold text-amber-600">
                    รอการอนุมัติ
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-background-subtle rounded-xl p-4 mb-6">
            <div className="flex items-center justify-center gap-2 text-foreground-subtle">
              <span className="text-sm">กำลังรอการตอบกลับ...</span>
            </div>
          </div>

          <div className="bg-amber-50 rounded-lg p-3 mb-6 border border-amber-200">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 text-left">
                หน้านี้จะอัปเดตอัตโนมัติเมื่อนักลงทุนตอบกลับ
                คุณสามารถกลับมาตรวจสอบสถานะได้ทุกเมื่อ
              </p>
            </div>
          </div>

          <button
            onClick={handleGoToContracts}
            className="w-full bg-primary text-primary-fg rounded-full py-4 font-medium transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    </div>
  );
}
