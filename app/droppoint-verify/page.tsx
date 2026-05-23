'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { Camera, Check, CheckCircle, QrCode, X } from 'lucide-react';
import ImageCarousel from '@/components/ImageCarousel';
import PinModal from '@/components/PinModal';
import VolumeSlider from '@/components/VolumeSlider';
import { getPinSession } from '@/lib/security/pin-session';
import { getMockContractDetail, isDropPointMockEnabled } from '@/lib/mock-drop-point';
import {
  DropPointCard,
  DropPointHeroCard,
  DropPointLoadingScreen,
  DropPointMessageState,
  DropPointPageShell,
} from '@/components/drop-point/ui';

function DropPointVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading } = useLiff();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewMode = isDropPointMockEnabled(searchParams);

  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  let contractId = searchParams.get('contractId');
  if (!contractId) {
    const liffState = searchParams.get('liff.state');
    if (liffState) {
      const match = liffState.match(/contractId=([^&]+)/);
      if (match) contractId = match[1];
    }
  }

  const [verificationData, setVerificationData] = useState({
    brand_correct: null as boolean | null,
    model_correct: null as boolean | null,
    capacity_correct: null as boolean | null,
    color_match: null as boolean | null,
    functionality_ok: null as boolean | null,
    mdm_lock_status: null as boolean | null,
    condition_score: 90,
    notes: '',
    verification_photos: [] as string[],
  });

  const [isConfirmed, setIsConfirmed] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [storageBoxCode, setStorageBoxCode] = useState('');
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [successResult, setSuccessResult] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const pendingActionRef = useRef<((token: string) => void) | null>(null);

  const requiredCheckFields: Array<keyof typeof verificationData> = [
    'brand_correct',
    'model_correct',
    'capacity_correct',
    'color_match',
    'functionality_ok',
    'mdm_lock_status',
  ];

  const hasIncompleteChecks = requiredCheckFields.some((field) => verificationData[field] === null);
  const hasAnyMismatch = requiredCheckFields.some((field) => verificationData[field] === false);
  const expectedConditionScore = Number(contract?.items?.item_condition || 0);
  const isConditionGapTooHigh = Number.isFinite(expectedConditionScore)
    ? verificationData.condition_score < (expectedConditionScore - 10)
    : false;
  const mustReject = hasAnyMismatch || isConditionGapTooHigh;
  const hasVerificationPhotos = verificationData.verification_photos.length > 0;
  const canApprove = !mustReject && !hasIncompleteChecks && isConfirmed && !!storageBoxCode.trim() && hasVerificationPhotos;

  useEffect(() => {
    const load = async () => {
      if (previewMode) {
        const mockContract = getMockContractDetail(contractId);
        setContract(mockContract);
        setVerificationData((prev) => ({
          ...prev,
          condition_score: Number(mockContract?.items?.item_condition || 90),
        }));
        setLoading(false);
        return;
      }
      if (!profile?.userId || !contractId) return;
      try {
        setLoading(true);
        const response = await axios.get(`/api/drop-points/contracts/detail/${contractId}?lineId=${profile.userId}`);
        setContract(response.data.contract);
        setVerificationData((prev) => ({
          ...prev,
          condition_score: Number(response.data.contract?.items?.item_condition || 90),
        }));
      } catch (fetchError: any) {
        setError(fetchError.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [previewMode, contractId, profile?.userId]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (verificationData.verification_photos.length >= 5) {
      alert('อัปโหลดรูปได้สูงสุด 5 รูป');
      e.target.value = '';
      return;
    }

    if (previewMode) {
      setUploadingPhoto(true);
      setTimeout(() => {
        setVerificationData((prev) => ({
          ...prev,
          verification_photos: [...prev.verification_photos, URL.createObjectURL(file)],
        }));
        setUploadingPhoto(false);
      }, 250);
      e.target.value = '';
      return;
    }

    try {
      setUploadingPhoto(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'droppoint-verification');
      const response = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.url) {
        setVerificationData((prev) => ({
          ...prev,
          verification_photos: [...prev.verification_photos, response.data.url],
        }));
      }
    } catch {
      alert('ไม่สามารถอัปโหลดรูปภาพได้');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const removePhoto = (index: number) => {
    setVerificationData((prev) => ({
      ...prev,
      verification_photos: prev.verification_photos.filter((_, i) => i !== index),
    }));
  };

  const submitVerification = async (result: 'APPROVED' | 'REJECTED', pinToken: string) => {
    if (result === 'APPROVED' && !canApprove) {
      alert('กรุณาตรวจสอบข้อมูลให้ครบก่อนยืนยัน');
      return;
    }

    if (previewMode) {
      setSubmitting(true);
      setTimeout(() => {
        setSubmitting(false);
        setSuccessResult(result);
      }, 500);
      return;
    }

    try {
      setSubmitting(true);
      const response = await axios.post('/api/drop-points/verify', {
        contractId,
        lineId: profile?.userId,
        verificationResult: result,
        storageBoxCode: storageBoxCode.trim().toUpperCase(),
        verificationData: {
          ...verificationData,
          verification_result: result,
          storage_box_code: storageBoxCode.trim().toUpperCase(),
        },
        pinToken,
      });
      if (response.data.success) {
        setSuccessResult(result);
      }
    } catch (submitError: any) {
      alert(submitError.response?.data?.error || 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerificationSubmit = async (result: 'APPROVED' | 'REJECTED') => {
    if (previewMode) {
      await submitVerification(result, 'mock-token');
      return;
    }
    if (!profile?.userId) {
      alert('กรุณาเข้าสู่ระบบ LINE');
      return;
    }
    const session = getPinSession('DROP_POINT', profile.userId);
    if (session?.token) {
      await submitVerification(result, session.token);
      return;
    }
    pendingActionRef.current = async (token: string) => {
      await submitVerification(result, token);
    };
    setPinModalOpen(true);
  };

  const handleCloseLiff = () => {
    if (typeof window !== 'undefined' && window.liff?.closeWindow) {
      window.liff.closeWindow();
      return;
    }

    router.push(previewMode ? '/drop-point?mock=1' : '/drop-point');
  };

  const VerificationToggle = ({
    label,
    fieldName,
    subLabel = '',
  }: {
    label: string;
    fieldName: keyof typeof verificationData;
    subLabel?: string;
  }) => (
    <div className="rounded-xl p-4 bg-s3-soft/50 border border-s3-border/50">
      <div className="mb-3 flex items-end justify-between gap-3">
        <label className="register-heading text-sm font-semibold">{label}</label>
        {subLabel ? <span className="register-subtle text-xs">{subLabel}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setVerificationData({ ...verificationData, [fieldName]: true })}
          className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            verificationData[fieldName] === true ? 'register-chip-selected border-s3' : 'register-chip-unselected'
          }`}
        >
          ถูกต้อง
        </button>
        <button
          type="button"
          onClick={() => setVerificationData({ ...verificationData, [fieldName]: false })}
          className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            verificationData[fieldName] === false ? 'border-error register-status-error' : 'register-chip-unselected'
          }`}
        >
          ไม่ถูกต้อง
        </button>
      </div>
    </div>
  );

  if ((liffLoading && !previewMode) || loading) return <DropPointLoadingScreen />;
  if (error || !contract) return <DropPointMessageState title="ไม่พบข้อมูลสัญญา" description={error || 'กรุณาลองใหม่อีกครั้ง'} />;
  if (successResult) {
    const isApproved = successResult === 'APPROVED';

    return (
      <div className="min-h-screen bg-background-white font-sans flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl bg-background-white p-8 text-center">
          <div className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-24 w-24 text-green-500" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-foreground">{isApproved ? 'รับของเข้าเรียบร้อย' : 'ทำการส่งคืนสินค้า'}</h1>
          <p className="mb-6 text-sm text-foreground-subtle">
            {isApproved ? 'ระบบบันทึกการรับสินค้าเรียบร้อยแล้ว' : 'ระบบบันทึกรายการส่งคืนสินค้าเรียบร้อยแล้ว'}
          </p>
          <button
            onClick={handleCloseLiff}
            className="w-full rounded-full bg-primary py-4 font-medium text-white"
          >
            ปิด LIFF
          </button>
        </div>
      </div>
    );
  }

  return (
    <DropPointPageShell className="pb-10">
      <DropPointHeroCard
        eyebrow={previewMode ? 'Preview Mode' : 'Verification'}
        title="ตรวจสอบสินค้า"
        subtitle={`สัญญา ${contract.contract_number}`}
      >
        <div className="register-subtle text-sm">
          ลูกค้า: {contract.pawners?.firstname} {contract.pawners?.lastname} • {contract.pawners?.phone_number || '-'}
        </div>
      </DropPointHeroCard>

      <div className="mt-4 space-y-4">
        <DropPointCard>
          <div className="register-heading mb-3 text-sm font-semibold">รูปถ่ายโดยลูกค้า</div>
          <ImageCarousel
            images={contract.items?.image_urls}
            className="no-scrollbar"
            itemClassName="w-32 aspect-square relative rounded-md overflow-hidden bg-background-subtle"
            emptyLabel="No Image"
            emptyClassName="w-full text-center text-foreground-subtle text-xs"
          />
        </DropPointCard>

        <VerificationToggle label="ยี่ห้อ" subLabel={contract.items?.brand || '-'} fieldName="brand_correct" />
        <VerificationToggle label="รุ่น" subLabel={contract.items?.model || '-'} fieldName="model_correct" />
        <VerificationToggle label="ความจุ" subLabel={contract.items?.capacity || '-'} fieldName="capacity_correct" />
        <VerificationToggle label="สีตัวเครื่อง" subLabel={contract.items?.color || '-'} fieldName="color_match" />
        <VerificationToggle label="การใช้งาน" subLabel="ใช้งานได้" fieldName="functionality_ok" />
        <VerificationToggle label="การติดตั้ง MDM" subLabel="ไม่ได้ติดตั้ง" fieldName="mdm_lock_status" />

        <DropPointCard>
          <div className="mb-4 flex items-end justify-between">
            <label className="register-heading text-sm font-semibold">สภาพสินค้า</label>
            <span className="register-subtle text-xs">ลูกค้าระบุ {contract.items?.item_condition || 0}%</span>
          </div>
          <div className="mb-2 rounded-lg border border-s3/15 bg-background-white px-5 py-3">
            <VolumeSlider
              min={0}
              max={100}
              step={1}
              value={verificationData.condition_score}
              ariaLabel="Condition"
              onChange={(condition_score) => setVerificationData({ ...verificationData, condition_score })}
            />
            <div className="mt-3 flex justify-between text-xs font-semibold text-foreground-subtle">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="register-subtle">สภาพที่ตรวจ</span>
            <span className="register-heading font-semibold">{verificationData.condition_score}%</span>
          </div>
          {isConditionGapTooHigh ? <p className="mt-2 text-xs text-error">สภาพต่ำกว่าที่ลูกค้าระบุเกิน 10% ต้องส่งคืนเท่านั้น</p> : null}
        </DropPointCard>

        <DropPointCard>
          <div className="register-heading mb-3 text-sm font-semibold">รูปถ่ายโดย Drop Point</div>
          <div className="grid grid-cols-2 gap-3">
            {verificationData.verification_photos.map((url, index) => (
              <div key={index} className="relative aspect-video overflow-hidden rounded-md bg-background-subtle">
                <img src={url} alt={`Drop point photo ${index + 1}`} className="h-full w-full object-cover" />
                <button onClick={() => removePhoto(index)} className="absolute right-2 top-2 rounded-full bg-background-dark/60 p-1 text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto || verificationData.verification_photos.length >= 5}
              className={`register-surface flex aspect-video flex-col items-center justify-center rounded-md border-2 border-dashed border-s3-border text-center disabled:opacity-50 ${
                verificationData.verification_photos.length === 0 ? 'col-span-2 w-full' : ''
              }`}
            >
              {uploadingPhoto ? (
                <div className="dot-bricks scale-75" />
              ) : (
                <>
                  <Camera className="mb-2 h-6 w-6 register-accent" />
                  <span className="register-heading text-sm font-semibold">เพิ่มรูป</span>
                  <span className="register-subtle text-[10px]">สูงสุด 5 รูป</span>
                </>
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
          </div>
        </DropPointCard>

        <DropPointCard>
          <label className="register-heading mb-2 block text-sm font-semibold">หมายเลขกล่องเก็บของ / สแกน QR code</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="เช่น DP001123456"
              value={storageBoxCode}
              autoCapitalize="characters"
              onChange={(e) => setStorageBoxCode(e.target.value.toUpperCase())}
              className="register-input flex-1 rounded-xl px-4 py-3 text-sm"
            />
            <button
              type="button"
              onClick={() => alert('ฟีเจอร์สแกน QR ผ่านกล้องกำลังเตรียมเปิดใช้งาน')}
              className="register-outline-btn inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium"
            >
              <QrCode className="h-4 w-4" />
              สแกน
            </button>
          </div>
        </DropPointCard>

        <DropPointCard>
          <label className="register-heading mb-2 block text-sm font-semibold">หมายเหตุ</label>
          <input
            type="text"
            placeholder="หมายเหตุเพิ่มเติม"
            value={verificationData.notes}
            onChange={(e) => setVerificationData({ ...verificationData, notes: e.target.value })}
            className="register-input w-full rounded-xl px-4 py-3 text-sm"
          />
        </DropPointCard>

        <DropPointCard>
          <label className="flex items-center gap-3">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full ${isConfirmed ? 'bg-s3-active text-white' : 'bg-background-subtle text-transparent'}`}>
              <Check className="h-3 w-3" />
            </span>
            <input type="checkbox" className="hidden" checked={isConfirmed} onChange={() => setIsConfirmed(!isConfirmed)} />
            <span className="text-sm text-foreground-muted">ข้อมูลทั้งหมดถูกตรวจสอบเรียบร้อยแล้ว</span>
          </label>
          {hasIncompleteChecks ? <p className="mt-2 text-xs text-warning">กรุณาเลือกผลตรวจสอบให้ครบทุกหัวข้อ</p> : null}
          {!hasVerificationPhotos && !mustReject ? <p className="mt-2 text-xs text-warning">กรุณาถ่ายรูปสินค้าอย่างน้อย 1 รูป</p> : null}
          {mustReject ? <p className="mt-2 text-xs text-error">พบข้อมูลไม่ตรง ต้องทำรายการส่งคืน</p> : null}
        </DropPointCard>

        <div className="space-y-3">
          {mustReject ? (
            <button
              onClick={() => handleVerificationSubmit('REJECTED')}
              disabled={submitting}
              className="register-status-error w-full rounded-full py-3 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'กำลังดำเนินการ...' : 'ส่งคืน'}
            </button>
          ) : (
            <button
              onClick={() => handleVerificationSubmit('APPROVED')}
              disabled={submitting || !canApprove}
              className="register-primary-btn w-full rounded-full py-3 text-base font-medium disabled:opacity-50"
            >
              {submitting ? 'กำลังดำเนินการ...' : 'ยืนยัน'}
            </button>
          )}
        </div>
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

export default function DropPointVerifyPage() {
  return (
    <Suspense fallback={<DropPointLoadingScreen />}>
      <DropPointVerifyContent />
    </Suspense>
  );
}
