'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import axios from 'axios';
import { ChevronLeft } from 'lucide-react';

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
  const requestId = params.requestId as string;
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (requestId) {
      fetchRequest();
    }
  }, [requestId]);

  const fetchRequest = async () => {
    try {
      setLoading(true);
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
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C0562F]"></div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold text-lg mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-red-600">{error || 'ไม่พบข้อมูลคำขอ'}</p>
        </div>
      </div>
    );
  }

  const contract = request.contract;
  const item = contract?.items;
  const itemName = item?.capacity
    ? `${item.brand} ${item.model} ${item.capacity}`
    : `${item?.brand || ''} ${item?.model || ''}`.trim();

  const amount = request.request_type === 'PRINCIPAL_INCREASE'
    ? request.increase_amount
    : request.request_type === 'PRINCIPAL_REDUCTION'
      ? request.reduction_amount
      : request.interest_to_pay || request.total_amount;

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans px-4 py-6 flex flex-col">
      <div className="mb-4 flex items-center gap-3">
        <ChevronLeft
          className="w-6 h-6 text-gray-700 cursor-pointer"
          onClick={() => router.push('/contracts/actions')}
        />
        <div>
          <h1 className="text-xl font-bold text-gray-800">รายละเอียดคำขอ</h1>
          <p className="text-gray-500 text-xs">Action Detail</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">ประเภทคำขอ:</span>
          <span className="font-bold text-gray-800">
            {actionTypeLabel[request.request_type] || request.request_type}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">สถานะ:</span>
          <span className="font-bold text-[#B85C38]">
            {statusLabel[request.request_status] || request.request_status}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">จำนวนเงิน:</span>
          <span className="font-bold text-gray-800">
            {(amount || 0).toLocaleString()} บาท
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">เลขสัญญา:</span>
          <span className="font-bold text-gray-800">{contract?.contract_number || '-'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">สินค้า:</span>
          <span className="font-bold text-gray-800">{itemName || '-'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">วันที่ทำรายการ:</span>
          <span className="font-bold text-gray-800">{formatDateTime(request.created_at)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">อัปเดตล่าสุด:</span>
          <span className="font-bold text-gray-800">{formatDateTime(request.updated_at)}</span>
        </div>
      </div>
    </div>
  );
}
