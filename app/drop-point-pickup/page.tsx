'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import { Copy, MapPin, Phone, Truck } from 'lucide-react';
import { isDropPointMockEnabled, mockPickupData } from '@/lib/mock-drop-point';
import {
  DropPointCard,
  DropPointHeroCard,
  DropPointLoadingScreen,
  DropPointMessageState,
  DropPointPageShell,
  DropPointStatusBadge,
} from '@/components/drop-point/ui';

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

function statusLabel(status?: string) {
  if (status === 'DRIVER_SEARCH' || status === 'PAYMENT_VERIFIED') return 'กำลังหาคนขับ';
  if (status === 'ITEM_PICKED') return 'กำลังนำส่ง';
  if (status === 'ARRIVED_AT_DROP_POINT') return 'รอตรวจสอบ';
  return status || '-';
}

function statusTone(status?: string): 'success' | 'warning' | 'neutral' {
  if (status === 'ITEM_PICKED') return 'warning';
  if (status === 'ARRIVED_AT_DROP_POINT') return 'success';
  return 'neutral';
}

function DropPointPickupPageContent() {
  const router = useRouter();
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const searchParams = useSearchParams();
  const previewMode = isDropPointMockEnabled(searchParams);

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

  useEffect(() => {
    const load = async () => {
      if (previewMode) {
        setDeliveryRequest(mockPickupData.deliveryRequest);
        setContract(mockPickupData.contract);
        setLoading(false);
        return;
      }

      if (liffLoading || !profile?.userId || !deliveryRequestId) return;
      try {
        setLoading(true);
        const response = await axios.get('/api/pawn-delivery/drop-point', {
          params: { deliveryRequestId, lineId: profile.userId },
        });
        setDeliveryRequest(response.data.deliveryRequest || null);
        setContract(response.data.contract || null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [previewMode, liffLoading, profile?.userId, deliveryRequestId]);

  const handleCopy = async () => {
    if (!deliveryRequest?.address_full) return;
    try {
      await navigator.clipboard.writeText(deliveryRequest.address_full);
    } catch {
      setError('ไม่สามารถคัดลอกที่อยู่ได้');
    }
  };

  const handleUpdateStatus = async (action: 'DRIVER_ASSIGNED' | 'ARRIVED') => {
    if (previewMode) {
      setDeliveryRequest((prev) => prev ? {
        ...prev,
        status: action === 'DRIVER_ASSIGNED' ? 'ITEM_PICKED' : 'ARRIVED_AT_DROP_POINT',
      } : prev);
      return;
    }

    if (!deliveryRequest?.delivery_request_id || !profile?.userId) return;
    try {
      setUpdating(true);
      await axios.post('/api/pawn-delivery/update-status', {
        deliveryRequestId: deliveryRequest.delivery_request_id,
        lineId: profile.userId,
        action,
      });
      const response = await axios.get('/api/pawn-delivery/drop-point', {
        params: { deliveryRequestId, lineId: profile.userId },
      });
      setDeliveryRequest(response.data.deliveryRequest || null);
      setContract(response.data.contract || null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'อัปเดตสถานะไม่สำเร็จ');
    } finally {
      setUpdating(false);
    }
  };

  const itemName = contract?.item ? `${contract.item.brand || ''} ${contract.item.model || ''}`.trim() : '-';
  const canAssignDriver = deliveryRequest?.status === 'DRIVER_SEARCH' || deliveryRequest?.status === 'PAYMENT_VERIFIED';
  const canMarkArrived = deliveryRequest?.status === 'ITEM_PICKED';
  const canVerify = deliveryRequest?.status === 'ARRIVED_AT_DROP_POINT';

  if ((liffLoading && !previewMode) || loading) return <DropPointLoadingScreen />;
  if (liffError) return <DropPointMessageState title="เชื่อมต่อ LIFF ไม่สำเร็จ" description={liffError} />;
  if (error) return <DropPointMessageState title="โหลดข้อมูลไม่สำเร็จ" description={error} />;
  if (!deliveryRequest || !contract) return <DropPointMessageState title="ไม่พบข้อมูลการรับสินค้า" />;

  return (
    <DropPointPageShell>
      <DropPointHeroCard
        eyebrow={previewMode ? 'Preview Mode' : 'Pickup'}
        title={contract.contract_number}
        subtitle={`สินค้า: ${itemName}`}
      >
        <div className="flex flex-wrap gap-2">
          <DropPointStatusBadge tone={statusTone(deliveryRequest.status)}>{statusLabel(deliveryRequest.status)}</DropPointStatusBadge>
          <DropPointStatusBadge tone="neutral">{contract.drop_point?.drop_point_name || '-'}</DropPointStatusBadge>
        </div>
      </DropPointHeroCard>

      <div className="mt-4 space-y-4">
        <DropPointCard>
          <div className="register-heading mb-3 flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 register-accent" />
            ที่อยู่รับสินค้า
          </div>
          <div className="space-y-2 text-sm text-foreground-muted">
            <div>{deliveryRequest.address_full || '-'}</div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              <span>{deliveryRequest.contact_phone || '-'}</span>
            </div>
          </div>
          <button onClick={handleCopy} className="register-outline-btn mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium">
            <Copy className="h-3.5 w-3.5" />
            คัดลอกที่อยู่
          </button>
        </DropPointCard>

        <DropPointCard>
          <div className="register-heading mb-3 flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4 register-accent" />
            อัปเดตสถานะรับของ
          </div>
          <p className="register-subtle mb-4 text-xs">สถานะปัจจุบัน: {statusLabel(deliveryRequest.status)}</p>

          <div className="space-y-3">
            <button
              onClick={() => handleUpdateStatus('DRIVER_ASSIGNED')}
              disabled={!canAssignDriver || updating}
              className="register-primary-btn w-full rounded-2xl py-3 text-sm font-medium disabled:opacity-50"
            >
              มีรถมารับงานแล้ว
            </button>
            <button
              onClick={() => handleUpdateStatus('ARRIVED')}
              disabled={!canMarkArrived || updating}
              className="register-secondary-btn w-full rounded-2xl py-3 text-sm font-medium disabled:opacity-50"
            >
              สินค้าถึง Drop Point แล้ว
            </button>
            {canVerify ? (
              <button
                onClick={() => router.push(previewMode ? `/droppoint-verify?mock=1&contractId=${contract.contract_id}` : `/droppoint-verify?contractId=${contract.contract_id}`)}
                className="register-primary-btn w-full rounded-2xl py-3 text-sm font-medium"
              >
                ตรวจสอบสินค้า
              </button>
            ) : null}
          </div>
        </DropPointCard>
      </div>
    </DropPointPageShell>
  );
}

export default function DropPointPickupPage() {
  return (
    <Suspense fallback={<DropPointLoadingScreen />}>
      <DropPointPickupPageContent />
    </Suspense>
  );
}
