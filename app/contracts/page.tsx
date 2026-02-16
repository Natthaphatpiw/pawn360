'use client';

import React, { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';

interface ContractItem {
  item_id: string;
  item_type: string;
  brand: string;
  model: string;
  capacity: string | null;
  estimated_value: number;
  item_condition: number;
  image_urls: string[];
}

interface Contract {
  contract_id: string;
  contract_number: string;
  contract_start_date: string;
  contract_end_date: string;
  contract_duration_days: number;
  loan_principal_amount: number;
  interest_rate: number;
  interest_amount: number;
  total_amount: number;
  amount_paid: number;
  contract_status: string;
  funding_status: string;
  items: ContractItem;
  remainingDays: number;
  displayStatus: string;
}

export default function PawnerContractList() {
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);

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

    const session = getPinSession('PAWNER', profile.userId);
    if (session?.token) {
      setPinVerified(true);
      fetchContracts();
    } else {
      setPinVerified(false);
      setPinModalOpen(true);
      setLoading(false);
    }
  }, [liffLoading, liffError, profile?.userId]);

  const fetchContracts = async () => {
    try {
      if (!profile?.userId) return;

      // Fetch customer info first
      const customerResponse = await axios.get(`/api/pawners/check?lineId=${profile.userId}`);
      if (customerResponse.data.exists && customerResponse.data.pawner) {
        const pawner = customerResponse.data.pawner;
        setUserName(`${pawner.firstname} ${pawner.lastname}`);
      }

      // Fetch contracts
      const response = await axios.get(`/api/contracts/by-customer?lineId=${profile.userId}`);

      if (response.data.success) {
        setContracts(response.data.contracts);
      }
    } catch (error: any) {
      console.error('Error fetching contracts:', error);
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear() + 543; // BE
    return `${day}/${month}/${year}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ปกติ':
        return { text: 'ปกติ', bg: 'bg-[#E8F5E9]', textCol: 'text-[#4CAF50]' };
      case 'ครบกำหนด':
        return { text: 'ครบกำหนด', bg: 'bg-[#FFEBEE]', textCol: 'text-[#EF5350]' };
      case 'ใกล้ครบกำหนด':
        return { text: 'ใกล้ครบกำหนด', bg: 'bg-[#FFF3E0]', textCol: 'text-[#FF9800]' };
      case 'เสร็จสิ้น':
        return { text: 'เสร็จสิ้น', bg: 'bg-gray-100', textCol: 'text-gray-600' };
      case 'รอรับนักลงทุน':
        return { text: 'รอรับนักลงทุน', bg: 'bg-[#E3F2FD]', textCol: 'text-[#1E88E5]' };
      case 'รอการโอนเงิน':
        return { text: 'รอการโอนเงิน', bg: 'bg-[#FFF8E1]', textCol: 'text-[#F59E0B]' };
      case 'รอยืนยันรับเงิน':
        return { text: 'รอยืนยันรับเงิน', bg: 'bg-[#FFF8E1]', textCol: 'text-[#F59E0B]' };
      case 'รอส่งสินค้า':
        return { text: 'รอส่งสินค้า', bg: 'bg-[#F3E8FF]', textCol: 'text-[#7C3AED]' };
      case 'รอนำส่งสินค้า':
        return { text: 'รอนำส่งสินค้า', bg: 'bg-[#F3E8FF]', textCol: 'text-[#7C3AED]' };
      case 'กำลังนำส่งสินค้า':
        return { text: 'กำลังนำส่งสินค้า', bg: 'bg-[#E0F2F1]', textCol: 'text-[#00897B]' };
      case 'กำลังขนส่ง':
        return { text: 'กำลังขนส่ง', bg: 'bg-[#E0F2F1]', textCol: 'text-[#00897B]' };
      case 'รอตรวจสอบสินค้า':
        return { text: 'รอตรวจสอบสินค้า', bg: 'bg-[#E0F7FA]', textCol: 'text-[#00838F]' };
      case 'ยกเลิก':
        return { text: 'ยกเลิก', bg: 'bg-gray-100', textCol: 'text-gray-500' };
      case 'ขายทอดตลาด':
        return { text: 'ขายทอดตลาด', bg: 'bg-[#FCE4EC]', textCol: 'text-[#AD1457]' };
      case 'เกินกำหนด':
        return { text: 'เกินกำหนด', bg: 'bg-[#FFEBEE]', textCol: 'text-[#EF5350]' };
      case 'ส่งคืน':
        return { text: 'ส่งคืน', bg: 'bg-gray-100', textCol: 'text-gray-500' };
      default:
        return { text: status, bg: 'bg-gray-100', textCol: 'text-gray-500' };
    }
  };

  const getItemName = (item: ContractItem) => {
    if (item.capacity) {
      return `${item.brand} ${item.model} ${item.capacity}`;
    }
    return `${item.brand} ${item.model}`;
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

  if (!pinVerified) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-md w-full text-center">
          <h2 className="text-lg font-bold text-gray-800">ยืนยัน PIN ก่อนเข้าดูรายการ</h2>
          <p className="text-sm text-gray-500 mt-2">
            เพื่อความปลอดภัย กรุณายืนยัน PIN 6 หลักก่อนดูรายการสัญญา
          </p>
          <button
            type="button"
            onClick={() => setPinModalOpen(true)}
            className="mt-4 w-full rounded-2xl bg-[#C0562F] py-3 text-sm font-bold text-white"
          >
            ยืนยัน PIN
          </button>
        </div>

        {profile?.userId && (
          <PinModal
            open={pinModalOpen}
            role="PAWNER"
            lineId={profile.userId}
            onClose={() => setPinModalOpen(false)}
            onVerified={() => {
              setPinVerified(true);
              setPinModalOpen(false);
              fetchContracts();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans px-4 py-6 flex flex-col">

      {/* Header */}
      <div className="mb-4 flex justify-between items-end">
        <div>
          <h1 className="text-xl font-bold text-gray-800 leading-tight">รายการสัญญาจำนำ</h1>
          <p className="text-gray-500 text-sm font-light mt-1">
            {userName || profile?.displayName || 'ผู้ใช้'}
          </p>
        </div>
        <div className="text-gray-400 text-xs font-light mb-1">
          ทั้งหมด {contracts.length} รายการ
        </div>
      </div>

      {/* List Container */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-24 no-scrollbar">
        {contracts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">ไม่มีรายการสัญญาจำนำ</p>
          </div>
        ) : (
          contracts.map((contract) => {
            const status = getStatusBadge(contract.displayStatus);
            return (
              <div
                key={contract.contract_id}
                className="bg-white rounded-2xl p-5 shadow-sm relative cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/contracts/${contract.contract_id}`)}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-800 text-lg">
                    {getItemName(contract.items)}
                  </h3>
                  <span className="text-gray-400 text-xs font-light">{contract.contract_number}</span>
                </div>

                <div className="space-y-1 mb-1">
                  <div className="text-gray-500 text-sm">
                    มูลค่า: <span className="text-gray-700">{contract.loan_principal_amount.toLocaleString()} บาท</span>
                  </div>
                  <div className="text-gray-500 text-sm">
                    วันครบกำหนด: <span className="text-gray-700">{formatDate(contract.contract_end_date)}</span>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex justify-end mt-2">
                  <span className={`${status.bg} ${status.textCol} text-xs font-bold px-4 py-1.5 rounded-full`}>
                    {status.text}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-transparent p-4 flex flex-col gap-3 max-w-md mx-auto w-full">
        <button
          onClick={() => router.push('/contracts/actions')}
          className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-2xl py-3 flex flex-col items-center justify-center transition-colors shadow-sm active:scale-[0.98]"
        >
          <span className="text-base font-bold">สถานะคำขอ</span>
          <span className="text-[10px] opacity-70 font-light">Request status</span>
        </button>
        {/* Pawn Entry Button */}
        <button
          onClick={() => router.push('/estimate')}
          className="w-full bg-[#F9EFE6] hover:bg-[#F0E0D0] text-[#A0522D] rounded-2xl py-3 flex flex-col items-center justify-center transition-colors shadow-sm active:scale-[0.98]"
        >
          <span className="text-base font-bold">จำนำสินค้า</span>
          <span className="text-[10px] opacity-80 font-light">Pawn entry</span>
        </button>
      </div>

    </div>
  );
}
