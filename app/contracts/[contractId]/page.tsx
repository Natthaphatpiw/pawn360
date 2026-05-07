'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import axios from 'axios';
import { SearchX } from 'lucide-react';
import MapEmbed from '@/components/MapEmbed';
import { getMockContractDetail, getMockContractsEnabled } from '@/lib/mock-contracts';

interface Customer {
  customer_id: string;
  firstname: string;
  lastname: string;
  phone_number: string;
  national_id: string;
}

interface Investor {
  investor_id: string;
  firstname: string;
  lastname: string;
  phone_number: string;
}

interface Item {
  item_id: string;
  item_type: string;
  brand: string;
  model: string;
  capacity: string | null;
  serial_number: string | null;
  estimated_value: number;
  item_condition: number;
  accessories: string | null;
  defects: string | null;
  notes: string | null;
  image_urls: string[];
}

interface DropPoint {
  drop_point_id: string;
  drop_point_name: string;
  drop_point_code: string;
  phone_number: string;
  addr_house_no: string;
  addr_street: string;
  addr_sub_district: string;
  addr_district: string;
  addr_province: string;
  addr_postcode: string;
  google_map_url: string | null;
  map_embed?: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface ContractDetail {
  contract_id: string;
  contract_number: string;
  contract_start_date: string;
  contract_end_date: string;
  contract_duration_days: number;
  loan_principal_amount: number;
  original_principal_amount?: number | null;
  current_principal_amount?: number | null;
  interest_rate: number;
  interest_amount: number;
  total_amount: number;
  amount_paid: number;
  interest_paid: number;
  principal_paid: number;
  contract_status: string;
  funding_status: string;
  payment_status?: string | null;
  item_delivery_status?: string | null;
  contract_file_url: string | null;
  customer: Customer;
  investor: Investor | null;
  item: Item;
  drop_point: DropPoint | null;
  remainingDays: number;
  displayStatus: string;
  remainingAmount: number;
  remainingPrincipal: number;
  remainingInterest: number;
}

type ModalType = 'redeem' | 'interest' | 'decrease' | 'increase' | null;

export default function PawnContractDetail() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.contractId as string;
  const mockMode = getMockContractsEnabled();

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalStep, setModalStep] = useState(1);

  useEffect(() => {
    if (contractId) {
      fetchContractDetail();
    }
  }, [contractId, mockMode]);

  const fetchContractDetail = async () => {
    try {
      if (mockMode) {
        const mockContract = await getMockContractDetail(contractId);
        setContract(mockContract as ContractDetail | null);
        return;
      }
      const response = await axios.get(`/api/contracts/detail/${contractId}`);
      if (response.data.success) {
        setContract(response.data.contract);
      }
    } catch (error: any) {
      console.error('Error fetching contract:', error);
      setError('ไม่พบข้อมูลสัญญา');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear() + 543;
    return `${day}/${month}/${year}`;
  };

  const formatNationalId = (id: string) => {
    if (!id || id.length !== 13) return id;
    return `${id[0]}-${id.substring(1, 5)}-${id.substring(5, 10)}-${id.substring(10, 12)}-${id[12]}`;
  };

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return phone;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
    }
    return phone;
  };

  const getStatusTone = (status: string) => {
    switch (status) {
      case 'ปกติ':
        return 'text-success';
      case 'ใกล้ครบกำหนด':
        return 'text-warning';
      case 'เลยกำหนด':
      case 'เกินกำหนด':
        return 'text-error';
      case 'ไถ่ถอน':
        return 'text-grey-3';
      case 'หลุดจำนำ':
        return 'text-foreground';
      case 'ส่งคืน':
      case 'ยกเลิก':
      case 'เสร็จสิ้น':
        return 'text-foreground-subtle';
      default:
        return 'text-s3';
    }
  };

  const openModal = (modalType: ModalType) => {
    setActiveModal(modalType);
    setModalStep(1);
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalStep(1);
  };

  const InfoRow = ({ label, value, valueColor = 'text-foreground-muted', isBoldValue = false }: {
    label: string;
    value: React.ReactNode;
    valueColor?: string;
    isBoldValue?: boolean;
  }) => (
    <div className="flex justify-between items-start mb-2">
      <div className="w-1/3 text-sm font-medium text-foreground">{label}</div>
      <div className={`text-right w-2/3 text-sm text-foreground-subtle ${valueColor} ${isBoldValue ? 'font-base' : ''}`}>{value}</div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="theme-liff min-h-screen bg-background px-4 py-6">
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <div className="w-full max-w-sm rounded-xl border border-primary-border bg-primary-soft px-6 py-8 text-center shadow-soft">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-error-border bg-error-soft text-error">
              <SearchX className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-foreground">ไม่พบข้อมูลสัญญาสินเชื่อ</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground-subtle">
              กรุณาตรวจสอบรหัสสัญญาอีกครั้ง หรือกลับไปยังหน้ารายการสัญญา
            </p>
            <button
              type="button"
              onClick={() => router.push('/contracts')}
              className="btn-transition mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-primary bg-primary-soft px-5 py-3 text-sm font-medium text-primary"
            >
              กลับหน้าหลัก
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getItemName = () => {
    if (contract.item.capacity) {
      return `${contract.item.brand} ${contract.item.model} ${contract.item.capacity}`;
    }
    return `${contract.item.brand} ${contract.item.model}`;
  };

  const getDisplayDurationDays = () => {
    const storedDuration = Number(contract.contract_duration_days || 0);
    if (storedDuration > 0) {
      return storedDuration;
    }
    const start = new Date(contract.contract_start_date);
    const end = new Date(contract.contract_end_date);
    const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    const diff = Math.round((endUtc - startUtc) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff);
  };

  const displayDurationDays = getDisplayDurationDays();

  const getActionBlockedReason = () => {
    const status = contract.contract_status;
    const itemStatus = contract.item_delivery_status || '';

    if (['COMPLETED', 'TERMINATED', 'LIQUIDATED', 'DEFAULTED'].includes(status)) {
      return 'สัญญานี้สิ้นสุดแล้ว ไม่สามารถทำรายการเพิ่มเติมได้';
    }

    if (!['CONFIRMED', 'EXTENDED'].includes(status)) {
      return 'สัญญายังไม่พร้อมทำรายการ กรุณารอการยืนยันจากระบบ';
    }

    if (itemStatus && !['RECEIVED_AT_DROP_POINT', 'VERIFIED'].includes(itemStatus)) {
      return 'สินค้ายังไม่ถูกส่งถึง Drop Point จึงยังทำรายการไม่ได้';
    }

    return null;
  };

  const actionBlockedReason = getActionBlockedReason();
  const actionsEnabled = !actionBlockedReason;

  const rawRate = Number(contract.interest_rate || 0);
  const totalMonthlyRate = rawRate > 1 ? rawRate / 100 : rawRate;
  const feeRate = 0.01;
  const interestRatePawner = Math.max(0, totalMonthlyRate - feeRate);
  const durationMonths = (contract.contract_duration_days || 0) / 30;
  const feeBase = contract.original_principal_amount || contract.loan_principal_amount;
  const interestAmount = Math.round(feeBase * interestRatePawner * durationMonths * 100) / 100;
  const feeAmount = Math.round(feeBase * feeRate * durationMonths * 100) / 100;

  return (
    <div className="min-h-screen bg-background-white relative px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <div className="mb-5 rounded-xl border border-primary-border bg-primary-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
            <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/40">
              Contract Detail
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-primary">
              รายการขอสินเชื่อ
            </div>
            <p className="mt-2 text-xs text-foreground-subtle">{contract.contract_number}</p>
          </div>
        </div>

      <div className="pb-8">

        {/* ================= MODALS ================= */}

        {/* 1. Modal: ต่อดอกเบี้ย (Pay Interest) */}
        {activeModal === 'interest' && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
            onClick={closeModal}
          >
            <div
              className="modal-pop-in relative w-full max-w-sm rounded-xl bg-background-white p-6 text-center shadow-strong"
              onClick={(e) => e.stopPropagation()}
            >

              <div className="flex justify-center mb-2">
                <div className="flex h-24 w-24 items-center justify-center text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><g fill="none">
                    <path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/>
                    <path fill="currentColor" d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2m0 2a8 8 0 1 0 0 16a8 8 0 0 0 0-16m0 11a1 1 0 1 1 0 2a1 1 0 0 1 0-2m0-9a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1"/></g>
                  </svg>
                </div>
              </div>

              <h3 className="text-lg font-bold text-foreground">ยืนยันรายการต่อดอกเบี้ย</h3>
              <p className="mb-4 text-xs font-light text-foreground-subtle">Confirm Interest rate extension</p>

              <p className="mb-6 text-lg font-bold text-primary">
                ยอดชำระรวม {contract.remainingInterest.toLocaleString()} บาท
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => router.push(`/contracts/${contractId}/interest-payment`)}
                  className="btn-transition btn-sheen w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-fg"
                >
                  ยืนยัน
                </button>
                <button
                  onClick={closeModal}
                  className="btn-transition w-full rounded-full border border-primary bg-background-white py-3 text-sm font-medium text-primary"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Modal: ลดเงินต้น (Decrease Loan) */}
        {activeModal === 'decrease' && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
            onClick={closeModal}
          >
            <div
              className="modal-pop-in relative w-full max-w-sm rounded-xl bg-background-white p-6 text-center shadow-strong"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="mb-2 flex justify-center">
                  <div className="flex h-24 w-24 items-center justify-center text-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24">
                      <g fill="none">
                        <path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
                        <path fill="currentColor" d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2m0 2a8 8 0 1 0 0 16a8 8 0 0 0 0-16m0 11a1 1 0 1 1 0 2a1 1 0 0 1 0-2m0-9a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1" />
                      </g>
                    </svg>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-foreground">ลดเงินต้น</h3>
                <p className="mb-2 text-xs font-light text-foreground-subtle">Decrease loan</p>

                <p className="mb-6 px-4 text-sm font-light leading-relaxed text-foreground-subtle">
                  ไปยังหน้าถัดไปเพื่อระบุจำนวนเงินต้นที่ต้องการลด
                </p>

                <div className="space-y-2">
                  <button
                    onClick={() => router.push(`/contracts/${contractId}/principal-reduction`)}
                    className="btn-transition w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-fg"
                  >
                    ดำเนินการต่อ
                  </button>
                  <button
                    onClick={closeModal}
                    className="btn-transition w-full rounded-full border border-primary bg-background-white py-3 text-sm font-medium text-primary"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. Modal: ไถ่ถอน (Redeem) */}
        {activeModal === 'redeem' && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
            onClick={closeModal}
          >
            <div
              className="modal-pop-in relative w-full max-w-sm rounded-xl bg-background-white p-6 text-center shadow-strong"
              onClick={(e) => e.stopPropagation()}
            >

              <div className="mb-2 flex justify-center">
                <div className="flex h-24 w-24 items-center justify-center text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24">
                    <g fill="none">
                      <path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
                      <path fill="currentColor" d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2m0 2a8 8 0 1 0 0 16a8 8 0 0 0 0-16m0 11a1 1 0 1 1 0 2a1 1 0 0 1 0-2m0-9a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1" />
                    </g>
                  </svg>
                </div>
              </div>

              <h3 className="text-lg font-bold text-foreground">ยืนยันการไถ่ถอน</h3>
              <p className="mb-2 text-xs font-light text-foreground-subtle">Confirm redemption</p>
              <p className="mb-4 text-lg font-bold text-primary">
                ยอดชำระรวม {contract.remainingAmount.toLocaleString()} Baht
              </p>
              <p className="mb-6 px-4 text-sm font-light leading-relaxed text-error">
                กรุณาตรวจสอบยอดให้ถูกต้องก่อนทำรายการ
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => router.push(`/contracts/${contractId}/redeem`)}
                  className="btn-transition w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-fg"
                >
                  ดำเนินการต่อ
                </button>
                <button
                  onClick={closeModal}
                  className="btn-transition w-full rounded-full border border-primary bg-background-white py-3 text-sm font-medium text-primary"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. Modal: เพิ่มเงินต้น (Increase Loan) */}
        {activeModal === 'increase' && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
            onClick={closeModal}
          >
            <div
              className="modal-pop-in relative w-full max-w-sm rounded-xl bg-background-white p-6 text-center shadow-strong"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex justify-center">
                <div className="flex h-24 w-24 items-center justify-center text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24">
                    <g fill="none">
                      <path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
                      <path fill="currentColor" d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2m0 2a8 8 0 1 0 0 16a8 8 0 0 0 0-16m0 11a1 1 0 1 1 0 2a1 1 0 0 1 0-2m0-9a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1" />
                    </g>
                  </svg>
                </div>
              </div>

              <h3 className="text-lg font-bold text-foreground">เพิ่มเงินต้น</h3>
              <p className="mb-4 text-xs font-light text-foreground-subtle">Increase loan</p>

              <p className="mb-4 text-sm text-foreground-muted">
                คุณจะระบุจำนวนเงินที่ต้องการเพิ่มในขั้นตอนถัดไป
                และต้องชำระดอกเบี้ยที่เกิดขึ้นถึงวันนี้ทันที
              </p>

              <div className="mb-5 rounded-xl border border-warning-border bg-warning-soft p-3 text-xs text-warning">
                ดอกเบี้ยที่ค้างถึงวันนี้จะถูกเรียกเก็บก่อนส่งคำขอให้นักลงทุนพิจารณา
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => router.push(`/contracts/${contractId}/principal-increase`)}
                  className="btn-transition w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-fg"
                >
                  ดำเนินการต่อ
                </button>
                <button
                  onClick={closeModal}
                  className="btn-transition w-full rounded-full border border-primary bg-background-white py-3 text-sm font-medium text-primary"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= MAIN CONTENT ================= */}

        {/* 1. Customer Info Section */}
        <div className="mb-4 p-4 pb-2 rounded-lg bg-background-subtle">
          <h2 className="mb-2 text-base font-bold text-foreground">ข้อมูลลูกค้า</h2>
          <div className="space-y-1.5">
            <InfoRow
              label="ชื่อ"
              value={`${contract.customer.firstname} ${contract.customer.lastname}`}
            />
            <InfoRow
              label="เลขบัตรประชาชน"
              value={formatNationalId(contract.customer.national_id)}
            />
            <InfoRow
              label="เบอร์มือถือ"
              value={formatPhoneNumber(contract.customer.phone_number)}
            />
          </div>
        </div>

        {/* 2. Contract Details Section */}
        <div className="mb-4 p-4 pb-2 rounded-lg bg-background-subtle">
          <h2 className="mb-2 text-base font-bold text-foreground">รายละเอียดสัญญา</h2>
          <div className="space-y-1.5">
            <InfoRow label="หมายเลขสัญญา" value={contract.contract_number} />
            <InfoRow label="สินค้า" value={getItemName()} />
            <InfoRow
              label="สถานะ"
              value={(
                <div className={`inline-flex w-fit items-center justify-center rounded-full bg-background-white px-3 py-1 ${getStatusTone(contract.displayStatus)}`}>
                  {contract.displayStatus}
                </div>
              )}
              isBoldValue
            />
            <InfoRow label="มูลค่า" value={`${contract.loan_principal_amount.toLocaleString()} บาท`} />
            <InfoRow
              label="ดอกเบี้ย"
              value={(
                <div className="text-right">
                  <div>{interestAmount.toLocaleString()} บาท ({(interestRatePawner * 100).toFixed(2)}%)</div>
                  <div className="text-xs text-foreground-subtle">
                    ค่าธรรมเนียม {feeAmount.toLocaleString()} บาท ({(feeRate * 100).toFixed(2)}%)
                  </div>
                </div>
              )}
            />
            <InfoRow label="ระยะเวลา" value={`${displayDurationDays} วัน`} />
            <InfoRow label="วันเริ่มต้น" value={formatDate(contract.contract_start_date)} />
            <InfoRow label="วันสิ้นสุด" value={formatDate(contract.contract_end_date)} />
          </div>
        </div>

        {/* 3. Remarks */}
        <div className="mb-4 p-4 rounded-lg bg-background-subtle">
          <h2 className="mb-1 text-base font-bold text-foreground">หมายเหตุ</h2>
          <p className="text-sm text-foreground-muted">
            {contract.item.notes || contract.item.defects || 'ไม่มี'}
          </p>
        </div>

        {/* 4. Remaining Days Card */}
        <div className="relative mb-4 flex items-center justify-between overflow-hidden rounded-lg border border-primary-border bg-primary-soft p-4 text-primary shadow-soft">
          <div className="absolute inset-0 bg-[image:var(--background-image-grad-primary)] opacity-10"></div>

          <div className="relative z-10">
            <div className="font-bold text-lg mb-1">ระยะเวลาคงเหลือ</div>
            <div className="text-sm opacity-80 font-light">Remaining days</div>
          </div>

          <div className="relative z-10 text-right flex flex-col items-end">
            <div className="text-sm opacity-80 mb-0 font-light">วัน</div>
            <div className="text-5xl font-bold leading-none tracking-tight">
              {contract.remainingDays > 0 ? contract.remainingDays : 0}
            </div>
          </div>
        </div>

        {!actionsEnabled && (
          <div className="mb-3 rounded-2xl border border-warning-border bg-warning-soft p-4 text-xs text-warning">
            {actionBlockedReason}
          </div>
        )}

        {/* 5. Action Buttons Grid */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <button
            onClick={() => actionsEnabled && openModal('redeem')}
            disabled={!actionsEnabled}
            className={`rounded-2xl py-3 flex flex-col items-center justify-center transition-transform active:scale-[0.98] ${
              actionsEnabled
                ? 'bg-success text-white'
                : 'bg-background-subtle text-foreground-subtle cursor-not-allowed'
            }`}
          >
            <span className="text-sm font-medium">ไถ่ถอน</span>
            <span className="text-xs font-light opacity-90">Redeem</span>
          </button>

          <button
            onClick={() => actionsEnabled && openModal('interest')}
            disabled={!actionsEnabled}
            className={`rounded-2xl py-3 flex flex-col items-center justify-center transition-transform active:scale-[0.98] ${
              actionsEnabled
                ? 'bg-primary text-primary-fg'
                : 'bg-background-subtle text-foreground-subtle cursor-not-allowed'
            }`}
          >
            <span className="text-sm font-medium">ต่อดอกเบี้ย</span>
            <span className="text-xs font-light opacity-90">Pay interest</span>
          </button>

          <button
            onClick={() => actionsEnabled && openModal('decrease')}
            disabled={!actionsEnabled}
            className={`rounded-2xl py-3 flex flex-col items-center justify-center transition-transform active:scale-[0.98] ${
              actionsEnabled
                ? 'bg-warning text-white'
                : 'bg-background-subtle text-foreground-subtle cursor-not-allowed'
            }`}
          >
            <span className="text-sm font-medium">ลดเงินต้น</span>
            <span className="text-xs font-light opacity-90">Decrease loan</span>
          </button>

          <button
            onClick={() => actionsEnabled && openModal('increase')}
            disabled={!actionsEnabled}
            className={`rounded-2xl py-3 flex flex-col items-center justify-center transition-transform active:scale-[0.98] ${
              actionsEnabled
                ? 'bg-error text-error-fg'
                : 'bg-background-subtle text-foreground-subtle cursor-not-allowed'
            }`}
          >
            <span className="text-sm font-medium">เพิ่มเงินต้น</span>
            <span className="text-xs font-light opacity-90">Increase loan</span>
          </button>
        </div>

        {contract.drop_point?.map_embed && (
          <div className="mb-3 rounded-[24px] border border-line-soft bg-background-white p-4 shadow-soft">
            <div className="mb-2 text-sm font-bold text-foreground-muted">แผนที่สาขา</div>
            <MapEmbed embedHtml={contract.drop_point.map_embed} className="h-40" />
          </div>
        )}

        {/* 6. Bottom Outline Buttons */}
        <div className="space-y-3">
          {contract.drop_point && contract.drop_point.google_map_url && (
            <button
              onClick={() => window.open(contract.drop_point!.google_map_url!, '_blank')}
              className="btn-transition flex w-full min-h-12 items-center justify-center rounded-full border border-primary bg-background-white px-4 py-3 text-primary active:scale-[0.98]"
            >
              <span className="text-sm font-medium">ที่ตั้ง Drop point</span>
            </button>
          )}

          <button
            onClick={() => router.push(`/pawn-ticket/${contractId}`)}
            className="btn-transition flex w-full min-h-12 flex-col items-center justify-center rounded-full border border-primary bg-background-white px-4 py-3 text-primary active:scale-[0.98]"
          >
            <span className="text-sm font-medium">ดูสัญญาสินเชื่อ</span>
            {/* <span className="text-[10px] font-light opacity-80">Pawn ticket</span> */}
          </button>

          {contract.contract_file_url && (
            <button
              onClick={() => window.open(contract.contract_file_url!, '_blank')}
              className="btn-transition flex w-full min-h-12 flex-col items-center justify-center rounded-full border border-primary bg-background-white px-4 py-3 text-primary active:scale-[0.98]"
            >
              <span className="text-sm font-medium">ดูสัญญา</span>
              {/* <span className="text-[10px] font-light opacity-80">See contract</span> */}
            </button>
          )}
        </div>

      </div>

      </div>
    </div>
  );
}
