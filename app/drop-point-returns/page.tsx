'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { Camera, QrCode, RefreshCw } from 'lucide-react';
import ImageCarousel from '@/components/ImageCarousel';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';
import {
  getMockRedemptionDetail,
  isDropPointMockEnabled,
  mockRedemptions,
} from '@/lib/mock-drop-point';
import {
  DropPointCard,
  DropPointHeroCard,
  DropPointLoadingScreen,
  DropPointMessageState,
  DropPointPageShell,
  DropPointStatusBadge,
} from '@/components/drop-point/ui';

type RedemptionItem = (typeof mockRedemptions)[number];
type RedemptionDetail = NonNullable<ReturnType<typeof getMockRedemptionDetail>>;

function formatDate(dateString?: string) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function DropPointReturnsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profile, isLoading: liffLoading } = useLiff();
  const previewMode = isDropPointMockEnabled(searchParams);

  const [loading, setLoading] = useState(true);
  const [pinVerified, setPinVerified] = useState(false);
  const [redemptions, setRedemptions] = useState<RedemptionItem[]>([]);
  const [detail, setDetail] = useState<RedemptionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [returnPhotos, setReturnPhotos] = useState<Array<string | null>>([null, null]);
  const [returnBagNumber, setReturnBagNumber] = useState('');
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const returnPhotoInputRef1 = useRef<HTMLInputElement>(null);
  const returnPhotoInputRef2 = useRef<HTMLInputElement>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const pendingActionRef = useRef<((token: string) => void) | null>(null);

  let redemptionId = searchParams.get('redemptionId');
  if (!redemptionId) {
    const liffState = searchParams.get('liff.state');
    if (liffState) {
      const match = liffState.match(/redemptionId=([^&]+)/);
      if (match) redemptionId = match[1];
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
        setRedemptions(mockRedemptions);
        setDetail(redemptionId ? getMockRedemptionDetail(redemptionId) : null);
        setLoading(false);
        return;
      }
      if (liffLoading || !profile?.userId || !pinVerified) return;
      try {
        setLoading(true);
        if (redemptionId) {
          const response = await axios.get(`/api/drop-points/returns/detail/${redemptionId}?lineId=${profile.userId}`);
          setDetail(response.data.redemption);
        } else {
          const response = await axios.get(`/api/drop-points/returns/${profile.userId}`);
          setRedemptions(response.data.redemptions || []);
        }
      } catch (fetchError: any) {
        setError(fetchError.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [previewMode, liffLoading, profile?.userId, redemptionId, pinVerified]);

  useEffect(() => {
    if (!detail) return;
    const nextPhotos: Array<string | null> = [null, null];
    detail.drop_point_return_photos?.slice(0, 2).forEach((url, index) => {
      nextPhotos[index] = url;
    });
    setReturnPhotos(nextPhotos);
    setReturnBagNumber(detail.bag_number || '');
  }, [detail]);

  const submitConfirmReturn = async (pinToken: string) => {
    if (!detail) return;
    if (!returnBagNumber.trim()) {
      alert('กรุณากรอกหมายเลขถุงก่อนยืนยันการส่งคืน');
      return;
    }
    if (!returnPhotos[0] || !returnPhotos[1]) {
      alert('กรุณาถ่ายรูปให้ครบ 2 รูปก่อนยืนยันการส่งคืน');
      return;
    }

    if (previewMode) {
      setConfirming(true);
      setTimeout(() => {
        setConfirming(false);
        setConfirmed(true);
      }, 500);
      return;
    }

    try {
      setConfirming(true);
      const response = await axios.post('/api/drop-points/returns/confirm', {
        redemptionId: detail.redemption_id,
        lineId: profile?.userId,
        bagNumber: returnBagNumber.trim().toUpperCase(),
        returnPhotos: returnPhotos.filter((photo): photo is string => Boolean(photo)),
        pinToken,
      });
      if (response.data.success) setConfirmed(true);
    } catch (confirmError: any) {
      alert(confirmError.response?.data?.error || 'เกิดข้อผิดพลาด');
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmReturn = async () => {
    if (previewMode) {
      await submitConfirmReturn('mock-token');
      return;
    }
    if (!profile?.userId) {
      alert('กรุณาเข้าสู่ระบบ LINE');
      return;
    }
    const session = getPinSession('DROP_POINT', profile.userId);
    if (session?.token) {
      await submitConfirmReturn(session.token);
      return;
    }
    pendingActionRef.current = async (token: string) => {
      await submitConfirmReturn(token);
    };
    setPinModalOpen(true);
  };

  const handleReturnPhotoChange = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (previewMode) {
      setUploadingIndex(index);
      setTimeout(() => {
        setReturnPhotos((prev) => {
          const next = [...prev];
          next[index] = URL.createObjectURL(file);
          return next;
        });
        setUploadingIndex(null);
      }, 300);
      return;
    }

    try {
      setUploadingIndex(index);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'drop-point-returns');
      const response = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.data.url) {
        setReturnPhotos((prev) => {
          const next = [...prev];
          next[index] = response.data.url;
          return next;
        });
      }
    } catch {
      alert('ไม่สามารถอัปโหลดรูปภาพได้');
    } finally {
      setUploadingIndex(null);
      if (e.target) e.target.value = '';
    }
  };

  if ((liffLoading && !previewMode) || loading) return <DropPointLoadingScreen />;
  if (!previewMode && !pinVerified) {
    return (
      <DropPointPageShell className="flex items-center justify-center p-6">
        <div className="register-shell-strong w-full max-w-md rounded-[30px] p-4">
          <div className="register-inner-card rounded-lg px-5 py-6 text-center">
            <h2 className="register-heading text-xl font-semibold">ยืนยัน PIN ก่อนเข้าดูรายการส่งคืน</h2>
            <p className="register-subtle mt-2 text-sm">
              เพื่อความปลอดภัย กรุณายืนยัน PIN 6 หลักก่อนดูข้อมูลส่งคืนของ Drop Point
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
  if (error) return <DropPointMessageState title="โหลดข้อมูลไม่สำเร็จ" description={error} />;

  if (confirmed) {
    return (
      <DropPointMessageState
        title="ส่งคืนเรียบร้อย"
        description="ระบบบันทึกการส่งคืนสินค้าเรียบร้อยแล้ว"
        action={(
          <button
            onClick={() => {
              setConfirmed(false);
              router.push(previewMode ? '/drop-point-returns?mock=1' : '/drop-point-returns');
            }}
            className="register-primary-btn w-full rounded-full py-3 text-sm font-medium"
          >
            กลับไปหน้ารายการ
          </button>
        )}
      />
    );
  }

  if (redemptionId && !detail) return <DropPointMessageState title="ไม่พบข้อมูลรายการส่งคืน" />;

  if (redemptionId && detail) {
    const isReturnCompleted = detail.request_status === 'COMPLETED' || Boolean(detail.item_return_confirmed_at);
    const deliveryMethodText = detail.delivery_method === 'SELF_PICKUP'
      ? 'ดำเนินการด้วยตัวเอง'
      : detail.delivery_method === 'SELF_ARRANGE'
        ? 'เรียกขนส่งเอง'
        : detail.delivery_method === 'PLATFORM_ARRANGE'
          ? 'Pawnly จัดส่งให้'
          : detail.delivery_method || '-';

    return (
      <DropPointPageShell className="pb-28">
        <DropPointHeroCard
          eyebrow={previewMode ? 'Preview Mode' : 'Return'}
          title={`${detail.contract.items.brand} ${detail.contract.items.model}`}
          subtitle={`สัญญา ${detail.contract.contract_number}`}
        >
          <div className="flex flex-wrap gap-2">
            <DropPointStatusBadge tone={isReturnCompleted ? 'success' : 'warning'}>
              {isReturnCompleted ? 'ส่งคืนแล้ว' : 'รอคืนของ'}
            </DropPointStatusBadge>
            {detail.storage_box_code ? <DropPointStatusBadge tone="neutral">กล่อง {detail.storage_box_code}</DropPointStatusBadge> : null}
          </div>
        </DropPointHeroCard>

        <div className="mt-4 space-y-4">
          <DropPointCard>
            <div className="register-heading mb-3 text-sm font-semibold">ข้อมูลลูกค้า</div>
            <div className="space-y-1 text-sm text-foreground-muted">
              <div>{detail.contract.pawners.firstname} {detail.contract.pawners.lastname}</div>
              <div>เลขบัตร: {detail.contract.pawners.national_id}</div>
              <div>เบอร์ติดต่อ: {detail.delivery_contact_phone || detail.contract.pawners.phone_number}</div>
              <div>วิธีส่งคืน: {deliveryMethodText}</div>
              <div>ที่อยู่: {detail.delivery_address_full || '-'}</div>
            </div>
          </DropPointCard>

          <DropPointCard>
            <ImageCarousel
              images={detail.contract.items.image_urls}
              className="no-scrollbar"
              itemClassName="w-36 aspect-square rounded-lg overflow-hidden bg-background-subtle"
              emptyLabel="No Image"
              emptyClassName="w-full text-center text-foreground-subtle text-xs"
            />
            <div className="mt-4 space-y-1 text-sm text-foreground-muted">
              <div>สินค้า: {detail.contract.items.brand} {detail.contract.items.model}</div>
              <div>หมายเลขถุงล่าสุด: {detail.bag_number || '-'}</div>
            </div>
          </DropPointCard>

          <DropPointCard>
            <div className="register-heading mb-3 text-sm font-semibold">หมายเลขถุง / สแกน QR code</div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="กรอกหมายเลขถุงก่อนส่งคืน"
                value={returnBagNumber}
                autoCapitalize="characters"
                onChange={(e) => setReturnBagNumber(e.target.value.toUpperCase())}
                readOnly={isReturnCompleted}
                className="register-input flex-1 rounded-lg px-4 py-3 text-sm"
              />
              <button
                type="button"
                onClick={() => alert('ฟีเจอร์สแกน QR ผ่านกล้องกำลังเตรียมเปิดใช้งาน')}
                className="register-outline-btn inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
              >
                <QrCode className="h-4 w-4" />
                สแกน
              </button>
            </div>
          </DropPointCard>

          <DropPointCard>
            <div className="register-heading mb-1 text-sm font-semibold">ถ่ายรูปก่อนส่งคืน</div>
            <p className="register-subtle mb-4 text-xs">ต้องถ่ายครบ 2 รูปก่อนยืนยันการส่งคืน</p>
            <div className="space-y-4">
              {['รูปสินค้า', 'รูปคู่สินค้ากับผู้รับ'].map((title, index) => {
                const photoUrl = returnPhotos[index];
                const isUploading = uploadingIndex === index;
                const inputRef = index === 0 ? returnPhotoInputRef1 : returnPhotoInputRef2;
                return (
                  <div key={title} className="register-surface rounded-lg border border-s3-border p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="register-heading text-sm font-semibold">{title}</div>
                        <div className="register-subtle text-xs">{index === 0 ? 'ถ่ายสินค้าให้เห็นชัดเจน' : 'ถ่ายยืนยันกับผู้มารับของ'}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={isUploading || isReturnCompleted}
                        className="register-primary-btn inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium disabled:opacity-50"
                      >
                        {photoUrl ? <RefreshCw className="h-3 w-3" /> : <Camera className="h-3 w-3" />}
                        {photoUrl ? 'ถ่ายใหม่' : 'ถ่ายรูป'}
                      </button>
                    </div>
                    <div className="flex aspect-video items-center justify-center overflow-hidden rounded-sm bg-background-subtle text-xs text-foreground-subtle">
                      {photoUrl ? <img src={photoUrl} alt={title} className="h-full w-full object-cover" /> : 'ยังไม่มีรูป'}
                    </div>
                    <input
                      ref={inputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(event) => handleReturnPhotoChange(index, event)}
                    />
                  </div>
                );
              })}
            </div>
          </DropPointCard>

          {!isReturnCompleted ? (
            <button
              onClick={handleConfirmReturn}
              disabled={confirming || uploadingIndex !== null || !returnBagNumber.trim() || !returnPhotos[0] || !returnPhotos[1]}
              className="register-primary-btn w-full rounded-full py-3 text-base font-medium disabled:opacity-50"
            >
              {confirming ? 'กำลังยืนยัน...' : 'ยืนยันการส่งคืน'}
            </button>
          ) : (
            <DropPointCard className="text-center text-sm text-foreground-subtle">รายการนี้ยืนยันการส่งคืนเรียบร้อยแล้ว</DropPointCard>
          )}
        </div>

        {!previewMode ? (
          <PinModal
            open={pinModalOpen}
            role="DROP_POINT"
            lineId={profile?.userId || ''}
            onClose={() => setPinModalOpen(false)}
            onVerified={(token) => {
              setPinModalOpen(false);
              pendingActionRef.current?.(token);
              pendingActionRef.current = null;
            }}
          />
        ) : null}

      </DropPointPageShell>
    );
  }

  return (
    <DropPointPageShell className="pb-28">
      <DropPointHeroCard
        eyebrow={previewMode ? 'Preview Mode' : 'Return'}
        title="รายการส่งคืนสินค้า"
        subtitle="รายการที่รอส่งคืนให้ลูกค้า"
      />

      <div className="mt-4 space-y-3">
        {redemptions.length === 0 ? (
          <DropPointCard className="text-center text-sm text-foreground-subtle">ไม่มีรายการรอคืนของ</DropPointCard>
        ) : redemptions.map((item) => (
          <button
            key={item.redemption_id}
            onClick={() => router.push(`/drop-point-returns?redemptionId=${item.redemption_id}${previewMode ? '&mock=1' : ''}`)}
            className="register-panel w-full rounded-[24px] p-4 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="register-heading text-base font-semibold">
                  {item.contract.items.brand} {item.contract.items.model}
                </div>
                <div className="register-subtle mt-1 text-xs">วันที่ยืนยันยอด: {formatDate(item.displayDate)}</div>
                {item.storage_box_code ? <div className="register-subtle text-xs">กล่อง {item.storage_box_code}</div> : null}
              </div>
              <DropPointStatusBadge tone="warning">รอคืนของ</DropPointStatusBadge>
            </div>
          </button>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(var(--safe-bottom)+16px)] pt-3">
        <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-3 rounded-[28px] border border-s3-border/60 bg-background-white/92 p-3 shadow-soft backdrop-blur">
          <button
            onClick={() => router.push(previewMode ? '/drop-point-history?mock=1' : '/drop-point-history')}
            className="register-secondary-btn rounded-2xl py-3 text-sm font-medium"
          >
            ประวัติ
          </button>
          <button
            onClick={() => router.push(previewMode ? '/drop-point?mock=1' : '/drop-point')}
            className="register-primary-btn rounded-2xl py-3 text-sm font-medium"
          >
            ดูรายการรอรับ
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

export default function DropPointReturnsPage() {
  return (
    <Suspense fallback={<DropPointLoadingScreen />}>
      <DropPointReturnsContent />
    </Suspense>
  );
}
