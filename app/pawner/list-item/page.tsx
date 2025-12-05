'use client';

import React, { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface Contract {
  contract_id: string;
  contract_number: string;
  item_name: string;
  loan_principal_amount: number;
  contract_end_date: string;
  contract_status: string;
}

export default function PawnerContractList() {
  const { profile, isLoading: liffLoading } = useLiff();
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [pawnerName, setPawnerName] = useState('');

  useEffect(() => {
    const fetchContracts = async () => {
      if (!profile?.userId) return;

      try {
        // Get pawner info
        const pawnerResponse = await axios.get(`/api/pawners/check?lineId=${profile.userId}`);
        if (!pawnerResponse.data.exists) {
          router.push('/register');
          return;
        }

        const pawner = pawnerResponse.data.pawner;
        setPawnerName(`${pawner.firstname} ${pawner.lastname}`);

        // Get contracts
        const contractsResponse = await axios.get(`/api/pawners/contracts?customerId=${pawner.customer_id}`);
        setContracts(contractsResponse.data.contracts || []);
      } catch (error) {
        console.error('Error fetching contracts:', error);
      } finally {
        setLoading(false);
      }
    };

    if (profile?.userId) {
      fetchContracts();
    }
  }, [profile?.userId, router]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear() + 543;
    return `${day}/${month}/${year}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return { text: 'ปกติ', bg: 'bg-[#E8F5E9]', textCol: 'text-[#4CAF50]' };
      case 'COMPLETED':
        return { text: 'สิ้นสุดแล้ว', bg: 'bg-[#F5F5F5]', textCol: 'text-[#9E9E9E]' };
      case 'DEFAULTED':
        return { text: 'ครบกำหนด', bg: 'bg-[#FFEBEE]', textCol: 'text-[#EF5350]' };
      default:
        return { text: status, bg: 'bg-gray-100', textCol: 'text-gray-500' };
    }
  };

  // Check remaining days and set status
  const getContractStatus = (contract: Contract) => {
    const endDate = new Date(contract.contract_end_date);
    const today = new Date();
    const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (contract.contract_status === 'COMPLETED') {
      return { text: 'สิ้นสุดแล้ว', bg: 'bg-[#F5F5F5]', textCol: 'text-[#9E9E9E]' };
    }

    if (daysRemaining < 0) {
      return { text: 'ครบกำหนด', bg: 'bg-[#FFEBEE]', textCol: 'text-[#EF5350]' };
    }

    if (daysRemaining <= 7) {
      return { text: 'ใกล้ครบกำหนด', bg: 'bg-[#FFF3E0]', textCol: 'text-[#FF9800]' };
    }

    return { text: 'ปกติ', bg: 'bg-[#E8F5E9]', textCol: 'text-[#4CAF50]' };
  };

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C0562F]"></div>
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
            {pawnerName}
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
            <p className="text-gray-400">ยังไม่มีรายการสัญญาจำนำ</p>
          </div>
        ) : (
          contracts.map((contract) => {
            const status = getContractStatus(contract);
            return (
              <div 
                key={contract.contract_id} 
                onClick={() => router.push(`/pawner/contract/${contract.contract_id}`)}
                className="bg-white rounded-2xl p-5 shadow-sm relative cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-800 text-lg">{contract.item_name}</h3>
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
        {/* Pawn Entry Button */}
        <button 
          onClick={() => router.push('/estimate')}
          className="w-full bg-[#F9EFE6] hover:bg-[#F0E0D0] text-[#A0522D] rounded-2xl py-3 flex flex-col items-center justify-center transition-colors shadow-sm active:scale-[0.98]"
        >
          <span className="text-base font-bold">จำนำสินค้า</span>
          <span className="text-[10px] opacity-80 font-light">Pawn entry</span>
        </button>
        
        {/* Contract List Button (Active State) */}
        <button 
          onClick={() => router.push('/register')}
          className="w-full bg-white border border-[#C08D6E] hover:bg-gray-50 text-[#C0562F] rounded-2xl py-3 flex flex-col items-center justify-center transition-colors shadow-sm active:scale-[0.98]"
        >
          <span className="text-base font-bold">หน้าหลัก</span>
          <span className="text-[10px] opacity-80 font-light">Home</span>
        </button>
      </div>

    </div>
  );
}
