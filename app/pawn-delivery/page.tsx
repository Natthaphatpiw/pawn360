'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import { CheckCircle, Loader2, MapPin, Truck } from 'lucide-react';
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

function PawnDeliveryPageContent() {
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const searchParams = useSearchParams();
  const hasContractParam = Boolean(searchParams.get('contractId') || searchParams.get('liff.state'));
  const previewMode = searchParams.get('preview') === '1'
    || searchParams.get('mock') === '1'
    || (process.env.NEXT_PUBLIC_LIFF_MOCK === 'true' && !hasContractParam);
  const previewStage = searchParams.get('stage') || 'address';
  const previewStatus = resolveMockPawnDeliveryStatus(previewStage, searchParams.get('status') || undefined);
  const effectiveLineId = previewMode ? 'Umock_dev_user_001' : profile?.userId;

  const [contractId, setContractId] = useState<string>('');
  const [contract, setContract] = useState<ContractData | null>(null);
  const [deliveryRequest, setDeliveryRequest] = useState<DeliveryRequest | null>(null);
  const [step, setStep] = useState<'address' | 'status'>('address');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string>('');
  const [stepIndex, setStepIndex] = useState(0);
  const [statusRequest, setStatusRequest] = useState<DeliveryRequest | null>(null);

  const [address, setAddress] = useState({
    houseNo: '',
    village: '',
    street: '',
    subDistrict: '',
    district: '',
    province: '',
    postcode: '',
  });
  const [addressMode, setAddressMode] = useState<'registered' | 'other'>('registered');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');

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

  const registeredAddressLabel = useMemo(() => {
    const pawner = contract?.pawner;
    if (!pawner) return '-';
    const parts = [
      pawner.addr_house_no,
      pawner.addr_village,
      pawner.addr_street,
      pawner.addr_sub_district,
      pawner.addr_district,
      pawner.addr_province,
      pawner.addr_postcode,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '-';
  }, [contract?.pawner]);

  const fetchRequest = async () => {
    if (!contractId || !effectiveLineId) return;
    try {
      setLoading(true);
      if (previewMode) {
        const nextDeliveryRequest = previewStage === 'address'
          ? null
          : createMockPawnDeliveryRequest(previewStatus);

        setContract(mockPawnDeliveryContract);
        setDeliveryRequest(nextDeliveryRequest);
        setAddress({
          houseNo: mockPawnDeliveryContract.pawner?.addr_house_no || '',
          village: mockPawnDeliveryContract.pawner?.addr_village || '',
          street: mockPawnDeliveryContract.pawner?.addr_street || '',
          subDistrict: mockPawnDeliveryContract.pawner?.addr_sub_district || '',
          district: mockPawnDeliveryContract.pawner?.addr_district || '',
          province: mockPawnDeliveryContract.pawner?.addr_province || '',
          postcode: mockPawnDeliveryContract.pawner?.addr_postcode || '',
        });
        setContactPhone(mockPawnDeliveryContract.pawner?.phone_number || '');
        setNotes(nextDeliveryRequest?.notes || '');
        setAddressMode(nextDeliveryRequest ? 'other' : 'registered');
        setStep(nextDeliveryRequest ? 'status' : 'address');
        setStatusRequest(nextDeliveryRequest);
        setStatusLabel(resolveStatusLabel(nextDeliveryRequest?.status));
        setStepIndex(resolveStepIndex(nextDeliveryRequest?.status));
        return;
      }

      const response = await axios.get('/api/pawn-delivery/request', {
        params: { contractId, lineId: effectiveLineId }
      });
      const data = response.data;
      setContract(data.contract || null);
      setDeliveryRequest(data.deliveryRequest || null);
      // no payment step; bank account no longer needed here

      if (data.deliveryRequest) {
        setAddress({
          houseNo: data.deliveryRequest.address_house_no || '',
          village: data.deliveryRequest.address_village || '',
          street: data.deliveryRequest.address_street || '',
          subDistrict: data.deliveryRequest.address_sub_district || '',
          district: data.deliveryRequest.address_district || '',
          province: data.deliveryRequest.address_province || '',
          postcode: data.deliveryRequest.address_postcode || '',
        });
        setContactPhone(data.deliveryRequest.contact_phone || '');
        setNotes(data.deliveryRequest.notes || '');
        setAddressMode('other');
      } else if (data.contract?.pawner) {
        const pawner = data.contract.pawner;
        const hasRegisteredAddress = Boolean(
          pawner.addr_house_no ||
          pawner.addr_street ||
          pawner.addr_district ||
          pawner.addr_province ||
          pawner.addr_postcode
        );
        if (hasRegisteredAddress) {
          setAddressMode('registered');
          setAddress({
            houseNo: pawner.addr_house_no || '',
            village: pawner.addr_village || '',
            street: pawner.addr_street || '',
            subDistrict: pawner.addr_sub_district || '',
            district: pawner.addr_district || '',
            province: pawner.addr_province || '',
            postcode: pawner.addr_postcode || '',
          });
          setContactPhone(pawner.phone_number || '');
        } else {
          setAddressMode('other');
        }
      }

      if (data.deliveryRequest) {
        setStep('status');
      } else {
        setStep('address');
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

  const handleAddressSubmit = async () => {
    if (!contractId || !effectiveLineId) return;
    const useRegisteredAddress = addressMode === 'registered' && contract?.pawner;
    const resolvedAddress = useRegisteredAddress ? {
      houseNo: contract?.pawner?.addr_house_no || '',
      village: contract?.pawner?.addr_village || '',
      street: contract?.pawner?.addr_street || '',
      subDistrict: contract?.pawner?.addr_sub_district || '',
      district: contract?.pawner?.addr_district || '',
      province: contract?.pawner?.addr_province || '',
      postcode: contract?.pawner?.addr_postcode || '',
    } : address;
    const resolvedContactPhone = useRegisteredAddress ? (contract?.pawner?.phone_number || '') : contactPhone;

    if (!resolvedAddress.houseNo || !resolvedAddress.district || !resolvedAddress.province) {
      setError('กรุณากรอกที่อยู่ให้ครบถ้วน');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      if (previewMode) {
        const nextDeliveryRequest = createMockPawnDeliveryRequest('DRIVER_SEARCH');
        setDeliveryRequest(nextDeliveryRequest);
        setStatusRequest(nextDeliveryRequest);
        setStatusLabel(resolveStatusLabel(nextDeliveryRequest.status));
        setStepIndex(resolveStepIndex(nextDeliveryRequest.status));
        setStep('status');
        return;
      }

      const response = await axios.post('/api/pawn-delivery/request', {
        contractId,
        lineId: effectiveLineId,
        address: resolvedAddress,
        contactPhone: resolvedContactPhone,
        notes,
      });
      if (response.data?.deliveryRequestId) {
        await fetchRequest();
        setStep('status');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'บันทึกที่อยู่ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

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
      <div className="theme-liff min-h-screen flex items-center justify-center bg-background">
        <div className="text-center text-foreground-muted">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="mt-3 text-sm">กำลังโหลด...</p>
        </div>
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
      <div className="theme-liff min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-foreground-muted">ไม่พบข้อมูลสัญญา</p>
      </div>
    );
  }

  return (
    <div className="theme-liff min-h-screen bg-background-white font-sans text-foreground-muted">
      <TransactionHeader
        title="ติดตามสถานะการเข้ารับ"
        subtitle="Pawn Delivery"
        badge="Delivery"
        // rightSlot={
        //   <div className="flex h-9 w-9 items-center justify-center rounded-full bg-background-white text-primary">
        //     <Truck className="h-5 w-5" />
        //   </div>
        // }
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

        {step === 'address' && (
          <div className="rounded-xl border border-primary-border bg-background p-4">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">ที่อยู่สำหรับให้รถรับสินค้า</h2>
              <span className="rounded-full bg-background-subtle px-2 py-0.5 text-[10px] text-foreground-subtle">Address</span>
            </div>
            <div className="space-y-2 mb-4 text-sm">
              <label className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${addressMode === 'registered' ? 'border-primary bg-primary-soft' : 'border-primary-border bg-background-white hover:bg-background-subtle'}`}>
                <input
                  type="radio"
                  name="addressMode"
                  value="registered"
                  checked={addressMode === 'registered'}
                  onChange={() => setAddressMode('registered')}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <div>
                  <p className="font-semibold text-foreground">ใช้ที่อยู่ที่ลงทะเบียนไว้</p>
                  <p className="text-xs text-foreground-subtle mt-1">{registeredAddressLabel}</p>
                </div>
              </label>
              <label className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${addressMode === 'other' ? 'border-primary bg-primary-soft' : 'border-primary-border bg-background-white hover:bg-background-subtle'}`}>
                <input
                  type="radio"
                  name="addressMode"
                  value="other"
                  checked={addressMode === 'other'}
                  onChange={() => setAddressMode('other')}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <div>
                  <p className="font-semibold text-foreground">ใส่ที่อยู่อื่น</p>
                  <p className="text-xs text-foreground-subtle mt-1">กรอกที่อยู่สำหรับให้รถเข้ารับสินค้า</p>
                </div>
              </label>
            </div>

            <div className="space-y-3 text-sm">
              {addressMode === 'other' && (
                <>
                  <input
                    value={address.houseNo}
                    onChange={(e) => setAddress((prev) => ({ ...prev, houseNo: e.target.value }))}
                    placeholder="บ้านเลขที่ / อาคาร"
                    className="w-full min-h-12 rounded-full border border-primary/70 bg-background-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    value={address.village}
                    onChange={(e) => setAddress((prev) => ({ ...prev, village: e.target.value }))}
                    placeholder="หมู่บ้าน / ซอย"
                    className="w-full min-h-12 rounded-full border border-primary/70 bg-background-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    value={address.street}
                    onChange={(e) => setAddress((prev) => ({ ...prev, street: e.target.value }))}
                    placeholder="ถนน"
                    className="w-full min-h-12 rounded-full border border-primary/70 bg-background-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    value={address.subDistrict}
                    onChange={(e) => setAddress((prev) => ({ ...prev, subDistrict: e.target.value }))}
                    placeholder="ตำบล/แขวง"
                    className="w-full min-h-12 rounded-full border border-primary/70 bg-background-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    value={address.district}
                    onChange={(e) => setAddress((prev) => ({ ...prev, district: e.target.value }))}
                    placeholder="อำเภอ/เขต"
                    className="w-full min-h-12 rounded-full border border-primary/70 bg-background-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    value={address.province}
                    onChange={(e) => setAddress((prev) => ({ ...prev, province: e.target.value }))}
                    placeholder="จังหวัด"
                    className="w-full min-h-12 rounded-full border border-primary/70 bg-background-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    value={address.postcode}
                    onChange={(e) => setAddress((prev) => ({ ...prev, postcode: e.target.value }))}
                    placeholder="รหัสไปรษณีย์"
                    className="w-full min-h-12 rounded-full border border-primary/70 bg-background-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="เบอร์ติดต่อ"
                    className="w-full min-h-12 rounded-full border border-primary/70 bg-background-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="รายละเอียดเพิ่มเติม (เช่น เวลาเข้ารับ)"
                    className="w-full min-h-28 rounded-lg border border-primary/70 bg-background-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    rows={3}
                  />
                </>
              )}
            </div>

            <button
              onClick={handleAddressSubmit}
              disabled={saving}
              className="btn-transition btn-sheen mt-5 flex w-full min-h-12 flex-col items-center justify-center rounded-full bg-[image:var(--background-image-grad-primary)] px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-none disabled:bg-background-subtle disabled:text-foreground-subtle"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกที่อยู่และไปขั้นตอนถัดไป'}
            </button>
          </div>
        )}

        {step === 'status' && (
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

            <div className="mt-4 rounded-lg border border-primary-border bg-background-white p-4 text-xs text-foreground-muted">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-primary mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">ที่อยู่รับสินค้า</p>
                  <p className="mt-1 leading-relaxed text-foreground-subtle">{statusRequest?.address_full || deliveryRequest?.address_full || '-'}</p>
                </div>
              </div>
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
        <div className="theme-liff min-h-screen flex items-center justify-center bg-background">
          <div className="text-center text-foreground-muted">
            <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            <p className="mt-3 text-sm">กำลังโหลด...</p>
          </div>
        </div>
      }
    >
      <PawnDeliveryPageContent />
    </Suspense>
  );
}
