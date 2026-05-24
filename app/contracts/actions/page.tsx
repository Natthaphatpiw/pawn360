'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import { getMockActionRequests, getMockContractsEnabled } from '@/lib/mock-contracts';
import { withPreview } from '../[contractId]/_lib/preview';

interface ActionItem {
  request_id: string;
  request_type: string;
  request_status: string;
  preview_status?: string;
  preview_note?: string;
  investor_name?: string;
  transfer_due_at?: string;
  increase_amount?: number | null;
  reduction_amount?: number | null;
  interest_to_pay?: number | null;
  interest_for_period?: number | null;
  total_amount?: number | null;
  created_at: string;
  contract?: {
    contract_id: string;
    contract_number: string;
    items?: {
      item_id: string;
      brand: string;
      model: string;
      capacity?: string | null;
      image_urls?: string[];
    } | null;
  } | null;
}

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

const getListDisplayStatus = (item: ActionItem) => {
  switch (item.request_status) {
    case 'AWAITING_PAYMENT':
    case 'SLIP_REJECTED':
      return 'รอผู้ขอสินเชื่ออัปโหลดสลิป';
    case 'PENDING_INVESTOR_APPROVAL':
    case 'AWAITING_INVESTOR_APPROVAL':
    case 'INVESTOR_APPROVED':
    case 'AWAITING_INVESTOR_PAYMENT':
    case 'INVESTOR_SLIP_UPLOADED':
    case 'INVESTOR_SLIP_VERIFIED':
      return 'รอนักลงทุนโอนเงิน';
    case 'INVESTOR_TRANSFERRED':
    case 'AWAITING_PAWNER_CONFIRM':
      return 'รอผู้ขอสินเชื่อยืนยันรับเงิน';
    default:
      return null;
  }
};

const principalIncreasePreviewStatuses = [
  'PENDING_INVESTOR_APPROVAL',
  'INVESTOR_REJECTED',
  'AWAITING_PAYMENT',
  'INVESTOR_TRANSFERRED',
  'COMPLETED',
] as const;

const principalIncreasePreviewStatusNote: Record<string, string> = {
  PENDING_INVESTOR_APPROVAL: 'คำขอถูกส่งแล้ว รอให้นักลงทุนพิจารณา',
  INVESTOR_REJECTED: 'นักลงทุนปฏิเสธคำขอพร้อมเหตุผลประกอบ',
  AWAITING_PAYMENT: 'อนุมัติแล้วและรอผู้ขอสินเชื่ออัปโหลดสลิปดอกเบี้ย',
  INVESTOR_TRANSFERRED: 'นักลงทุนโอนเงินเพิ่มให้แล้ว รอยืนยันรับเงิน',
  COMPLETED: 'รายการสำเร็จ เงินต้นใหม่มีผลแล้ว',
};

const getAmountLabel = (item: ActionItem) => {
  if (item.request_type === 'PRINCIPAL_INCREASE') {
    return item.increase_amount ?? 0;
  }
  if (item.request_type === 'PRINCIPAL_REDUCTION') {
    return item.reduction_amount ?? 0;
  }
  if (item.request_type === 'INTEREST_PAYMENT') {
    return item.interest_to_pay ?? item.total_amount ?? 0;
  }
  return item.total_amount ?? 0;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear() + 543;
  return `${day}/${month}/${year}`;
};

export default function ActionStatusListPage() {
  const router = useRouter();
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const mockMode = getMockContractsEnabled();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ActionItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const previewPrincipalIncreaseRequests: ActionItem[] = mockMode
    ? principalIncreasePreviewStatuses.map((status, index) => ({
        request_id: `preview-principal-increase-${index + 1}`,
        request_type: 'PRINCIPAL_INCREASE',
        request_status: status,
        preview_status: status,
        preview_note: principalIncreasePreviewStatusNote[status],
        investor_name: status === 'PENDING_INVESTOR_APPROVAL' ? 'Investor Demo' : 'คุณนักลงทุนตัวอย่าง',
        transfer_due_at: new Date(Date.now() + (index + 1) * 60 * 60 * 1000).toISOString(),
        increase_amount: 3000,
        total_amount: 400,
        created_at: new Date(Date.now() - (index + 1) * 60 * 60 * 1000).toISOString(),
        contract: {
          contract_id: 'mock-contract-001',
          contract_number: `CT-MOCK-PI-${index + 1}`,
          items: {
            item_id: `mock-pi-item-${index + 1}`,
            brand: 'Apple',
            model: 'iPhone 13',
            capacity: '128GB',
            image_urls: [],
          },
        },
      }))
    : [];

  const actionRequests = mockMode ? [...previewPrincipalIncreaseRequests, ...requests] : requests;

  const pendingRequests = actionRequests.filter((req) => Boolean(getListDisplayStatus(req)));

  useEffect(() => {
    if (mockMode) {
      fetchRequests();
      return;
    }

    if (liffLoading) return;

    if (liffError) {
      setError('ไม่สามารถเชื่อมต่อ LINE LIFF ได้ กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
      return;
    }

    if (!profile?.userId) {
      setError('ไม่พบ LINE profile กรุณาเปิดลิงก์ผ่าน LINE LIFF');
      setLoading(false);
      return;
    }

    fetchRequests();
  }, [liffLoading, liffError, profile?.userId, mockMode]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      if (mockMode) {
        const mockRequests = await getMockActionRequests();
        setRequests(mockRequests);
        return;
      }
      const response = await axios.get(`/api/contract-actions/by-pawner?lineId=${profile?.userId}`);
      if (response.data.success) {
        setRequests(response.data.requests);
      }
    } catch (err) {
      console.error('Error fetching action requests:', err);
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background-white flex items-center justify-center p-4">
        <div className="max-w-md rounded-3xl border border-error-border bg-error-soft p-6 text-error shadow-soft">
          <h2 className="mb-2 text-lg font-semibold">เกิดข้อผิดพลาด</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col">

      {/* Contract Header */}
        <div className="mb-5 rounded-xl border border-primary-border bg-primary-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
            <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/40">
              Request Status
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-primary">
                  สถานะคำขอ
                </div>
              </div>
            </div>
          </div>
        </div>

      <div className="flex-1 space-y-3 pb-20 no-scrollbar">
        {pendingRequests.length === 0 ? (
          <div className="rounded-[28px] border border-line-soft bg-background p-8 text-center shadow-soft">
            <p className="text-foreground-subtle">ไม่มีคำขอที่รอดำเนินการ</p>
          </div>
        ) : (
          pendingRequests.map((req) => {
            const item = req.contract?.items;
            const itemName = item?.capacity
              ? `${item.brand} ${item.model} ${item.capacity}`
              : `${[item?.brand, item?.model].filter(Boolean).join(' ') || '-'}`.trim();
            const amount = getAmountLabel(req);
            const displayStatus = getListDisplayStatus(req);
            return (
              <div
                key={req.request_id}
                className="hover-card cursor-pointer rounded-lg border border-primary-border bg-primary-soft/50 p-4 shadow-soft transition-colors hover:bg-primary-soft/80"
                onClick={() => {
                  if (mockMode && req.preview_status && req.contract?.contract_id) {
                    router.push(withPreview(
                      `/contracts/actions/${req.request_id}`,
                      'status',
                      req.preview_status
                    ) + `&contractId=${req.contract.contract_id}`);
                    return;
                  }
                  router.push(`/contracts/actions/${req.request_id}`);
                }}
              >
                <div className="flex items-center justify-between gap-3 flex-nowrap mb-2">
                  <h3 className="min-w-0 flex-1 truncate whitespace-nowrap text-md font-medium text-foreground">
                    {actionTypeLabel[req.request_type] || req.request_type}
                  </h3>
                  <div className="shrink-0 rounded-full bg-background-white px-3 py-1 text-center text-xs font-medium text-primary">
                    {displayStatus}
                  </div>
                </div>

                <div className="space-y-1 mb-1">
                  <div className="text-sm text-foreground-subtle">
                    รายการ: <span className="text-foreground-muted">{itemName || '-'}</span>
                  </div>
                  <div className="text-sm text-foreground-subtle">
                    จำนวนเงิน: <span className="text-foreground-muted">{amount.toLocaleString()} บาท</span>
                  </div>
                  <div className="text-sm text-foreground-subtle">
                    วันที่ทำรายการ: <span className="text-foreground-muted">{formatDate(req.created_at)}</span>
                  </div>
                  {req.preview_note && (
                    <div className="text-sm text-foreground-subtle">
                      หมายเหตุ: <span className="text-foreground-muted">{req.preview_note}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 w-full rounded-full bg-primary/20 px-3 py-1 text-center text-xs font-light text-primary">
                  {mockMode && req.preview_status
                    ? `Preview: ${statusLabel[req.preview_status] || req.preview_status}`
                    : req.contract?.contract_number || '-'}
                </div>
              </div>
            );
          })
        )}
      </div>
      </div>
    </div>
  );
}
