'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import { CheckCircle, MapPin, UploadCloud, Loader2 } from 'lucide-react';

interface ContractData {
  contract_id: string;
  contract_number: string;
  item?: { brand?: string; model?: string };
  pawner?: { firstname?: string; lastname?: string; phone_number?: string };
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

interface BankAccount {
  bank_name?: string | null;
  bank_account_no?: string | null;
  bank_account_name?: string | null;
  promptpay_number?: string | null;
}

const STATUS_STEPS = [
  'drop-point กำลังหารถไปรับของ',
  'มีรถกำลังเข้าไปรับของ',
  'รับสินค้าแล้วกำลังนำไปส่งที่ Drop Point',
  'สินค้าถึง Drop Point แล้ว อยู่ในขั้นตอนตรวจสอบ',
];

function PawnDeliveryPageContent() {
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const searchParams = useSearchParams();

  const [contractId, setContractId] = useState<string>('');
  const [contract, setContract] = useState<ContractData | null>(null);
  const [deliveryRequest, setDeliveryRequest] = useState<DeliveryRequest | null>(null);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [step, setStep] = useState<'address' | 'payment' | 'status'>('address');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let id = searchParams.get('contractId');
    if (!id) {
      const liffState = searchParams.get('liff.state');
      if (liffState) {
        const match = liffState.match(/contractId=([^&]+)/);
        if (match) id = match[1];
      }
    }
    if (id) setContractId(id);
  }, [searchParams]);

  const deliveryFee = useMemo(() => {
    return deliveryRequest?.delivery_fee ?? 40;
  }, [deliveryRequest]);

  const itemName = useMemo(() => {
    if (!contract?.item) return '-';
    return `${contract.item.brand || ''} ${contract.item.model || ''}`.trim();
  }, [contract]);

  const fetchRequest = async () => {
    if (!contractId || !profile?.userId) return;
    try {
      setLoading(true);
      const response = await axios.get('/api/pawn-delivery/request', {
        params: { contractId, lineId: profile.userId }
      });
      const data = response.data;
      setContract(data.contract || null);
      setDeliveryRequest(data.deliveryRequest || null);
      setBankAccount(data.bankAccount || null);

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
      }

      const status = data.deliveryRequest?.status || 'AWAITING_PAYMENT';
      if (['DRIVER_SEARCH', 'DRIVER_ASSIGNED', 'ITEM_PICKED', 'ARRIVED'].includes(status)) {
        setStep('status');
      } else if (data.deliveryRequest) {
        setStep('payment');
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
    if (!contractId || !profile?.userId) return;
    try {
      const response = await axios.get('/api/pawn-delivery/status', {
        params: { contractId, lineId: profile.userId }
      });
      setStatusLabel(response.data.statusLabel);
      setStepIndex(response.data.stepIndex || 0);
      setStatusRequest(response.data.deliveryRequest || null);
    } catch (err) {
      // ignore polling errors
    }
  };

  useEffect(() => {
    if (liffLoading || !profile?.userId || !contractId) return;
    fetchRequest();
  }, [liffLoading, profile?.userId, contractId]);

  useEffect(() => {
    if (step !== 'status') return;
    fetchStatus();
    const timer = setInterval(fetchStatus, 10000);
    return () => clearInterval(timer);
  }, [step, contractId, profile?.userId]);

  const handleAddressSubmit = async () => {
    if (!contractId || !profile?.userId) return;
    if (!address.houseNo || !address.district || !address.province) {
      setError('กรุณากรอกที่อยู่ให้ครบถ้วน');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const response = await axios.post('/api/pawn-delivery/request', {
        contractId,
        lineId: profile.userId,
        address,
        contactPhone,
        notes,
      });
      if (response.data?.deliveryRequestId) {
        await fetchRequest();
        setStep('payment');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'บันทึกที่อยู่ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleSlipChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSlipFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setSlipPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleVerifySlip = async () => {
    if (!slipFile || !deliveryRequest?.delivery_request_id || !profile?.userId) {
      setError('กรุณาอัปโหลดสลิปก่อน');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', slipFile);
      formData.append('folder', 'delivery-slips');

      const uploadRes = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!uploadRes.data.url) {
        throw new Error('อัปโหลดสลิปไม่สำเร็จ');
      }

      const verifyRes = await axios.post('/api/pawn-delivery/verify-slip', {
        deliveryRequestId: deliveryRequest.delivery_request_id,
        slipUrl: uploadRes.data.url,
        pawnerLineId: profile.userId,
      });

      if (verifyRes.data.success) {
        await fetchRequest();
        setStep('status');
      } else {
        setError(verifyRes.data.message || 'ตรวจสอบสลิปไม่สำเร็จ');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'ตรวจสอบสลิปไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmPickup = async () => {
    if (!statusRequest?.delivery_request_id || !profile?.userId) return;
    try {
      await axios.post('/api/pawn-delivery/update-status', {
        deliveryRequestId: statusRequest.delivery_request_id,
        lineId: profile.userId,
        action: 'PAWNER_CONFIRMED',
      });
      await fetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'ไม่สามารถอัปเดตสถานะได้');
    }
  };

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F4F2]">
        <div className="text-center text-[#686360]">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="mt-3 text-sm">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (liffError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F4F2] p-6">
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <p className="text-red-500">{liffError}</p>
        </div>
      </div>
    );
  }

  if (!contractId || !contract) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F4F2]">
        <p className="text-sm text-[#686360]">ไม่พบข้อมูลสัญญา</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F4F2] text-[#686360] px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-xs text-[#9a9694]">สัญญา</p>
          <h1 className="text-lg font-bold text-[#C0562F]">{contract.contract_number}</h1>
          <p className="mt-1 text-sm text-[#7f7b78]">สินค้า: {itemName}</p>
          <p className="text-xs text-[#9a9694]">Drop Point: {contract.drop_point?.drop_point_name || '-'}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
            {error}
          </div>
        )}

        {step === 'address' && (
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-[#686360] mb-4">ที่อยู่สำหรับให้รถรับสินค้า</h2>
            <div className="space-y-3 text-sm">
              <input
                value={address.houseNo}
                onChange={(e) => setAddress((prev) => ({ ...prev, houseNo: e.target.value }))}
                placeholder="บ้านเลขที่ / อาคาร"
                className="w-full rounded-xl border border-[#e0dcd8] px-4 py-3"
              />
              <input
                value={address.village}
                onChange={(e) => setAddress((prev) => ({ ...prev, village: e.target.value }))}
                placeholder="หมู่บ้าน / ซอย"
                className="w-full rounded-xl border border-[#e0dcd8] px-4 py-3"
              />
              <input
                value={address.street}
                onChange={(e) => setAddress((prev) => ({ ...prev, street: e.target.value }))}
                placeholder="ถนน"
                className="w-full rounded-xl border border-[#e0dcd8] px-4 py-3"
              />
              <input
                value={address.subDistrict}
                onChange={(e) => setAddress((prev) => ({ ...prev, subDistrict: e.target.value }))}
                placeholder="ตำบล/แขวง"
                className="w-full rounded-xl border border-[#e0dcd8] px-4 py-3"
              />
              <input
                value={address.district}
                onChange={(e) => setAddress((prev) => ({ ...prev, district: e.target.value }))}
                placeholder="อำเภอ/เขต"
                className="w-full rounded-xl border border-[#e0dcd8] px-4 py-3"
              />
              <input
                value={address.province}
                onChange={(e) => setAddress((prev) => ({ ...prev, province: e.target.value }))}
                placeholder="จังหวัด"
                className="w-full rounded-xl border border-[#e0dcd8] px-4 py-3"
              />
              <input
                value={address.postcode}
                onChange={(e) => setAddress((prev) => ({ ...prev, postcode: e.target.value }))}
                placeholder="รหัสไปรษณีย์"
                className="w-full rounded-xl border border-[#e0dcd8] px-4 py-3"
              />
              <input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="เบอร์ติดต่อ"
                className="w-full rounded-xl border border-[#e0dcd8] px-4 py-3"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="รายละเอียดเพิ่มเติม (เช่น เวลาเข้ารับ)"
                className="w-full rounded-xl border border-[#e0dcd8] px-4 py-3"
                rows={3}
              />
            </div>

            <button
              onClick={handleAddressSubmit}
              disabled={saving}
              className="mt-5 w-full rounded-2xl bg-[#C0562F] py-3 text-sm font-semibold text-white shadow-sm"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกที่อยู่และไปขั้นตอนถัดไป'}
            </button>
          </div>
        )}

        {step === 'payment' && (
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-[#686360] mb-2">ชำระค่าจัดส่ง</h2>
              <p className="text-sm text-[#7f7b78]">ยอดชำระ {deliveryFee.toLocaleString()} บาท</p>
              <div className="mt-4 rounded-2xl border border-[#e0dcd8] bg-[#faf7f5] p-4 text-xs text-[#7f7b78]">
                <p>ธนาคาร: {bankAccount?.bank_name || 'พร้อมเพย์'}</p>
                <p>เลขบัญชี/พร้อมเพย์: {bankAccount?.promptpay_number || bankAccount?.bank_account_no || '-'}</p>
                <p>ชื่อบัญชี: {bankAccount?.bank_account_name || '-'}</p>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-[#686360] mb-3">อัปโหลดสลิปการโอนเงิน</h3>
              <label className="flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#e0dcd8] bg-[#faf7f5] text-xs text-[#9a9694]">
                {slipPreview ? (
                  <img src={slipPreview} alt="slip" className="h-full w-full rounded-2xl object-cover" />
                ) : (
                  <>
                    <UploadCloud className="h-6 w-6 mb-2" />
                    แตะเพื่ออัปโหลดสลิป
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleSlipChange}
                />
              </label>

              <button
                onClick={handleVerifySlip}
                disabled={uploading}
                className="mt-4 w-full rounded-2xl bg-[#365314] py-3 text-sm font-semibold text-white"
              >
                {uploading ? 'กำลังตรวจสอบ...' : 'ยืนยันการชำระเงิน'}
              </button>
            </div>
          </div>
        )}

        {step === 'status' && (
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-[#686360]">เช็คสถานะการเข้ารับสินค้า</h2>
            <p className="text-xs text-[#9a9694] mt-1">{statusLabel}</p>

            <div className="mt-6">
              {STATUS_STEPS.map((label, index) => {
                const active = index <= stepIndex;
                const circleColor = index === 0 || index === 3 ? '#365314' : '#C0562F';
                return (
                  <div key={label} className="relative flex items-start gap-3 pb-6 last:pb-0">
                    <div className="relative z-10 mt-0.5">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full border-2"
                        style={{
                          borderColor: active ? circleColor : '#e0dcd8',
                          backgroundColor: active ? circleColor : '#ffffff',
                        }}
                      >
                        {active && <CheckCircle className="h-4 w-4 text-white" />}
                      </div>
                    </div>
                    <div>
                      <p className={`text-sm ${active ? 'text-[#686360]' : 'text-[#b0aca9]'}`}>{label}</p>
                    </div>
                    {index < STATUS_STEPS.length - 1 && (
                      <div className="absolute left-3 top-7 h-full w-px bg-[#e0dcd8]" />
                    )}
                  </div>
                );
              })}
            </div>

            {statusRequest?.status === 'DRIVER_ASSIGNED' && (
              <button
                onClick={handleConfirmPickup}
                className="mt-4 w-full rounded-2xl bg-[#C0562F] py-3 text-sm font-semibold text-white"
              >
                ยืนยันว่ารับสินค้าแล้ว
              </button>
            )}

            <div className="mt-4 rounded-2xl border border-[#e0dcd8] bg-[#faf7f5] p-4 text-xs text-[#7f7b78]">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-[#C0562F] mt-0.5" />
                <div>
                  <p className="font-semibold text-[#686360]">ที่อยู่รับสินค้า</p>
                  <p>{statusRequest?.address_full || deliveryRequest?.address_full || '-'}</p>
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
        <div className="min-h-screen flex items-center justify-center bg-[#F5F4F2]">
          <div className="text-center text-[#686360]">
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
