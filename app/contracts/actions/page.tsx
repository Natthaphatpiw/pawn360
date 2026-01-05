'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import { ChevronLeft } from 'lucide-react';

interface ActionItem {
  request_id: string;
  request_type: string;
  request_status: string;
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
  AWAITING_SIGNATURE: 'รอเซ็นสัญญา',
  PENDING_INVESTOR_APPROVAL: 'รอส่งให้นักลงทุน',
  AWAITING_INVESTOR_APPROVAL: 'รอนักลงทุนอนุมัติ',
  INVESTOR_APPROVED: 'นักลงทุนอนุมัติแล้ว',
  INVESTOR_REJECTED: 'นักลงทุนปฏิเสธ',
  AWAITING_INVESTOR_PAYMENT: 'รอนักลงทุนโอนเงิน',
  INVESTOR_SLIP_UPLOADED: 'นักลงทุนส่งสลิปแล้ว',
  INVESTOR_SLIP_VERIFIED: 'สลิปนักลงทุนผ่านแล้ว',
  INVESTOR_SLIP_REJECTED: 'สลิปนักลงทุนไม่ผ่าน',
  INVESTOR_SLIP_REJECTED_FINAL: 'สลิปนักลงทุนไม่ผ่าน (ปิดงาน)',
  INVESTOR_TRANSFERRED: 'นักลงทุนโอนแล้ว',
  AWAITING_PAWNER_CONFIRM: 'รอผู้จำนำยืนยัน',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก',
  VOIDED: 'โมฆะ',
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
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ActionItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [liffLoading, liffError, profile?.userId]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
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
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C0562F]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold text-lg mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans px-4 py-6 flex flex-col">
      <div className="mb-4 flex items-center gap-3">
        <ChevronLeft
          className="w-6 h-6 text-gray-700 cursor-pointer"
          onClick={() => router.push('/contracts')}
        />
        <div>
          <h1 className="text-xl font-bold text-gray-800">สถานะคำขอทั้งหมด</h1>
          <p className="text-gray-500 text-xs">Action Status</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pb-20 no-scrollbar">
        {requests.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">ยังไม่มีคำขอรายการ</p>
          </div>
        ) : (
          requests.map((req) => {
            const item = req.contract?.items;
            const itemName = item?.capacity
              ? `${item.brand} ${item.model} ${item.capacity}`
              : `${item?.brand || ''} ${item?.model || ''}`.trim();
            const amount = getAmountLabel(req);
            return (
              <div
                key={req.request_id}
                className="bg-white rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/contracts/actions/${req.request_id}`)}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-800 text-lg">
                    {actionTypeLabel[req.request_type] || req.request_type}
                  </h3>
                  <span className="text-gray-400 text-xs font-light">
                    {req.contract?.contract_number || '-'}
                  </span>
                </div>

                <div className="text-gray-500 text-sm mb-1">
                  รายการ: <span className="text-gray-700">{itemName || '-'}</span>
                </div>
                <div className="text-gray-500 text-sm mb-1">
                  จำนวนเงิน: <span className="text-gray-700">{amount.toLocaleString()} บาท</span>
                </div>
                <div className="text-gray-500 text-sm">
                  วันที่ทำรายการ: <span className="text-gray-700">{formatDate(req.created_at)}</span>
                </div>

                <div className="flex justify-end mt-3">
                  <span className="bg-gray-100 text-gray-600 text-xs font-bold px-4 py-1.5 rounded-full">
                    {statusLabel[req.request_status] || req.request_status}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
