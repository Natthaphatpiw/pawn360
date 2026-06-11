'use client';

import React, { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';
import { openLiffEntry } from '@/lib/liff/navigation';
import {
  getMockContracts,
  getMockContractsEnabled,
  getMockContractsUserName,
} from '@/lib/mock-contracts';

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

const ENDED_CONTRACT_STATUSES = new Set(['COMPLETED', 'TERMINATED', 'LIQUIDATED']);

export default function PawnerContractList() {
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const router = useRouter();
  const mockMode = getMockContractsEnabled();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);

  useEffect(() => {
    if (mockMode) {
      setPinVerified(true);
      setPinModalOpen(false);
      fetchContracts();
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

    const session = getPinSession('PAWNER', profile.userId);
    if (session?.token) {
      setPinVerified(true);
      fetchContracts();
    } else {
      setPinVerified(false);
      setPinModalOpen(true);
      setLoading(false);
    }
  }, [liffLoading, liffError, profile?.userId, mockMode]);

  const fetchContracts = async () => {
    try {
      if (mockMode) {
        const mockContracts = await getMockContracts();
        setUserName(getMockContractsUserName());
        setContracts(mockContracts as Contract[]);
        return;
      }

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
        return { text: 'ปกติ', bg: 'bg-success-soft', textCol: 'text-success' };
      case 'ครบกำหนด':
        return { text: 'ครบกำหนด', bg: 'bg-error-soft', textCol: 'text-error' };
      case 'ใกล้ครบกำหนด':
        return { text: 'ใกล้ครบกำหนด', bg: 'bg-warning-soft', textCol: 'text-warning' };
      case 'เสร็จสิ้น':
        return { text: 'เสร็จสิ้น', bg: 'bg-background-subtle', textCol: 'text-foreground-muted' };
      case 'รอรับนักลงทุน':
        return { text: 'รอรับนักลงทุน', bg: 'bg-s2-soft', textCol: 'text-s2' };
      case 'รอการโอนเงิน':
        return { text: 'รอการโอนเงิน', bg: 'bg-warning-soft', textCol: 'text-warning' };
      case 'รอยืนยันรับเงิน':
        return { text: 'รอยืนยันรับเงิน', bg: 'bg-warning-soft', textCol: 'text-warning' };
      case 'รอส่งสินค้า':
        return { text: 'รอส่งสินค้า', bg: 'bg-primary-soft', textCol: 'text-primary' };
      case 'รอนำส่งสินค้า':
        return { text: 'รอนำส่งสินค้า', bg: 'bg-primary-soft', textCol: 'text-primary' };
      case 'กำลังนำส่งสินค้า':
        return { text: 'กำลังนำส่งสินค้า', bg: 'bg-s3-soft', textCol: 'text-s3' };
      case 'กำลังขนส่ง':
        return { text: 'กำลังขนส่ง', bg: 'bg-s3-soft', textCol: 'text-s3' };
      case 'รอตรวจสอบสินค้า':
        return { text: 'รอตรวจสอบสินค้า', bg: 'bg-s2-soft', textCol: 'text-s2' };
      case 'ยกเลิก':
        return { text: 'ยกเลิก', bg: 'bg-background-subtle', textCol: 'text-foreground-subtle' };
      case 'ขายทอดตลาด':
        return { text: 'ขายทอดตลาด', bg: 'bg-error-soft', textCol: 'text-error' };
      case 'เกินกำหนด':
      case 'เลยกำหนด':
        return { text: 'เลยกำหนด', bg: 'bg-error-soft', textCol: 'text-error' };
      case 'ส่งคืน':
        return { text: 'ส่งคืน', bg: 'bg-background-subtle', textCol: 'text-foreground-subtle' };
      default:
        return { text: status, bg: 'bg-background-subtle', textCol: 'text-foreground-subtle' };
    }
  };

  const getItemName = (item: ContractItem) => {
    const baseName = [item.brand, item.model].filter(Boolean).join(' ').trim();
    return [baseName, item.capacity].filter(Boolean).join(' ').trim() || 'รายการสินเชื่อ';
  };

  const visibleContracts = contracts.filter((contract) => {
    if (ENDED_CONTRACT_STATUSES.has(contract.contract_status)) {
      return false;
    }

    return contract.displayStatus !== 'ส่งคืน';
  });

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
        <div className="max-w-md rounded-xl border border-error-border bg-error-soft p-6 text-error shadow-soft">
          <h2 className="mb-2 text-lg font-semibold">เกิดข้อผิดพลาด</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!pinVerified) {
    return (
      <div className="min-h-screen bg-background-white flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-primary-border bg-primary-soft/50 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white px-6 py-6 text-center shadow-soft">
            <div className="inline-flex rounded-full border border-primary-border bg-primary-soft px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
              Secure Contracts
            </div>
            <h2 className="mt-4 text-lg font-bold text-foreground">ยืนยัน PIN ก่อนเข้าดูรายการ</h2>
            <p className="mt-2 text-sm text-foreground-subtle">
            เพื่อความปลอดภัย กรุณายืนยัน PIN 6 หลักก่อนดูรายการสัญญา
            </p>
            <button
              type="button"
              onClick={() => setPinModalOpen(true)}
              className="btn-transition btn-sheen mt-5 w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-fg shadow-soft"
            >
              ยืนยัน PIN
            </button>
          </div>
        </div>

        {(profile?.userId || mockMode) && (
          <PinModal
            open={pinModalOpen}
            role="PAWNER"
            lineId={profile?.userId || 'mock-pawner-line-id'}
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
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col">

        {/* Contract Header */}
        <div className="mb-5 rounded-xl border border-primary-border bg-primary-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
            <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/40">
              Pawnly Contracts
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-primary">
                  รายการสัญญา
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contract List */}
        <div className="flex-1 space-y-3 pb-28 no-scrollbar">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="min-w-0 flex-1 truncate whitespace-nowrap text-lg font-medium text-foreground">
              สัญญา
            </h2>
            <div className="text-sm font-light text-foreground-subtle">
                {visibleContracts.length} รายการ
              </div>
          </div>
          {visibleContracts.length === 0 ? (
            <div className="rounded-lg border border-primary-border bg-background p-8 text-center">
              <p className="text-primary/50">ไม่มีสัญญาสินเชื่อที่กำลังดำเนินการ</p>
            </div>
          ) : (
            visibleContracts.map((contract) => {
              const status = getStatusBadge(contract.displayStatus);
              return (
                <div
                  key={contract.contract_id}
                  className="hover-card cursor-pointer rounded-xl border border-primary-border bg-primary-soft p-4 shadow-soft transition-colors hover:bg-primary-soft/80"
                  onClick={() => router.push(`/contracts/${contract.contract_id}`)}
                >
                  <div className="flex items-center justify-between gap-3 flex-nowrap mb-1">
                    <h3 className="min-w-0 flex-1 truncate whitespace-nowrap text-md font-medium text-foreground">
                      {getItemName(contract.items)}
                    </h3>
                    {/* Status Badge */}
                    <span className={`${status.bg} ${status.textCol} shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium border`}>
                      {status.text}
                    </span>
                  </div>

                  <div className="space-y-1 mb-1">
                    <div className="text-sm text-foreground-subtle">
                      มูลค่า: <span className="text-foreground-muted">{contract.loan_principal_amount.toLocaleString()} บาท</span>
                    </div>
                    <div className="text-sm text-foreground-subtle">
                      วันครบกำหนด: <span className="text-foreground-muted">{formatDate(contract.contract_end_date)}</span>
                    </div>
                  </div>
                  <div className="mt-3 w-full rounded-full bg-primary/20 px-3 py-1 text-center text-xs font-light text-primary">
                    {contract.contract_number}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 mx-auto flex w-full max-w-md flex-col gap-3 bg-background-white/25 backdrop-blur-sm border border-background-white/50 p-4 pb-10 shadow-soft">
          <button
            onClick={() => router.push('/contracts/actions')}
            className="w-full min-h-12 rounded-full border border-primary bg-background-white px-4 py-2 text-base font-medium text-primary transition-colors flex flex-col items-center justify-center"
          >
            <span className="text-base font-medium">สถานะคำขอ</span>
            <span className="text-xs font-light opacity-90">Request status</span>
          </button>
          <button
            onClick={() => openLiffEntry({
              liffIdCandidates: [
                process.env.NEXT_PUBLIC_LIFF_ID_PAWN,
              ],
              fallbackPath: '/estimate',
            })}
            className="btn-transition btn-sheen w-full rounded-full bg-[image:var(--background-image-grad-primary)] py-2 text-primary-fg shadow-soft flex flex-col items-center justify-center"
          >
            <span className="text-base font-medium">ขอสินเชื่อ</span>
            <span className="text-xs font-light opacity-90">Pawn entry</span>
          </button>
        </div>
      </div>
    </div>
  );
}
