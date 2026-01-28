'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import { Copy, Loader2, MapPin, Phone } from 'lucide-react';

interface DeliveryRequest {
  delivery_request_id: string;
  status: string;
  address_full?: string | null;
  contact_phone?: string | null;
  delivery_fee?: number | null;
}

interface ContractData {
  contract_id: string;
  contract_number: string;
  item?: { brand?: string; model?: string };
  pawner?: { firstname?: string; lastname?: string; phone_number?: string };
  drop_point?: { drop_point_name?: string };
}

function DropPointPickupPageContent() {
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const searchParams = useSearchParams();

  const [deliveryRequestId, setDeliveryRequestId] = useState('');
  const [deliveryRequest, setDeliveryRequest] = useState<DeliveryRequest | null>(null);
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let id = searchParams.get('deliveryRequestId');
    if (!id) {
      const liffState = searchParams.get('liff.state');
      if (liffState) {
        const match = liffState.match(/deliveryRequestId=([^&]+)/);
        if (match) id = match[1];
      }
    }
    if (id) setDeliveryRequestId(id);
  }, [searchParams]);

  const fetchData = async () => {
    if (!deliveryRequestId || !profile?.userId) return;
    try {
      setLoading(true);
      const response = await axios.get('/api/pawn-delivery/drop-point', {
        params: { deliveryRequestId, lineId: profile.userId }
      });
      setDeliveryRequest(response.data.deliveryRequest || null);
      setContract(response.data.contract || null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (liffLoading || !profile?.userId || !deliveryRequestId) return;
    fetchData();
  }, [liffLoading, profile?.userId, deliveryRequestId]);

  const handleCopy = async () => {
    if (!deliveryRequest?.address_full) return;
    try {
      await navigator.clipboard.writeText(deliveryRequest.address_full);
    } catch (err) {
      setError('ไม่สามารถคัดลอกที่อยู่ได้');
    }
  };

  const handleUpdateStatus = async (action: 'DRIVER_ASSIGNED' | 'ARRIVED') => {
    if (!deliveryRequest?.delivery_request_id || !profile?.userId) return;
    try {
      setUpdating(true);
      await axios.post('/api/pawn-delivery/update-status', {
        deliveryRequestId: deliveryRequest.delivery_request_id,
        lineId: profile.userId,
        action,
      });
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'อัปเดตสถานะไม่สำเร็จ');
    } finally {
      setUpdating(false);
    }
  };

  const itemName = contract?.item ? `${contract.item.brand || ''} ${contract.item.model || ''}`.trim() : '-';

  const canAssignDriver = deliveryRequest?.status === 'DRIVER_SEARCH' || deliveryRequest?.status === 'PAYMENT_VERIFIED';
  const canMarkArrived = deliveryRequest?.status === 'ITEM_PICKED';

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
        <div className="text-center text-[#365314]">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="mt-2 text-sm">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (liffError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] p-6">
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <p className="text-red-500">{liffError}</p>
        </div>
      </div>
    );
  }

  if (!deliveryRequest || !contract) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
        <p className="text-sm text-[#686360]">ไม่พบข้อมูลการรับสินค้า</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#365314] px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
            {error}
          </div>
        )}

        <div className="rounded-3xl bg-white p-5 shadow-sm mb-4">
          <p className="text-xs text-[#9a9694]">สัญญา</p>
          <h1 className="text-lg font-bold text-[#365314]">{contract.contract_number}</h1>
          <p className="mt-1 text-sm text-[#6b7280]">สินค้า: {itemName}</p>
          <p className="text-xs text-[#9a9694]">Drop Point: {contract.drop_point?.drop_point_name || '-'}</p>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm mb-4">
          <h2 className="text-sm font-bold text-[#365314] mb-3">ที่อยู่รับสินค้า</h2>
          <div className="flex items-start gap-2 text-sm text-[#4b5563]">
            <MapPin className="h-4 w-4 mt-0.5" />
            <p>{deliveryRequest.address_full || '-'}</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#4b5563] mt-2">
            <Phone className="h-4 w-4" />
            <span>{deliveryRequest.contact_phone || '-'}</span>
          </div>
          <button
            onClick={handleCopy}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#365314] px-4 py-2 text-xs text-[#365314]"
          >
            <Copy className="h-3.5 w-3.5" />
            คัดลอกที่อยู่
          </button>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#365314] mb-3">อัปเดตสถานะรับของ</h2>
          <p className="text-xs text-[#6b7280] mb-4">สถานะปัจจุบัน: {deliveryRequest.status}</p>

          <div className="space-y-3">
            <button
              onClick={() => handleUpdateStatus('DRIVER_ASSIGNED')}
              disabled={!canAssignDriver || updating}
              className={`w-full rounded-2xl py-3 text-sm font-semibold text-white ${
                canAssignDriver ? 'bg-[#365314]' : 'bg-gray-300'
              }`}
            >
              มีรถมารับงานแล้ว
            </button>
            <button
              onClick={() => handleUpdateStatus('ARRIVED')}
              disabled={!canMarkArrived || updating}
              className={`w-full rounded-2xl py-3 text-sm font-semibold text-white ${
                canMarkArrived ? 'bg-[#C0562F]' : 'bg-gray-300'
              }`}
            >
              สินค้าถึง Drop Point แล้ว
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DropPointPickupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
          <div className="text-center text-[#365314]">
            <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            <p className="mt-2 text-sm">กำลังโหลด...</p>
          </div>
        </div>
      }
    >
      <DropPointPickupPageContent />
    </Suspense>
  );
}
