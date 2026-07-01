'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import { CheckCircle, MapPin } from 'lucide-react';
import TransactionHeader from '../contracts/[contractId]/_components/TransactionHeader';
import {
  MOCK_PAWN_DELIVERY_CONTRACT_ID,
  createMockPawnDeliveryRequest,
  mockPawnDeliveryContract,
  resolveMockPawnDeliveryStatus,
} from './_lib/preview';

interface ContractData {
  contract_id: string;
  contract_number: string;
  item?: { brand?: string; model?: string };
  pawner?: {
    firstname?: string;
    lastname?: string;
    phone_number?: string;
    addr_house_no?: string | null;
    addr_village?: string | null;
    addr_street?: string | null;
    addr_sub_district?: string | null;
    addr_district?: string | null;
    addr_province?: string | null;
    addr_postcode?: string | null;
  };
  drop_point?: { drop_point_name?: string; phone_number?: string };
}

interface DeliveryRequest {
  delivery_request_id: string;
  status: string;
  delivery_fee: number;
  address_house_no?: string | null;
  address_village?: string | null;
  address_street?: string | null;
  address_sub_district?: string | null;
  address_district?: string | null;
  address_province?: string | null;
  address_postcode?: string | null;
  address_full?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
}

interface DeliveryAddress {
  houseNo: string;
  village: string;
  street: string;
  subDistrict: string;
  district: string;
  province: string;
  postcode: string;
}

const STATUS_STEPS = [
  'drop-point กำลังหารถไปรับของ',
  'มีรถกำลังเข้าไปรับของ',
  'รับสินค้าแล้วกำลังนำไปส่งที่ Drop Point',
  'สินค้าถึง Drop Point แล้ว อยู่ในขั้นตอนตรวจสอบ',
];

const resolveStatusLabel = (status?: string) => {
  switch (status) {
    case 'DRIVER_ASSIGNED':
      return STATUS_STEPS[1];
    case 'ITEM_PICKED':
      return STATUS_STEPS[2];
    case 'ARRIVED':
      return STATUS_STEPS[3];
    default:
      return STATUS_STEPS[0];
  }
};

const resolveStepIndex = (status?: string) => {
  switch (status) {
    case 'DRIVER_ASSIGNED':
      return 1;
    case 'ITEM_PICKED':
      return 2;
    case 'ARRIVED':
      return 3;
    default:
      return 0;
  }
};

const buildPawnerAddress = (pawner?: ContractData['pawner']): DeliveryAddress => ({
  houseNo: pawner?.addr_house_no || '',
  village: pawner?.addr_village || '',
  street: pawner?.addr_street || '',
  subDistrict: pawner?.addr_sub_district || '',
  district: pawner?.addr_district || '',
  province: pawner?.addr_province || '',
  postcode: pawner?.addr_postcode || '',
});

const buildAddressFull = (address: DeliveryAddress) => (
  [
    address.houseNo,
    address.village,
    address.street,
    address.subDistrict,
    address.district,
    address.province,
    address.postcode,
  ].filter(Boolean).join(' ')
);

const hasRequiredDeliveryAddress = (address: DeliveryAddress) => (
  Boolean(address.houseNo && address.district && address.province)
);

function PawnDeliveryPageContent() {
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const searchParams = useSearchParams();
  const hasContractParam = Boolean(searchParams.get('contractId') || searchParams.get('liff.state'));
  const previewMode = searchParams.get('preview') === '1'
    || searchParams.get('mock') === '1'
    || (process.env.NEXT_PUBLIC_LIFF_MOCK === 'true' && !hasContractParam);
  const previewStage = searchParams.get('stage') || 'status';
  const previewStatus = resolveMockPawnDeliveryStatus(previewStage, searchParams.get('status') || undefined);
  const effectiveLineId = previewMode ? 'Umock_dev_user_001' : profile?.userId;

  const [contractId, setContractId] = useState<string>('');
  const [contract, setContract] = useState<ContractData | null>(null);
  const [deliveryRequest, setDeliveryRequest] = useState<DeliveryRequest | null>(null);
  const [step, setStep] = useState<'address' | 'status'>('status');
  const [loading, setLoading] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string>('');
  const [stepIndex, setStepIndex] = useState(0);
  const [statusRequest, setStatusRequest] = useState<DeliveryRequest | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let id = searchParams.get('contractId');
    if (!id && previewMode) {
      id = MOCK_PAWN_DELIVERY_CONTRACT_ID;
    }
    if (!id) {
      const liffState = searchParams.get('liff.state');
      if (liffState) {
        const match = liffState.match(/contractId=([^&]+)/);
        if (match) id = match[1];
      }
    }
    setContractId(id || '');
  }, [searchParams, previewMode]);

  const itemName = useMemo(() => {
    if (!contract?.item) return '-';
    return `${contract.item.brand || ''} ${contract.item.model || ''}`.trim();
  }, [contract]);

  const borrowerAddressLabel = useMemo(() => {
    const address = buildPawnerAddress(contract?.pawner);
    const addressFull = buildAddressFull(address);
    return addressFull || '-';
  }, [contract?.pawner]);

  const fetchRequest = async () => {
    if (!contractId || !effectiveLineId) return;
    try {
      setLoading(true);
      if (previewMode) {
        const nextDeliveryRequest = createMockPawnDeliveryRequest(previewStatus);

        setContract(mockPawnDeliveryContract);
        setDeliveryRequest(nextDeliveryRequest);
        setStep('status');
        setStatusRequest(nextDeliveryRequest);
        setStatusLabel(resolveStatusLabel(nextDeliveryRequest.status));
        setStepIndex(resolveStepIndex(nextDeliveryRequest.status));
        return;
      }

      const response = await axios.get('/api/pawn-delivery/request', {
        params: { contractId, lineId: effectiveLineId }
      });
      const data = response.data;
      const contractData = data.contract || null;
      setContract(contractData);
      setDeliveryRequest(data.deliveryRequest || null);
      if (data.deliveryRequest) {
        setStatusRequest(data.deliveryRequest);
        setStatusLabel(resolveStatusLabel(data.deliveryRequest.status));
        setStepIndex(resolveStepIndex(data.deliveryRequest.status));
        setStep('status');
        return;
      }

      setStatusLabel(resolveStatusLabel('DRIVER_SEARCH'));
      setStepIndex(0);
      setStep('status');

      const autoAddress = buildPawnerAddress(contractData?.pawner);
      if (contractData && hasRequiredDeliveryAddress(autoAddress)) {
        const createResponse = await axios.post('/api/pawn-delivery/request', {
          contractId,
          lineId: effectiveLineId,
          address: autoAddress,
          contactPhone: contractData.pawner?.phone_number || '',
          notes: '',
        });
        const nextDeliveryRequest: DeliveryRequest = {
          delivery_request_id: createResponse.data?.deliveryRequestId,
          status: 'DRIVER_SEARCH',
          delivery_fee: data.loanRequest?.delivery_fee ?? 0,
          address_house_no: autoAddress.houseNo,
          address_village: autoAddress.village,
          address_street: autoAddress.street,
          address_sub_district: autoAddress.subDistrict,
          address_district: autoAddress.district,
          address_province: autoAddress.province,
          address_postcode: autoAddress.postcode,
          address_full: buildAddressFull(autoAddress),
          contact_phone: contractData.pawner?.phone_number || '',
          notes: null,
        };
        setDeliveryRequest(nextDeliveryRequest);
        setStatusRequest(nextDeliveryRequest);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatus = async () => {
    if (!contractId || !effectiveLineId) return;
    try {
      if (previewMode) {
        const nextDeliveryRequest = statusRequest || deliveryRequest || createMockPawnDeliveryRequest(previewStatus);
        setStatusRequest(nextDeliveryRequest);
        setStatusLabel(resolveStatusLabel(nextDeliveryRequest.status));
        setStepIndex(resolveStepIndex(nextDeliveryRequest.status));
        return;
      }

      const response = await axios.get('/api/pawn-delivery/status', {
        params: { contractId, lineId: effectiveLineId }
      });
      setStatusLabel(response.data.statusLabel);
      setStepIndex(response.data.stepIndex || 0);
      setStatusRequest(response.data.deliveryRequest || null);
    } catch (err) {
      // ignore polling errors
    }
  };

  useEffect(() => {
    if ((!previewMode && liffLoading) || !effectiveLineId || !contractId) return;
    fetchRequest();
  }, [liffLoading, effectiveLineId, contractId, previewMode, previewStage, previewStatus]);

  useEffect(() => {
    if (step !== 'status') return;
    fetchStatus();
    const timer = setInterval(fetchStatus, 10000);
    return () => clearInterval(timer);
  }, [step, contractId, effectiveLineId]);

  const handleConfirmPickup = async () => {
    if (!statusRequest?.delivery_request_id || !effectiveLineId) return;
    try {
      if (previewMode) {
        const nextDeliveryRequest = {
          ...statusRequest,
          status: 'ITEM_PICKED',
        };
        setStatusRequest(nextDeliveryRequest);
        setDeliveryRequest(nextDeliveryRequest);
        setStatusLabel(resolveStatusLabel(nextDeliveryRequest.status));
        setStepIndex(resolveStepIndex(nextDeliveryRequest.status));
        return;
      }

      await axios.post('/api/pawn-delivery/update-status', {
        deliveryRequestId: statusRequest.delivery_request_id,
        lineId: effectiveLineId,
        action: 'PAWNER_CONFIRMED',
      });
      await fetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'ไม่สามารถอัปเดตสถานะได้');
    }
  };

  if ((!previewMode && liffLoading) || loading) {
    return (
      <div className="theme-liff flex min-h-[100dvh] items-center justify-center bg-background-white">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (!previewMode && liffError) {
    return (
      <div className="theme-liff min-h-screen flex items-center justify-center bg-background p-6">
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <p className="text-red-500">{liffError}</p>
        </div>
      </div>
    );
  }

  if (!contractId || !contract) {
    return (
      <div className="theme-liff flex min-h-[100dvh] items-center justify-center bg-background p-6 text-center">
        <p className="text-sm font-medium text-error">ไม่พบข้อมูลสัญญา</p>
      </div>
    );
  }

  return (
    <div className="theme-liff min-h-screen bg-background-white font-sans text-foreground-muted">
      <TransactionHeader
        title="ติดตามสถานะการเข้ารับ"
        subtitle="Pawn Delivery"
        badge="Delivery"
      />

      <div className="mx-auto w-full max-w-md px-4 pb-8 pt-4">
        <div className="mb-4 rounded-xl border border-primary-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">Contract</p>
              <h1 className="mt-1 text-lg font-bold text-primary">{contract.contract_number}</h1>
            </div>
            <span className="rounded-full bg-primary-soft px-3 py-1 text-[10px] font-bold text-primary">
              Delivery
            </span>
          </div>
          <div className="space-y-1 text-sm">
            <p className="text-foreground-muted">
              <span className="text-foreground-subtle">สินค้า: </span>
              <span className="font-semibold text-foreground">{itemName}</span>
            </p>
            <p className="text-foreground-muted">
              <span className="text-foreground-subtle">Drop Point: </span>
              <span className="font-semibold text-foreground">{contract.drop_point?.drop_point_name || '-'}</span>
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
            {error}
          </div>
        )}

        {step === 'status' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary-border bg-background p-4">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">เช็คสถานะการเข้ารับสินค้า</h2>
                <span className="rounded-full bg-background-subtle px-2 py-0.5 text-[10px] text-foreground-subtle">Status</span>
              </div>
              <p className="text-xs text-foreground-subtle">{statusLabel}</p>

              <div className="mt-6">
                {STATUS_STEPS.map((label, index) => {
                  const active = index <= stepIndex;
                  const circleColor = index === 0 || index === 3 ? 'var(--success)' : 'var(--primary)';
                  return (
                    <div key={label} className="relative flex items-start gap-3 pb-6 last:pb-0">
                      <div className="relative z-10 mt-0.5">
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-full border-2"
                          style={{
                            borderColor: active ? circleColor : 'var(--line-soft)',
                            backgroundColor: active ? circleColor : 'var(--surface)',
                          }}
                        >
                          {active && <CheckCircle className="h-4 w-4 text-white" />}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm leading-relaxed ${active ? 'font-semibold text-foreground' : 'text-foreground-subtle'}`}>{label}</p>
                      </div>
                      {index < STATUS_STEPS.length - 1 && (
                        <div className="absolute left-3 top-7 h-full w-px bg-line-soft" />
                      )}
                    </div>
                  );
                })}
              </div>

              {statusRequest?.status === 'DRIVER_ASSIGNED' && (
                <button
                  onClick={handleConfirmPickup}
                  className="btn-transition btn-sheen mt-4 flex w-full min-h-12 items-center justify-center rounded-full bg-[image:var(--background-image-grad-primary)] px-4 py-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
                >
                  ยืนยันว่ารับสินค้าแล้ว
                </button>
              )}
            </div>

            <div className="rounded-xl border border-primary-border bg-background p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">ที่อยู่ผู้กู้</h2>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">Borrower Address</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-foreground-muted">{borrowerAddressLabel}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PawnDeliveryPage() {
  return (
    <Suspense
      fallback={
        <div className="theme-liff flex min-h-[100dvh] items-center justify-center bg-background-white">
          <div className="dot-bricks" />
        </div>
      }
    >
      <PawnDeliveryPageContent />
    </Suspense>
  );
}
