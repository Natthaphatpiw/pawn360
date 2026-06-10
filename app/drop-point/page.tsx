'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { Clock3, PackageCheck, PackageOpen, Phone } from 'lucide-react';
import ImageCarousel from '@/components/ImageCarousel';
import { openLiffEntry } from '@/lib/liff/navigation';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';
import {
  getMockContractDetail,
  isDropPointMockEnabled,
  mockContracts,
  mockDropPoint,
} from '@/lib/mock-drop-point';
import {
  DropPointCard,
  DropPointHeroCard,
  DropPointLoadingScreen,
  DropPointMessageState,
  DropPointPageShell,
  DropPointStatusBadge,
} from '@/components/drop-point/ui';

type DropPoint = {
  drop_point_id: string;
  drop_point_name: string;
  drop_point_code?: string;
  phone_number?: string;
};

type ContractListItem = {
  contract_id: string;
  contract_number: string;
  item_delivery_status: string;
  displayStatus: string;
  displayDate?: string;
  storage_box_code?: string | null;
  delivery_request_id?: string | null;
  delivery_request_status?: string | null;
  statusGroup?: 'WAITING_DRIVER' | 'INCOMING' | 'ARRIVED' | 'UNKNOWN';
  items?: {
    brand?: string;
    model?: string;
    item_type?: string;
    image_urls?: string[];
  };
};

type ContractDetail = ReturnType<typeof getMockContractDetail>;

const ARRIVED_AT_DROP_POINT_STATUSES = ['RECEIVED_AT_DROP_POINT', 'ARRIVED_AT_DROP_POINT'];

function formatDate(dateString?: string) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function DropPointContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading } = useLiff();
  const previewMode = isDropPointMockEnabled(searchParams);

  const [loading, setLoading] = useState(true);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [dropPoint, setDropPoint] = useState<DropPoint | null>(null);
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [contractDetail, setContractDetail] = useState<ContractDetail>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatingArrival, setUpdatingArrival] = useState(false);

  let contractId = searchParams.get('contractId');
  if (!contractId) {
    const liffState = searchParams.get('liff.state');
    if (liffState) {
      const match = liffState.match(/contractId=([^&]+)/);
      if (match) contractId = match[1];
    }
  }

  useEffect(() => {
    if (previewMode) {
      setPinVerified(true);
      return;
    }
    if (!profile?.userId) return;

    const session = getPinSession('DROP_POINT', profile.userId);
    if (session?.token) {
      setPinVerified(true);
      return;
    }

    setPinVerified(false);
    setPinModalOpen(true);
  }, [previewMode, profile?.userId]);

  useEffect(() => {
    const load = async () => {
      if (previewMode) {
        setDropPoint(mockDropPoint);
        setContracts(mockContracts);
        setContractDetail(contractId ? getMockContractDetail(contractId) : null);
        setLoading(false);
        return;
      }

      if (liffLoading || !profile?.userId || !pinVerified) return;
      try {
        setLoading(true);
        setError(null);
        if (contractId) {
          const response = await axios.get(`/api/drop-points/contracts/detail/${contractId}?lineId=${profile.userId}`);
          setContractDetail(response.data.contract);
        } else {
          const response = await axios.get(`/api/drop-points/contracts/${profile.userId}`);
          setDropPoint(response.data.dropPoint);
          setContracts(response.data.contracts || []);
        }
      } catch (fetchError: any) {
        setError(fetchError.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [previewMode, liffLoading, profile?.userId, contractId, pinVerified]);

  const incomingContracts = useMemo(
    () => contracts.filter((contract) => contract.statusGroup === 'INCOMING'),
    [contracts]
  );

  const waitingDriverContracts = useMemo(
    () => contracts.filter((contract) => contract.statusGroup === 'WAITING_DRIVER'),
    [contracts]
  );

  const arrivedContracts = useMemo(
    () => contracts.filter((contract) => contract.statusGroup === 'ARRIVED'),
    [contracts]
  );

  if (liffLoading && !previewMode) {
    return <DropPointLoadingScreen />;
  }

  if (!previewMode && !pinVerified) {
    return (
      <DropPointPageShell className="flex items-center justify-center p-6">
        <div className="register-shell-strong w-full max-w-md rounded-[30px] p-4">
          <div className="register-inner-card rounded-lg px-5 py-6 text-center">
            <h2 className="register-heading text-xl font-semibold">ยืนยัน PIN ก่อนเข้าดูรายการ</h2>
            <p className="register-subtle mt-2 text-sm">
              เพื่อความปลอดภัย กรุณายืนยัน PIN 6 หลักก่อนดูข้อมูล Drop Point
            </p>
            <button
              onClick={() => setPinModalOpen(true)}
              className="register-primary-btn mt-5 w-full rounded-2xl py-3 text-sm font-medium"
            >
              ยืนยัน PIN
            </button>
          </div>
        </div>
        <PinModal
          open={pinModalOpen}
          role="DROP_POINT"
          lineId={profile?.userId || ''}
          onClose={() => setPinModalOpen(false)}
          onVerified={() => {
            setPinVerified(true);
            setPinModalOpen(false);
          }}
        />
      </DropPointPageShell>
    );
  }

  if (loading) {
    return <DropPointLoadingScreen />;
  }

  if (error) {
    return (
      <DropPointMessageState
        title="โหลดข้อมูลไม่สำเร็จ"
        description={error}
        action={(
          <button
            onClick={() =>
              openLiffEntry({
                liffIdCandidates: [
                  process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT,
                  process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_REGISTER,
                ],
                fallbackPath: '/register-droppoint',
              })
            }
            className="register-primary-btn rounded-full px-5 py-3 text-sm font-medium"
          >
            ไปหน้าลงทะเบียน Drop Point
          </button>
        )}
      />
    );
  }

  if (contractId && !contractDetail) {
    return <DropPointMessageState title="ไม่พบข้อมูลสัญญา" description="ลองกลับไปหน้าเมนูหลักของ Drop Point อีกครั้ง" />;
  }

  if (contractId && contractDetail) {
    const waitingDriverRequestStatuses = ['DRIVER_SEARCH', 'PAYMENT_VERIFIED', 'AWAITING_PAYMENT', 'PAYMENT_REJECTED', 'SLIP_UPLOADED'];
    const isIncomingToDropPoint = ['PAWNER_CONFIRMED', 'IN_TRANSIT'].includes(contractDetail.item_delivery_status);
    const isArrivedAtDropPoint = ARRIVED_AT_DROP_POINT_STATUSES.includes(contractDetail.item_delivery_status);
    const isWaitingDriver = contractDetail.item_delivery_status === 'PENDING'
      && waitingDriverRequestStatuses.includes(contractDetail.delivery_request_status || '');
    const statusText = isWaitingDriver
      ? 'รอเรียกรถ'
      : contractDetail.item_delivery_status === 'VERIFIED'
      ? 'ตรวจสอบแล้ว'
      : isArrivedAtDropPoint
      ? 'รอตรวจสอบ'
      : isIncomingToDropPoint
        ? 'กำลังจัดส่งมา'
        : 'รอตรวจสอบ';
    const canAssignDriver = isWaitingDriver && Boolean(contractDetail.delivery_request_id);
    const canMarkArrived = (
      isIncomingToDropPoint || contractDetail.delivery_request_status === 'ITEM_PICKED'
    ) && !isArrivedAtDropPoint && Boolean(contractDetail.delivery_request_id);
    const canVerify = isArrivedAtDropPoint
      || (contractDetail.item_delivery_status === 'VERIFIED' && !contractDetail.item_verified_at);
    const statusTone = isWaitingDriver
      ? 'neutral'
      : isArrivedAtDropPoint
      ? 'success'
      : isIncomingToDropPoint
        ? 'warning'
        : 'success';

    const handleAssignDriver = async () => {
      if (!contractDetail?.delivery_request_id) return;

      if (previewMode) {
        setUpdatingArrival(true);
        setTimeout(() => {
          setContractDetail((prev) => prev ? {
            ...prev,
            item_delivery_status: 'IN_TRANSIT',
            delivery_request_status: 'DRIVER_ASSIGNED',
            updated_at: new Date().toISOString(),
          } : prev);
          setUpdatingArrival(false);
        }, 400);
        return;
      }

      if (!profile?.userId) {
        setError('ไม่พบผู้ใช้งาน LINE');
        return;
      }

      try {
        setUpdatingArrival(true);
        setError(null);
        await axios.post('/api/pawn-delivery/update-status', {
          deliveryRequestId: contractDetail.delivery_request_id,
          lineId: profile.userId,
          action: 'DRIVER_ASSIGNED',
        });

        const response = await axios.get(`/api/drop-points/contracts/detail/${contractDetail.contract_id}?lineId=${profile.userId}`);
        setContractDetail(response.data.contract);
      } catch (assignError: any) {
        setError(assignError.response?.data?.error || 'ไม่สามารถอัปเดตสถานะได้');
      } finally {
        setUpdatingArrival(false);
      }
    };

    const handleMarkArrived = async () => {
      if (!contractDetail?.delivery_request_id) return;

      if (previewMode) {
        setUpdatingArrival(true);
        setTimeout(() => {
          setContractDetail((prev) => prev ? {
            ...prev,
            item_delivery_status: 'RECEIVED_AT_DROP_POINT',
            item_received_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } : prev);
          setUpdatingArrival(false);
        }, 400);
        return;
      }

      if (!profile?.userId) {
        setError('ไม่พบผู้ใช้งาน LINE');
        return;
      }

      try {
        setUpdatingArrival(true);
        setError(null);
        await axios.post('/api/pawn-delivery/update-status', {
          deliveryRequestId: contractDetail.delivery_request_id,
          lineId: profile.userId,
          action: 'ARRIVED',
        });

        const response = await axios.get(`/api/drop-points/contracts/detail/${contractDetail.contract_id}?lineId=${profile.userId}`);
        setContractDetail(response.data.contract);
      } catch (arrivalError: any) {
        setError(arrivalError.response?.data?.error || 'ไม่สามารถอัปเดตสถานะได้');
      } finally {
        setUpdatingArrival(false);
      }
    };

    return (
      <DropPointPageShell>
        <DropPointHeroCard
          eyebrow={previewMode ? 'Preview Mode' : 'Drop Point'}
          title={`${contractDetail.items.brand} ${contractDetail.items.model}`}
          subtitle={`หมายเลขสัญญา ${contractDetail.contract_number}`}
        >
          <div className="flex flex-wrap gap-2">
            <DropPointStatusBadge
              tone={statusTone}
              className={isWaitingDriver ? 'border border-s3-border/70' : ''}
            >
              {statusText}
            </DropPointStatusBadge>
            {contractDetail.storage_box_code ? (
              <DropPointStatusBadge tone="neutral">กล่อง {contractDetail.storage_box_code}</DropPointStatusBadge>
            ) : null}
          </div>
        </DropPointHeroCard>

        <div className="mt-4 space-y-4">
          {error ? <DropPointCard className="register-status-error text-sm">{error}</DropPointCard> : null}
          <DropPointCard>
            <div className="grid gap-3 text-sm text-foreground-muted">
              <div>วันส่งมา: {formatDate(contractDetail.item_received_at || contractDetail.updated_at || contractDetail.created_at)}</div>
              <div>ความจุ: {contractDetail.items.capacity || '-'}</div>
              <div>สภาพที่ลูกค้าระบุ: {contractDetail.items.item_condition || '-'}%</div>
              <div>หมายเหตุ: {contractDetail.items.notes || '-'}</div>
            </div>
          </DropPointCard>

          <DropPointCard>
            <div className="mb-3 flex items-center gap-2">
              <Phone className="h-4 w-4 register-accent" />
              <div className="register-heading text-sm font-semibold">ข้อมูลลูกค้า</div>
            </div>
            <div className="space-y-1 text-sm text-foreground-muted">
              <div>{contractDetail.pawners.firstname} {contractDetail.pawners.lastname}</div>
              <div>{contractDetail.pawners.phone_number}</div>
            </div>
          </DropPointCard>

          <DropPointCard>
            <div className="register-heading mb-3 text-sm font-semibold">รูปถ่ายสินค้า</div>
            <ImageCarousel
              images={contractDetail.items.image_urls}
              className="no-scrollbar"
              itemClassName="w-36 aspect-square rounded-lg overflow-hidden bg-background-subtle"
              emptyLabel="No Image"
              emptyClassName="w-full text-center text-foreground-subtle text-xs"
            />
          </DropPointCard>

          {canAssignDriver ? (
            <button
              onClick={handleAssignDriver}
              disabled={updatingArrival}
              className="register-primary-btn w-full rounded-full py-3 text-base font-medium disabled:opacity-50"
            >
              {updatingArrival ? 'กำลังอัปเดต...' : 'มีรถรับงานแล้ว'}
            </button>
          ) : null}

          {canMarkArrived ? (
            <button
              onClick={handleMarkArrived}
              disabled={updatingArrival}
              className="register-primary-btn w-full rounded-full py-3 text-base font-medium disabled:opacity-50"
            >
              {updatingArrival ? 'กำลังอัปเดต...' : 'สินค้าถึง Drop Point แล้ว'}
            </button>
          ) : null}

          {canVerify ? (
            <button
              onClick={() => router.push(previewMode ? `/droppoint-verify?mock=1&contractId=${contractDetail.contract_id}` : `/droppoint-verify?contractId=${contractDetail.contract_id}`)}
              className="register-primary-btn w-full rounded-full py-3 text-base font-medium"
            >
              ตรวจสอบสินค้า
            </button>
          ) : contractDetail.item_delivery_status === 'VERIFIED' && contractDetail.item_verified_at ? (
            <div className="register-panel rounded-lg p-4 text-center text-sm text-foreground-subtle">
              ตรวจสอบสินค้าเรียบร้อยแล้ว
            </div>
          ) : null}
        </div>
      </DropPointPageShell>
    );
  }

  return (
    <DropPointPageShell className="pb-28">
      <DropPointHeroCard
        eyebrow={previewMode ? 'Preview Mode' : 'Drop Point'}
        title="รายการสินค้ารับฝาก"
        subtitle={dropPoint?.drop_point_name || 'Drop Point'}
      >
        <div className="grid grid-cols-3 gap-3">
          <DropPointCard className="register-surface-strong">
            <div className="text-xs register-subtle">รอเรียกรถ</div>
            <div className="register-accent mt-1 text-2xl font-semibold">{waitingDriverContracts.length}</div>
          </DropPointCard>
          <DropPointCard className="register-surface-strong">
            <div className="text-xs register-subtle">กำลังมา</div>
            <div className="register-accent mt-1 text-2xl font-semibold">{incomingContracts.length}</div>
          </DropPointCard>
          <DropPointCard className="register-surface-strong">
            <div className="text-xs register-subtle">ถึงแล้ว</div>
            <div className="register-accent mt-1 text-2xl font-semibold">{arrivedContracts.length}</div>
          </DropPointCard>
        </div>
      </DropPointHeroCard>

      <div className="mt-5 space-y-4">
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Clock3 className="h-4 w-4 register-accent" />
            <h2 className="text-sm font-semibold text-foreground">รอเรียกรถ</h2>
          </div>
          {waitingDriverContracts.length === 0 ? (
            <DropPointCard className="text-center text-sm text-foreground-subtle">ไม่มีรายการรอเรียกรถ</DropPointCard>
          ) : waitingDriverContracts.map((contract) => (
            <button
              key={contract.contract_id}
              onClick={() => router.push(`/drop-point?contractId=${contract.contract_id}${previewMode ? '&mock=1' : ''}`)}
              className="register-panel mb-3 w-full rounded-lg p-4 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="register-heading text-base font-semibold">
                    {contract.items?.brand} {contract.items?.model}
                  </div>
                  <div className="register-subtle mt-1 text-xs">อัปเดตล่าสุด: {formatDate(contract.displayDate)}</div>
                  <div className="register-subtle text-xs">สัญญา {contract.contract_number}</div>
                </div>
                <DropPointStatusBadge tone="neutral" className="border border-s3-border/70">รอเรียกรถ</DropPointStatusBadge>
              </div>
            </button>
          ))}
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-semibold text-foreground">กำลังมา</h2>
          </div>
          {incomingContracts.length === 0 ? (
            <DropPointCard className="text-center text-sm text-foreground-subtle">ไม่มีรายการกำลังมา</DropPointCard>
          ) : incomingContracts.map((contract) => (
            <button
              key={contract.contract_id}
              onClick={() => router.push(`/drop-point?contractId=${contract.contract_id}${previewMode ? '&mock=1' : ''}`)}
              className="register-panel mb-3 w-full rounded-lg p-4 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="register-heading text-base font-semibold">
                    {contract.items?.brand} {contract.items?.model}
                  </div>
                  <div className="register-subtle mt-1 text-xs">วันที่ส่งมา: {formatDate(contract.displayDate)}</div>
                  <div className="register-subtle text-xs">สัญญา {contract.contract_number}</div>
                </div>
                <DropPointStatusBadge tone="warning">กำลังมา</DropPointStatusBadge>
              </div>
            </button>
          ))}
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-success" />
            <h2 className="text-sm font-semibold text-foreground">ถึงแล้ว / รอตรวจสอบ</h2>
          </div>
          {arrivedContracts.length === 0 ? (
            <DropPointCard className="text-center text-sm text-foreground-subtle">ยังไม่มีรายการถึงจุดรับฝาก</DropPointCard>
          ) : arrivedContracts.map((contract) => (
            <button
              key={contract.contract_id}
              onClick={() => router.push(`/drop-point?contractId=${contract.contract_id}${previewMode ? '&mock=1' : ''}`)}
              className="register-panel mb-3 w-full rounded-lg p-4 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="register-heading text-base font-semibold">
                    {contract.items?.brand} {contract.items?.model}
                  </div>
                  <div className="register-subtle mt-1 text-xs">อัปเดตล่าสุด: {formatDate(contract.displayDate)}</div>
                  {contract.storage_box_code ? <div className="register-subtle text-xs">กล่อง {contract.storage_box_code}</div> : null}
                </div>
                <DropPointStatusBadge tone="success">รอตรวจสอบ</DropPointStatusBadge>
              </div>
            </button>
          ))}
        </section>

        {previewMode ? (
          <DropPointCard className="register-surface-muted">
            <div className="mb-3 flex items-center gap-2">
              <PackageOpen className="h-4 w-4 register-accent" />
              <div className="register-heading text-sm font-semibold">หน้าที่เกี่ยวข้องสำหรับ Preview</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => router.push('/drop-point-pickup?mock=1&deliveryRequestId=dr_mock_01')} className="register-outline-btn rounded-lg px-3 py-2 text-sm">Pickup</button>
              <button onClick={() => router.push('/drop-point-returns?mock=1&redemptionId=rd_mock_01')} className="register-outline-btn rounded-lg px-3 py-2 text-sm">Return Detail</button>
              <button onClick={() => router.push('/droppoint-verify?mock=1&contractId=ct_mock_arrived_01')} className="register-outline-btn rounded-lg px-3 py-2 text-sm">Verify</button>
              <button onClick={() => router.push('/drop-point-history?mock=1')} className="register-outline-btn rounded-lg px-3 py-2 text-sm">History</button>
              <button onClick={() => router.push('/drop-point-dashboard?mock=1')} className="register-outline-btn rounded-lg px-3 py-2 text-sm">Dashboard</button>
            </div>
          </DropPointCard>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(var(--safe-bottom)+16px)] pt-3">
        <div className="mx-auto grid w-full max-w-md grid-cols-3 gap-3 rounded-[28px] border border-s3-border/60 bg-background-white/92 p-3 shadow-soft backdrop-blur">
          <button
            onClick={() => router.push(previewMode ? '/drop-point-dashboard?mock=1' : '/drop-point-dashboard')}
            className="register-secondary-btn rounded-2xl py-3 text-sm font-medium"
          >
            Dashboard
          </button>
          <button
            onClick={() => router.push(previewMode ? '/drop-point-history?mock=1' : '/drop-point-history')}
            className="register-secondary-btn rounded-2xl py-3 text-sm font-medium"
          >
            ประวัติ
          </button>
          <button
            onClick={() => router.push(previewMode ? '/drop-point-returns?mock=1' : '/drop-point-returns')}
            className="register-primary-btn rounded-2xl py-3 text-sm font-medium"
          >
            ดูรายการส่งคืน
          </button>
        </div>
      </div>

      {!previewMode ? (
        <PinModal
          open={pinModalOpen}
          role="DROP_POINT"
          lineId={profile?.userId || ''}
          onClose={() => setPinModalOpen(false)}
          onVerified={() => {
            setPinVerified(true);
            setPinModalOpen(false);
          }}
        />
      ) : null}
    </DropPointPageShell>
  );
}

export default function DropPointPage() {
  return (
    <Suspense fallback={<DropPointLoadingScreen />}>
      <DropPointContent />
    </Suspense>
  );
}
