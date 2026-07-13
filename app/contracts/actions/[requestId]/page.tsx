'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { getMockActionRequestById, getMockContractsEnabled } from '@/lib/mock-contracts';
import { getMockPrincipalIncreaseRequest, isPreviewMode, withPreview } from '../../[contractId]/_lib/preview';

const actionTypeLabel: Record<string, string> = {
  PRINCIPAL_INCREASE: 'เพิ่มเงินต้น',
  PRINCIPAL_REDUCTION: 'ลดเงินต้น',
  INTEREST_PAYMENT: 'ต่อดอกเบี้ย',
};

const statusLabel: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  AWAITING_PAYMENT: 'รอชำระเงิน',
  SLIP_UPLOADED: 'ส่งสลิปแล้ว',
  SLIP_VERIFIED: 'สลิปผ่านแล้ว',
  SLIP_REJECTED: 'สลิปไม่ผ่าน',
  SLIP_REJECTED_FINAL: 'สลิปไม่ผ่าน (ปิดงาน)',
  AWAITING_SIGNATURE: 'กำลังยืนยันรายการ',
  PENDING_INVESTOR_APPROVAL: 'รอนักลงทุนอนุมัติ',
  AWAITING_INVESTOR_APPROVAL: 'รอนักลงทุนอนุมัติ',
  INVESTOR_APPROVED: 'นักลงทุนอนุมัติแล้ว',
  INVESTOR_REJECTED: 'นักลงทุนปฏิเสธ',
  AWAITING_INVESTOR_PAYMENT: 'รอนักลงทุนโอนเงิน',
  INVESTOR_SLIP_UPLOADED: 'นักลงทุนส่งสลิปแล้ว',
  INVESTOR_SLIP_VERIFIED: 'สลิปนักลงทุนผ่านแล้ว',
  INVESTOR_SLIP_REJECTED: 'สลิปนักลงทุนไม่ผ่าน',
  INVESTOR_SLIP_REJECTED_FINAL: 'สลิปนักลงทุนไม่ผ่าน (ปิดงาน)',
  INVESTOR_TRANSFERRED: 'นักลงทุนโอนแล้ว',
  AWAITING_PAWNER_CONFIRM: 'รอผู้ขอสินเชื่อยืนยัน',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก',
  VOIDED: 'โมฆะ',
};

const principalIncreaseWaitingStatuses = new Set([
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
]);

const formatDateTime = (dateString?: string) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear() + 543;
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

export default function ActionStatusDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const requestId = params.requestId as string;
  const mockMode = getMockContractsEnabled();
  const previewMode = isPreviewMode(searchParams);
  const previewStatus = searchParams.get('status');
  const previewContractId = searchParams.get('contractId') || 'mock-contract-001';
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (requestId) {
      fetchRequest();
    }
  }, [requestId, mockMode, previewMode, previewStatus, previewContractId]);

  const fetchRequest = async () => {
    try {
      setLoading(true);
      if (mockMode) {
        const mockRequest = await getMockActionRequestById(requestId);
        if (!mockRequest && previewMode && requestId.startsWith('preview-principal-increase-')) {
          const previewRequest = getMockPrincipalIncreaseRequest(requestId, previewContractId);
          setRequest({
            ...previewRequest,
            request_type: 'PRINCIPAL_INCREASE',
            request_status: previewStatus || previewRequest.request_status,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          setError(null);
          return;
        }
        setRequest(mockRequest);
        setError(mockRequest ? null : 'ไม่พบข้อมูลคำขอ');
        return;
      }
      const response = await axios.get(`/api/contract-actions/${requestId}`);
      if (response.data.success) {
        setRequest(response.data.request);
      }
    } catch (err: any) {
      console.error('Error fetching action request:', err);
      setError(err.response?.data?.error || 'ไม่สามารถโหลดรายละเอียดได้');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen bg-background-white flex items-center justify-center p-4">
        <div className="max-w-md rounded-xl border border-error-border bg-error-soft p-4 text-error shadow-soft">
          <h2 className="mb-2 text-lg font-semibold">เกิดข้อผิดพลาด</h2>
          <p>{error || 'ไม่พบข้อมูลคำขอ'}</p>
        </div>
      </div>
    );
  }

  const contract = request.contract;
  const item = contract?.items;
  const itemName = item?.capacity
    ? `${item.brand} ${item.model} ${item.capacity}`
    : `${[item?.brand, item?.model].filter(Boolean).join(' ') || '-'}`.trim();

  const amount = request.request_type === 'PRINCIPAL_INCREASE'
    ? request.increase_amount
    : request.request_type === 'PRINCIPAL_REDUCTION'
      ? request.reduction_amount
      : request.interest_to_pay || request.total_amount;
  const principalIncreaseContractId = request.contract_id || contract?.contract_id;
  const contractId = request.contract_id || contract?.contract_id;
  const canViewPrincipalIncreaseWaiting =
    request.request_type === 'PRINCIPAL_INCREASE' &&
    principalIncreaseContractId &&
    principalIncreaseWaitingStatuses.has(request.request_status) &&
    !['AWAITING_PAYMENT', 'SLIP_REJECTED'].includes(request.request_status);
  const isWaitingForSlipUpload = ['AWAITING_PAYMENT', 'SLIP_REJECTED'].includes(request.request_status);
  const isWaitingForPostSlipProcessing = ['AWAITING_SIGNATURE', 'SLIP_VERIFIED'].includes(request.request_status);
  const uploadPathByType: Record<string, string> = {
    PRINCIPAL_INCREASE: 'principal-increase/upload',
    PRINCIPAL_REDUCTION: 'principal-reduction/upload',
    INTEREST_PAYMENT: 'interest-payment/upload',
  };
  const signPathByType: Record<string, string> = {
    PRINCIPAL_REDUCTION: 'principal-reduction/sign',
    INTEREST_PAYMENT: 'interest-payment/sign',
  };
  const uploadPath =
    contractId && uploadPathByType[request.request_type]
      ? `/contracts/${contractId}/${uploadPathByType[request.request_type]}?requestId=${requestId}`
      : null;
  const signPath =
    contractId && signPathByType[request.request_type]
      ? `/contracts/${contractId}/${signPathByType[request.request_type]}?requestId=${requestId}`
      : null;
  const nextWaitingPath =
    previewMode && principalIncreaseContractId
      ? withPreview(
        `/contracts/${principalIncreaseContractId}/principal-increase/waiting`,
        'requestId',
        requestId
      ) + `&status=${request.request_status}`
      : principalIncreaseContractId
        ? `/contracts/${principalIncreaseContractId}/principal-increase/waiting?requestId=${requestId}&status=${request.request_status}`
        : null;
  const nextUploadPath =
    previewMode && contractId && uploadPathByType[request.request_type]
      ? withPreview(
        `/contracts/${contractId}/${uploadPathByType[request.request_type]}`,
        'requestId',
        requestId
      )
      : uploadPath;
  const nextSignPath =
    previewMode && contractId && signPathByType[request.request_type]
      ? withPreview(
        `/contracts/${contractId}/${signPathByType[request.request_type]}`,
        'requestId',
        requestId
      )
      : signPath;
  const canConfirmReceiving =
    request.request_type === 'PRINCIPAL_INCREASE' &&
    request.request_status === 'INVESTOR_SLIP_UPLOADED' &&
    Boolean(nextWaitingPath);

  return (
    <div className="min-h-screen bg-background-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <div className="mb-5 rounded-xl border border-primary-border bg-primary-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
            <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/40">
              Request Status
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-primary">
              รายละเอียดคำขอ
            </div>
          </div>
        </div>

        <div className="mb-4 p-4 rounded-lg bg-background-subtle space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-foreground-subtle">ประเภทคำขอ:</span>
            <span className="font-medium text-foreground">
              {actionTypeLabel[request.request_type] || request.request_type}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-foreground-subtle">สถานะ:</span>
            <span className="font-medium text-primary">
              {statusLabel[request.request_status] || request.request_status}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-foreground-subtle">จำนวนเงิน:</span>
            <span className="font-medium text-foreground">
              {(amount || 0).toLocaleString()} บาท
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-foreground-subtle">เลขสัญญา:</span>
            <span className="font-medium text-foreground">{contract?.contract_number || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-foreground-subtle">สินค้า:</span>
            <span className="font-medium text-foreground">{itemName || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-foreground-subtle">วันที่ทำรายการ:</span>
            <span className="font-medium text-foreground">{formatDateTime(request.created_at)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-foreground-subtle">อัปเดตล่าสุด:</span>
            <span className="font-medium text-foreground">{formatDateTime(request.updated_at)}</span>
          </div>
        </div>

        {canConfirmReceiving && (
          <button
            onClick={() => router.push(nextWaitingPath!)}
            className="w-full rounded-full bg-primary py-4 text-sm font-medium text-white transition-colors hover:bg-primary/80"
          >
            ไปหน้ายืนยันรับเงิน
          </button>
        )}

        {!canConfirmReceiving && canViewPrincipalIncreaseWaiting && nextWaitingPath && (
          <button
            onClick={() => router.push(nextWaitingPath)}
            className="w-full rounded-full bg-primary py-4 text-sm font-medium text-white transition-colors hover:bg-primary/80"
          >
            ดูรายละเอียดและสถานะคำขอ
          </button>
        )}

        {isWaitingForSlipUpload && nextUploadPath && (
          <button
            onClick={() => router.push(nextUploadPath)}
            className="mt-3 w-full rounded-full bg-primary py-4 text-sm font-medium text-white transition-colors hover:bg-primary/80"
          >
            อัปโหลดสลิป
          </button>
        )}

        {isWaitingForPostSlipProcessing && nextSignPath && (
          <button
            onClick={() => router.push(nextSignPath)}
            className="mt-3 w-full rounded-full bg-primary py-4 text-sm font-medium text-white transition-colors hover:bg-primary/80"
          >
            ดูผลการทำรายการ
          </button>
        )}
      </div>
    </div>
  );
}
