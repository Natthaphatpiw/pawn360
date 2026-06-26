'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { AlertTriangle, CalendarDays, MapPin, Truck, Warehouse, Info } from 'lucide-react';
import axios from 'axios';
import MapEmbed from '@/components/MapEmbed';
import { useLiff } from '@/lib/liff/liff-provider';
import ContractActionTabs from '../_components/ContractActionTabs';
import TransactionHeader from '../_components/TransactionHeader';
import {
  getMockNearDueCentralRedemptionContract,
  getMockPost15RedemptionContract,
  isPreviewMode,
  withPreview,
} from '../_lib/preview';

interface ContractDetail {
  contract_id: string;
  contract_number: string;
  contract_start_date?: string | null;
  loan_principal_amount: number;
  original_principal_amount?: number | null;
  interest_rate: number;
  interest_amount: number;
  total_amount: number;
  amount_paid: number;
  contract_duration_days: number;
  remainingAmount: number;
  remainingPrincipal: number;
  remainingInterest: number;
  item: {
    brand: string;
    model: string;
    capacity: string | null;
  };
  customer?: {
    phone_number?: string | null;
    addr_house_no?: string | null;
    addr_village?: string | null;
    addr_street?: string | null;
    addr_sub_district?: string | null;
    addr_district?: string | null;
    addr_province?: string | null;
    addr_postcode?: string | null;
  } | null;
  investor: {
    investor_id: string;
    firstname: string;
    lastname: string;
    bank_name: string | null;
    bank_account_no: string | null;
    bank_account_name: string | null;
    promptpay_number: string | null;
  } | null;
  drop_point: {
    drop_point_id: string;
    drop_point_name: string;
    phone_number: string;
    map_embed?: string | null;
  } | null;
}

type DeliveryMethod =
  | ''
  | 'DROPPOINT_SELF_PICKUP'
  | 'DROPPOINT_SELF_RIDER'
  | 'CENTRAL_SCHEDULE_7D'
  | 'CENTRAL_SELF_PICKUP_TODAY'
  | 'DROPPOINT_NEXT_DAY_PICKUP';

interface ReturnOption {
  value: Exclude<DeliveryMethod, ''>;
  title: string;
  caption: string;
  fee: number;
  icon: React.ElementType;
}

interface PenaltyInfo {
  penaltyRequired: boolean;
  penalty?: {
    daysOverdue: number;
    penaltyAmount: number;
    overdueInterestAmount?: number;
    totalLateChargeAmount?: number;
  } | null;
}

export default function RedemptionPaymentPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const requestType = searchParams.get('type') || 'FULL_REDEMPTION';
  const previewMode = isPreviewMode(searchParams);
  const previewReturnStage = searchParams.get('returnStage');
  const usePost15Preview = previewMode && (
    previewReturnStage === 'central'
    || previewReturnStage === 'post15'
    || contractId === 'mock-post15'
  ) || contractId === 'mock-contract-001';

  const { profile } = useLiff();

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [penaltyInfo, setPenaltyInfo] = useState<PenaltyInfo | null>(null);

  // Return Options
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('');

  // Terms acceptance
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const DROPPOINT_HOLD_DAYS = 15;
  const DROPPOINT_NEXT_DAY_FEE = 100;

  useEffect(() => {
    if (contractId) {
      fetchContractDetail();
    }
  }, [contractId, usePost15Preview]);

  const fetchContractDetail = async () => {
    try {
      if (contractId === 'mock-contract-001') {
        setContract(getMockNearDueCentralRedemptionContract(contractId));
        setPenaltyInfo({ penaltyRequired: false, penalty: null });
        return;
      }

      if (usePost15Preview) {
        setContract(getMockPost15RedemptionContract(contractId));
        setPenaltyInfo({ penaltyRequired: false, penalty: null });
        return;
      }

      const response = await axios.get(`/api/contracts/detail/${contractId}`);
      if (response.data.success) {
        setContract(response.data.contract);
      } else {
        throw new Error('Contract detail unavailable');
      }

      const penaltyResponse = await axios.get('/api/penalties/status', {
        params: {
          contractId,
          lineId: profile?.userId,
        },
      });

      if (penaltyResponse.data?.success) {
        setPenaltyInfo({
          penaltyRequired: Boolean(penaltyResponse.data.penaltyRequired),
          penalty: penaltyResponse.data.penalty || null,
        });
      }
    } catch (error) {
      console.error('Error fetching contract:', error);
      setContract({
        contract_id: contractId,
        contract_number: `CT-${contractId}-MOCK`,
        contract_start_date: new Date().toISOString(),
        loan_principal_amount: 10000,
        original_principal_amount: 10000,
        interest_rate: 0.03,
        interest_amount: 300,
        total_amount: 10300,
        amount_paid: 0,
        contract_duration_days: 30,
        remainingAmount: 10300,
        remainingPrincipal: 10000,
        remainingInterest: 300,
        item: {
          brand: 'Apple',
          model: 'iPhone 13',
          capacity: '128GB',
        },
        customer: {
          phone_number: '0812345678',
          addr_house_no: '99/9',
          addr_village: '',
          addr_street: 'Sukhumvit',
          addr_sub_district: 'Khlong Toei Nuea',
          addr_district: 'Watthana',
          addr_province: 'Bangkok',
          addr_postcode: '10110',
        },
        investor: null,
        drop_point: {
          drop_point_id: 'dp-mock',
          drop_point_name: 'Pawn360 Drop Point (Mock)',
          phone_number: '020000000',
          map_embed: null,
        },
      });
      setPenaltyInfo({ penaltyRequired: false, penalty: null });
    } finally {
      setLoading(false);
    }
  };

  const getItemName = () => {
    if (!contract) return '';
    if (contract.item.capacity) {
      return `${contract.item.brand} ${contract.item.model} ${contract.item.capacity}`;
    }
    return `${contract.item.brand} ${contract.item.model}`;
  };

  const getTotalAmount = () => {
    if (!contract) return 0;
    let total = contract.remainingAmount;
    total += getReturnFee();
    if (penaltyInfo?.penaltyRequired) {
      total += Number(penaltyInfo.penalty?.totalLateChargeAmount
        ?? Number(penaltyInfo.penalty?.penaltyAmount || 0) + Number(penaltyInfo.penalty?.overdueInterestAmount || 0));
    }
    return total;
  };

  const getContractDay = () => {
    if (!contract?.contract_start_date) return 1;
    const startDate = new Date(contract.contract_start_date);
    const today = new Date();
    startDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return Math.max(1, Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  };

  const isCentralStorageStage = getContractDay() > DROPPOINT_HOLD_DAYS;

  const returnOptions: ReturnOption[] = isCentralStorageStage
    ? [
        {
          value: 'CENTRAL_SCHEDULE_7D',
          title: 'นัดรับที่ Drop Point ภายใน 7 วัน',
          caption: 'Astly จะส่งสินค้ากลับไปยัง Drop Point เดิม แล้วคุณมารับเอง ไม่มีค่าใช้จ่าย',
          fee: 0,
          icon: CalendarDays,
        },
        {
          value: 'CENTRAL_SELF_PICKUP_TODAY',
          title: 'รับวันนี้ที่คลังกลาง Astly',
          caption: 'ไปรับด้วยตัวเองที่คลังกลาง พร้อมแสดง QR ใบรับของ',
          fee: 0,
          icon: Warehouse,
        },
        {
          value: 'DROPPOINT_NEXT_DAY_PICKUP',
          title: 'รับวันถัดไปที่ Drop Point',
          caption: 'Astly ส่งของกลับไปยัง Drop Point สำหรับรับในวันถัดไป',
          fee: DROPPOINT_NEXT_DAY_FEE,
          icon: MapPin,
        },
      ]
    : [
        {
          value: 'DROPPOINT_SELF_PICKUP',
          title: 'รับเองที่ Drop Point',
          caption: 'ไปรับสินค้าด้วยตัวเองที่ Drop Point ไม่มีค่าใช้จ่าย',
          fee: 0,
          icon: MapPin,
        },
        {
          value: 'DROPPOINT_SELF_RIDER',
          title: 'เรียกไรเดอร์เอง',
          caption: 'เรียกไรเดอร์หรือขนส่งของคุณไปรับที่ Drop Point ไม่มีค่าใช้จ่าย',
          fee: 0,
          icon: Truck,
        },
      ];

  const getReturnFee = () => {
    return returnOptions.find((option) => option.value === deliveryMethod)?.fee || 0;
  };

  const getReturnNotes = () => {
    const selectedOption = returnOptions.find((option) => option.value === deliveryMethod);
    const storageStage = isCentralStorageStage ? 'CENTRAL_STORAGE_AFTER_15_DAYS' : 'DROPPOINT_WITHIN_15_DAYS';
    return [
      `Return option: ${selectedOption?.title || deliveryMethod}`,
      `Storage stage: ${storageStage}`,
      'Astly central notification: pending implementation',
    ].join(' | ');
  };

  const feeRate = 0.015;
  const durationMonths = contract ? (contract.contract_duration_days || 0) / 30 : 0;
  const feeBase = contract?.original_principal_amount || contract?.loan_principal_amount || 0;
  const feeAmount = Math.round(feeBase * feeRate * durationMonths * 100) / 100;
  const interestOnly = Math.max(0, (contract?.remainingInterest || 0) - feeAmount);

  const handleProceedToUpload = async () => {
    if (!acceptedTerms) {
      alert('กรุณายอมรับข้อตกลงก่อนดำเนินการต่อ');
      return;
    }

    if (!deliveryMethod) {
      alert('กรุณาเลือกวิธีรับสินค้าคืน');
      return;
    }

    setSubmitting(true);

    try {
      // Create redemption request
      const response = await axios.post('/api/redemptions/create', {
        contractId,
        requestType,
        deliveryMethod,
        deliveryAddress: {
          contactPhone: contract?.customer?.phone_number || null,
          notes: getReturnNotes(),
        },
        principalAmount: contract?.remainingPrincipal || 0,
        interestAmount: contract?.remainingInterest || 0,
        deliveryFee: getReturnFee(),
        totalAmount: getTotalAmount(),
        pawnerLineId: profile?.userId,
      });

      if (response.data.success) {
        const redemptionId = response.data.redemptionId;
        if (!redemptionId) {
          throw new Error('Missing redemptionId');
        }

        const resumedStatus = response.data.requestStatus;
        if (['SLIP_UPLOADED', 'AMOUNT_VERIFIED', 'PREPARING_ITEM', 'IN_TRANSIT'].includes(resumedStatus)) {
          router.push(`/contracts/${contractId}/redeem/receipt?redemptionId=${redemptionId}`);
          return;
        }

        // Navigate to upload page with redemption ID
        router.push(`/contracts/${contractId}/redeem/upload?redemptionId=${redemptionId}`);
      }
    } catch (error: any) {
      console.error('Error creating redemption:', error);
      const previewRedemptionId = `preview-redeem-${contractId}`;
      router.push(`${withPreview(`/contracts/${contractId}/redeem/upload`, 'redemptionId', previewRedemptionId)}&deliveryMethod=${encodeURIComponent(deliveryMethod)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const DetailRow = ({ label, value, isTotal = false, highlight = false }: {
    label: string;
    value: string;
    isTotal?: boolean;
    highlight?: boolean;
  }) => (
    <div className="flex justify-between items-center mb-2">
      <div className={`text-foreground-muted ${isTotal ? 'font-bold text-base' : 'font-bold text-sm'}`}>
        {label}:
      </div>
      <div className={`text-right ${isTotal ? 'text-primary font-bold text-lg' : highlight ? 'text-primary font-medium text-sm' : 'text-foreground-subtle text-sm'}`}>
        {value}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen bg-background-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600">ไม่พบข้อมูลสัญญา</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-white font-sans flex flex-col">

      <TransactionHeader
        title="ไถ่ถอนสินค้า"
        subtitle="Redemption Payment"
        rightSlot={
          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            className="h-8 w-8 rounded-full bg-background-white text-primary transition-colors hover:bg-primary-soft"
            aria-label="ข้อมูลการไถ่ถอน"
          >
            <Info className="h-5 w-5" />
          </button>
        }
      />

      {/* Transaction tabs */}
      {/* <ContractActionTabs contractId={contractId} activeTab="redeem" /> */}

      {showInfoModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowInfoModal(false)}>
          <div className="bg-background-white w-full max-w-sm rounded-xl p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-foreground mb-2">รายละเอียดการไถ่ถอน</h2>
            <p className="text-sm text-foreground-subtle mb-4 leading-relaxed">
              การไถ่ถอนคือการชำระคืนเงินต้นและดอกเบี้ยทั้งหมดเพื่อปิดสัญญา
              หลังชำระแล้วคุณจะสามารถรับสินค้าคืนได้ตามวิธีที่เลือก
            </p>
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="w-full bg-primary text-white rounded-full py-3 font-bold hover:bg-primary/80 transition-colors"
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 px-4 px-4 pt-2 pb-12 overflow-y-auto">
        {/* Contract Info */}
        <div className="bg-background rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-foreground text-sm">ข้อมูลสัญญา</h2>
          </div>
          <DetailRow label="หมายเลขสัญญา" value={contract.contract_number} />
          <DetailRow label="สินค้า" value={getItemName()} />
          <DetailRow label="เงินต้นปัจจุบัน" value={`${contract.remainingPrincipal.toLocaleString()} บาท`} />
        </div>

        {/* Calculation Details */}
        <div className="bg-background rounded-xl p-4 mb-4">
          <h2 className="font-bold text-foreground text-sm mb-3">รายการที่ต้องชำระ</h2>
          <div className="bg-primary-soft rounded-lg p-4 mb-3">
            <DetailRow label="เงินต้น" value={`${contract.remainingPrincipal.toLocaleString()} บาท`} />
            <DetailRow label="ดอกเบี้ย (1.5%)" value={`${interestOnly.toLocaleString()} บาท`} />
            <DetailRow label="ค่าธรรมเนียม (1.5%)" value={`${feeAmount.toLocaleString()} บาท`} />
            {penaltyInfo?.penaltyRequired && (
              <>
                <DetailRow label="ค่าปรับเกินกำหนด" value={`${Number(penaltyInfo.penalty?.penaltyAmount || 0).toLocaleString()} บาท`} highlight />
                <DetailRow label="ดอกเบี้ยเลท (3%/เดือน)" value={`${Number(penaltyInfo.penalty?.overdueInterestAmount || 0).toLocaleString()} บาท`} />
                <p className="text-xs text-primary mt-1">
                  เกินกำหนดแล้ว {penaltyInfo.penalty?.daysOverdue || 0} วัน คิดค่าปรับเดือนละ 50 บาท และดอกเบี้ยเลท 3%/เดือน
                </p>
              </>
            )}
            {getReturnFee() > 0 && (
              <DetailRow label="ค่าบริการรับที่ Drop Point" value={`${getReturnFee().toLocaleString()} บาท`} />
            )}
          </div>
          <div className="bg-primary rounded-lg p-4 text-white">
            <div className="flex justify-between items-center">
              <span className="text-sm">ยอดที่ต้องชำระ</span>
              <span className="text-2xl font-bold">{getTotalAmount().toLocaleString()} บาท</span>
            </div>
          </div>
        </div>

        {/* Return Options */}
        <div className="bg-background rounded-xl p-4 mb-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-foreground">วิธีการรับสินค้า</h2>
              <p className="mt-1 text-xs text-foreground-subtle">Return method</p>
            </div>
            <span className="rounded-full bg-primary-soft px-3 py-1 text-[10px] font-bold text-primary">
              วันที่ {getContractDay()} ของสัญญา
            </span>
          </div>
          <div className="mb-4 rounded-lg border border-primary-border bg-background-white p-3 text-xs leading-relaxed text-foreground-subtle">
            {isCentralStorageStage
              ? 'ครบ 15 วันแล้ว สินค้าถูกย้ายไปยังคลังกลาง Astly กรุณาเลือกวิธีรับคืนด้านล่าง'
              : 'สินค้ายังอยู่ที่ Drop Point ภายในช่วง 15 วันแรก สามารถรับเองหรือเรียกไรเดอร์ไปรับได้ฟรี'}
          </div>
          <div className="space-y-3">
            {returnOptions.map((option) => {
              const Icon = option.icon;
              const selected = deliveryMethod === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selected ? 'border-primary bg-primary-soft' : 'border-primary-border bg-background-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value={option.value}
                    checked={selected}
                    onChange={() => setDeliveryMethod(option.value)}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="font-bold text-foreground">{option.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        option.fee > 0 ? 'bg-primary text-white' : 'bg-success-soft text-success'
                      }`}>
                        {option.fee > 0 ? `+${option.fee.toLocaleString()} บาท` : 'ฟรี'}
                      </span>
                    </div>
                    <p className="text-xs text-foreground-subtle mt-1">{option.caption}</p>
                    {option.value.includes('DROPPOINT') && contract.drop_point && (
                      <p className="text-xs text-primary mt-2">
                        {contract.drop_point.drop_point_name} - {contract.drop_point.phone_number}
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          {contract.drop_point?.map_embed && deliveryMethod.includes('DROPPOINT') && (
            <div className="mt-4 bg-background-white border border-primary-border rounded-xl p-3">
              <div className="text-sm font-bold text-foreground-muted mb-2">แผนที่สาขา</div>
              <MapEmbed embedHtml={contract.drop_point.map_embed} className="h-40" />
            </div>
          )}
        </div>

        {/* Company Bank Details Section */}
        <div className="bg-background rounded-xl p-4 mb-4">
          <h2 className="text-base font-bold text-foreground mb-4">รายละเอียดการโอนเงิน</h2>

            <div className="bg-primary-soft rounded-lg p-4 border border-primary-border">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-foreground-subtle text-sm">ธนาคาร:</span>
                <span className="font-bold text-foreground text-sm">พร้อมเพย์</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-subtle text-sm">เลขบัญชี:</span>
                <span className="font-bold text-primary text-sm">0626092941</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-subtle text-sm">ชื่อบัญชี:</span>
                <span className="font-medium text-foreground text-sm">ณัฐภัทร ต้อยจัตุรัส</span>
                </div>
                  <div className="flex justify-between pt-2 border-t border-primary-border">
                    <span className="text-foreground-subtle text-sm">PromptPay:</span>
                <span className="font-bold text-primary text-sm">0626092941</span>
              </div>
            </div>
            </div>
        </div>

        {/* Warning Section */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-red-700 text-sm mb-2">ข้อควรระวัง</h3>
              <ul className="text-xs text-red-600 space-y-1 list-disc list-inside">
                <li>กรุณาตรวจสอบยอดเงินให้ถูกต้องก่อนโอน</li>
                <li>หากโอนเงิน<strong>เกิน</strong>ยอดที่กำหนด ทางเราจะไม่รับผิดชอบ</li>
                <li>หากโอนเงิน<strong>ขาด</strong>ไม่ตรงตามจำนวน การไถ่ถอนจะเป็นโมฆะ</li>
                <li>ทางเรามีสิทธิ์ปฏิเสธการไถ่ถอนหากยอดไม่ตรง</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Terms Acceptance */}
        <div className="bg-background-white rounded-xl p-4 mb-6">
          <label className="checkbox flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="sr-only"
            />
            <span aria-hidden="true" className="mt-0.5" />
            <div className="text-sm text-foreground-muted">
              ข้าพเจ้ารับทราบและยอมรับว่าหากโอนเงินเกินหรือขาดไม่ตรงตามจำนวน ทาง Pawnly จะไม่รับผิดชอบใดๆ ทั้งสิ้น และการไถ่ถอนอาจถูกปฏิเสธ
            </div>
          </label>
        </div>

      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background-white/10 backdrop-blur-md border-t border-background-white/50">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleProceedToUpload}
            disabled={!acceptedTerms || !deliveryMethod || submitting}
            className={`w-full py-2 rounded-full flex flex-col items-center justify-center transition-all ${
              acceptedTerms && deliveryMethod && !submitting
                ? 'btn-transition btn-sheen bg-[image:var(--background-image-grad-primary)] hover:bg-primary/80 text-white'
                : 'bg-background-subtle text-foreground-subtle cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <span className="text-md font-medium">กำลังส่ง...</span>
            ) : (
              <>
                <span className="text-md font-medium">ดำเนินการต่อ</span>
                <span className="text-xs font-light opacity-80">Proceed to upload slip</span>
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
