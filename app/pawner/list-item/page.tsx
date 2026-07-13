'use client';

import { useState, useEffect } from 'react';
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

  // Check remaining days and set status
  const getContractStatus = (contract: Contract) => {
    const endDate = new Date(contract.contract_end_date);
    const today = new Date();
    const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (contract.contract_status === 'COMPLETED') {
      return { text: 'สิ้นสุดแล้ว', bg: 'bg-s1-soft', textCol: 'text-foreground-subtle' };
    }

    if (daysRemaining < 0) {
      return { text: 'ครบกำหนด', bg: 'bg-error-soft', textCol: 'text-error' };
    }

    if (daysRemaining <= 7) {
      return { text: 'ใกล้ครบกำหนด', bg: 'bg-warning-soft', textCol: 'text-warning' };
    }

    return { text: 'ปกติ', bg: 'bg-success-soft', textCol: 'text-success' };
  };

  if (liffLoading || loading) {
    return (
      <div className="theme-liff min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="theme-liff min-h-screen bg-white font-sans px-4 py-6 flex flex-col items-center page-pawner">
      <div className="w-full max-w-sm rounded-[28px] border border-primary-border/60 bg-gradient-to-br from-white via-[#fff0e9]/40 to-[#ffc5b0]/30 p-4 shadow-[0_14px_30px_rgba(219,71,16,0.12)]">
        <div className="rounded-[24px] border border-white/80 bg-white/90 px-4 py-4 shadow-[0_8px_18px_rgba(219,71,16,0.08)]">
          {/* Header */}
          <div className="mb-4 flex justify-between items-end">
            <div>
              <h1 className="text-xl font-bold text-foreground leading-tight">รายการสัญญาสินเชื่อ</h1>
              <p className="text-foreground-subtle text-sm font-light mt-1">
                {pawnerName}
              </p>
            </div>
            <div className="text-foreground-subtle text-xs font-light mb-1">
              ทั้งหมด {contracts.length} รายการ
            </div>
          </div>

          {/* List Container */}
          <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1 no-scrollbar">
            {contracts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-foreground-subtle">ยังไม่มีรายการสัญญาสินเชื่อ</p>
              </div>
            ) : (
              contracts.map((contract) => {
                const status = getContractStatus(contract);
                return (
                  <div
                    key={contract.contract_id}
                    onClick={() => router.push(`/pawner/contract/${contract.contract_id}`)}
                    className="rounded-[22px] border border-primary-border/40 bg-white/90 p-4 shadow-[0_8px_18px_rgba(219,71,16,0.08)] relative cursor-pointer transition-all hover:-translate-y-[1px] active:scale-[0.99]"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-foreground text-base leading-tight pr-2">{contract.item_name}</h3>
                      <span className="text-foreground-subtle text-[10px] font-light whitespace-nowrap">{contract.contract_number}</span>
                    </div>

                    <div className="space-y-1 mb-1">
                      <div className="text-foreground-subtle text-sm">
                        มูลค่า: <span className="text-foreground">{contract.loan_principal_amount.toLocaleString()} บาท</span>
                      </div>
                      <div className="text-foreground-subtle text-sm">
                        วันครบกำหนด: <span className="text-foreground">{formatDate(contract.contract_end_date)}</span>
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
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-transparent p-4 flex flex-col gap-3 max-w-md mx-auto w-full">
        {/* Pawn Entry Button */}
        <button
          onClick={() => router.push('/estimate')}
          className="w-full min-h-12 rounded-2xl bg-gradient-to-r from-[#ff5d1f] to-[#db4710] py-3 text-primary-fg shadow-[0_12px_24px_rgba(219,71,16,0.22)] transition-transform active:scale-[0.98] flex flex-col items-center justify-center"
        >
          <span className="text-base font-bold">ขอสินเชื่อ</span>
          <span className="text-[10px] opacity-80 font-light">Pawn entry</span>
        </button>
        
        {/* Contract List Button (Active State) */}
        <button
          onClick={() => router.push('/register')}
          className="w-full min-h-12 bg-white/95 border border-primary-border hover:bg-primary-soft text-primary rounded-2xl py-3 flex flex-col items-center justify-center transition-colors shadow-[0_8px_18px_rgba(219,71,16,0.08)] active:scale-[0.98]"
        >
          <span className="text-base font-bold">หน้าหลัก</span>
          <span className="text-[10px] opacity-80 font-light">Home</span>
        </button>
      </div>

    </div>
  );
}
