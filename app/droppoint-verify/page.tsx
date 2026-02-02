'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { Camera, Check, X } from 'lucide-react';
import ImageCarousel from '@/components/ImageCarousel';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';

function DropPointVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading } = useLiff();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get contractId from query params or liff.state
  let contractId = searchParams.get('contractId');
  if (!contractId) {
    const liffState = searchParams.get('liff.state');
    if (liffState) {
      const match = liffState.match(/contractId=([^&]+)/);
      if (match) contractId = match[1];
    }
  }

  // Verification state
  const [verificationData, setVerificationData] = useState({
    brand_correct: null as boolean | null,
    model_correct: null as boolean | null,
    capacity_correct: null as boolean | null,
    color_match: null as boolean | null,
    functionality_ok: null as boolean | null,
    mdm_lock_status: null as boolean | null,
    condition_score: 90,
    notes: '',
    verification_photos: [] as string[]
  });

  const [isConfirmed, setIsConfirmed] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [bagNumber, setBagNumber] = useState('');
  const [pinModalOpen, setPinModalOpen] = useState(false);
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
  const canApprove = !mustReject && !hasIncompleteChecks && isConfirmed && !!bagNumber.trim();

  useEffect(() => {
    if (contractId) {
      fetchContractDetails();
    }
  }, [contractId]);

  const fetchContractDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/contracts/${contractId}`);
      setContract(response.data.contract);
    } catch (error: any) {
      console.error('Error fetching contract:', error);
      setError(error.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingPhoto(true);

      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'droppoint-verification');

      const response = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.url) {
        setVerificationData(prev => ({
          ...prev,
          verification_photos: [...prev.verification_photos, response.data.url]
        }));
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert('ไม่สามารถอัปโหลดรูปภาพได้');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const getPhotoLabel = (index: number) => {
    if (index === 0) return 'front';
    if (index === 1) return 'back';
    return `photo ${index + 1}`;
  };

  const removePhoto = (index: number) => {
    setVerificationData(prev => ({
      ...prev,
      verification_photos: prev.verification_photos.filter((_, i) => i !== index)
    }));
  };

  const submitVerification = async (result: 'APPROVED' | 'REJECTED', pinToken: string) => {
    if (!profile?.userId) {
      alert('กรุณาเข้าสู่ระบบ LINE');
      return;
    }

    if (result === 'APPROVED' && mustReject) {
      alert('พบข้อมูลไม่ตรงหรือสภาพต่ำกว่าที่กำหนด ต้องส่งคืนเท่านั้น');
      return;
    }

    if (result === 'APPROVED' && hasIncompleteChecks) {
      alert('กรุณาตรวจสอบข้อมูลให้ครบทุกข้อก่อนยืนยัน');
      return;
    }

    if (result === 'APPROVED' && !isConfirmed) {
      alert('กรุณายืนยันว่าได้ตรวจสอบข้อมูลทั้งหมดแล้ว');
      return;
    }

    if (result === 'APPROVED' && !bagNumber.trim()) {
      alert('กรุณากรอกหมายเลขถุงสินค้า');
      return;
    }

    try {
      setSubmitting(true);

      const response = await axios.post('/api/drop-points/verify', {
        contractId,
        lineId: profile.userId,
        verificationResult: result,
        bagNumber: bagNumber.trim(),
        verificationData: {
          ...verificationData,
          verification_result: result
        },
        pinToken
      });

      if (response.data.success) {
        alert(result === 'APPROVED' ? 'ยืนยันสินค้าเรียบร้อยแล้ว' : 'ส่งคืนสินค้าเรียบร้อยแล้ว');
        // Close LIFF or redirect
        if (typeof window !== 'undefined' && window.liff) {
          window.liff.closeWindow();
        }
      }
    } catch (error: any) {
      console.error('Error submitting verification:', error);
      alert(error.response?.data?.error || 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerificationSubmit = async (result: 'APPROVED' | 'REJECTED') => {
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

  // Helper Component for verification toggle buttons
  const VerificationToggle = ({
    label,
    fieldName,
    subLabel = '',
    correctText = 'ถูกต้อง',
    incorrectText = 'ไม่ถูกต้อง'
  }: {
    label: string;
    fieldName: keyof typeof verificationData;
    subLabel?: string;
    correctText?: string;
    incorrectText?: string;
  }) => (
    <div className="mb-4">
      <div className="flex justify-between items-end mb-2">
        <label className="font-bold text-gray-700 text-sm">{label}</label>
        {subLabel && <span className="text-gray-500 text-sm">{subLabel}</span>}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setVerificationData({ ...verificationData, [fieldName]: true })}
          className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
            verificationData[fieldName] === true
              ? 'bg-[#ECFCCB] border-[#4D7C0F] text-[#365314]'
              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          {correctText}
        </button>
        <button
          type="button"
          onClick={() => setVerificationData({ ...verificationData, [fieldName]: false })}
          className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
            verificationData[fieldName] === false
              ? 'bg-[#FEE2E2] border-[#EF4444] text-[#B91C1C]'
              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          {incorrectText}
        </button>
      </div>
    </div>
  );

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#365314] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'ไม่พบข้อมูลสัญญา'}</p>
          <button
            onClick={() => window.history.back()}
            className="bg-[#365314] text-white px-6 py-3 rounded-lg"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans pb-10">

      {/* Customer Info Card */}
      <div className="bg-[#F2F2F2] p-4 pb-6">
        <h2 className="font-bold text-gray-800 text-base mb-3">ข้อมูลลูกค้า</h2>
        <div className="space-y-2 text-sm">
          <div className="flex">
            <span className="font-bold text-gray-700 w-24">ชื่อ</span>
            <span className="text-gray-600">{contract.pawners?.firstname} {contract.pawners?.lastname}</span>
          </div>
          <div className="flex">
            <span className="font-bold text-gray-700 w-24">เบอร์มือถือ</span>
            <span className="text-gray-600">{contract.pawners?.phone_number || '-'}</span>
          </div>
          <div className="flex">
            <span className="font-bold text-gray-700 w-24">หมายเลขสัญญา</span>
            <span className="text-gray-600">{contract.contract_number}</span>
          </div>
        </div>
      </div>

      <div className="p-4 -mt-4 bg-white rounded-t-3xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">

        {/* Header Section */}
        <div className="mb-4">
          <h2 className="font-bold text-gray-800 text-base">ตรวจสินค้า</h2>
          <p className="text-xs text-gray-500 font-light">ตรวจสอบความถูกต้องของสินค้าว่าตรงตามที่ลูกค้าระบุหรือไม่</p>
        </div>

        {/* Customer Photos */}
        <div className="mb-6">
          <label className="font-bold text-gray-700 text-sm mb-2 block">รูปถ่ายโดยลูกค้า</label>
          <ImageCarousel
            images={contract.items?.image_urls}
            className="no-scrollbar"
            itemClassName="w-32 aspect-square relative rounded-xl overflow-hidden bg-gray-100"
            emptyLabel="No Image"
            emptyClassName="w-full text-center text-gray-400 text-xs"
            renderItem={(url, index) => (
              <>
                <img
                  src={url}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2 text-white text-[10px] drop-shadow-md text-right leading-tight">
                  <span className="text-lg font-bold block">{getPhotoLabel(index)}</span>
                  from pawner
                </div>
              </>
            )}
          />
        </div>

        {/* Verification Checklist */}
        <div className="space-y-2">
          <VerificationToggle
            label="ยี่ห้อ"
            subLabel={contract.items?.brand || '-'}
            fieldName="brand_correct"
          />
          <VerificationToggle
            label="รุ่น"
            subLabel={contract.items?.model || '-'}
            fieldName="model_correct"
          />
          <VerificationToggle
            label="ความจุ"
            subLabel={contract.items?.capacity || '-'}
            fieldName="capacity_correct"
          />
        </div>

        <div className="h-px bg-gray-100 my-4"></div>

        {/* Condition Slider */}
        <div className="mb-6">
          <div className="flex justify-between items-end mb-4">
            <label className="font-bold text-gray-700 text-sm">สภาพ</label>
            <span className="text-gray-500 text-sm">{contract.items?.item_condition}%</span>
          </div>

          <div className="px-1">
            <input
              type="range"
              min="0"
              max="100"
              value={verificationData.condition_score}
              onChange={(e) => setVerificationData({ ...verificationData, condition_score: parseInt(e.target.value) })}
              className="w-full accent-[#365314]"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="flex justify-between items-center mt-2">
            <span className="text-gray-500 text-sm font-medium">สภาพที่ตรวจ</span>
            <span className="text-gray-800 text-sm font-bold">{verificationData.condition_score}%</span>
          </div>
          {isConditionGapTooHigh && (
            <p className="text-[11px] text-red-600 mt-2">
              สภาพต่ำกว่าที่ลูกค้าระบุเกิน 10% ต้องส่งคืนเท่านั้น
            </p>
          )}
        </div>

        <div className="h-px bg-gray-100 my-4"></div>

        {/* Additional Checks */}
        <div className="space-y-2">
          <VerificationToggle label="สีตัวเครื่องตรงกับในรูปด้านบน" fieldName="color_match" />
          <VerificationToggle label="การใช้งาน" subLabel="ใช้งานได้" fieldName="functionality_ok" />
          <VerificationToggle
            label="การติดตั้ง MDM"
            subLabel="ไม่ได้ติดตั้ง"
            fieldName="mdm_lock_status"
          />
        </div>

        <div className="h-px bg-gray-100 my-6"></div>

        {/* Drop Point Photos */}
        <div className="mb-6">
          <label className="font-bold text-gray-700 text-sm mb-3 block">รูปถ่ายโดย Drop point</label>
          <div className="grid grid-cols-2 gap-3">
            {verificationData.verification_photos.map((url, index) => (
              <div key={index} className="aspect-video bg-gray-800 rounded-xl relative overflow-hidden">
                <img
                  src={url}
                  alt={`Drop point photo ${index + 1}`}
                  className="w-full h-full object-cover opacity-80"
                />
                <button
                  onClick={() => removePhoto(index)}
                  className="absolute top-2 right-2 bg-black/50 p-1 rounded-full text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* Add Photo Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="aspect-video bg-[#F2F2F2] rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {uploadingPhoto ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#365314]"></div>
              ) : (
                <>
                  <Camera className="w-6 h-6 text-gray-500 mb-1" />
                  <span className="text-xs font-bold text-[#365314]">เพิ่มรูป</span>
                  <span className="text-[10px] text-gray-400">Add image</span>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Bag Number */}
        <div className="mb-6">
          <label className="font-bold text-gray-700 text-sm mb-2 block">หมายเลขถุงสินค้า</label>
          <input
            type="text"
            placeholder="กรอกหมายเลขถุงสินค้า"
            value={bagNumber}
            onChange={(e) => setBagNumber(e.target.value)}
            className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#365314] text-sm text-gray-600 bg-white"
          />
          <p className="text-[10px] text-gray-400 mt-2">จำเป็นต้องกรอกก่อนยืนยัน</p>
        </div>

        {/* Remarks */}
        <div className="mb-6">
          <label className="font-bold text-gray-700 text-sm mb-2 block">หมายเหตุ</label>
          <input
            type="text"
            placeholder="หมายเหตุ"
            value={verificationData.notes}
            onChange={(e) => setVerificationData({ ...verificationData, notes: e.target.value })}
            className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#365314] text-sm text-gray-600 bg-white"
          />
        </div>

        {/* Confirmation & Actions */}
        <div className="mb-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${isConfirmed ? 'bg-[#365314]' : 'bg-gray-200'}`}>
              <Check className="w-3 h-3 text-white" />
            </div>
            <input
              type="checkbox"
              className="hidden"
              checked={isConfirmed}
              onChange={() => setIsConfirmed(!isConfirmed)}
            />
            <span className="text-sm text-gray-700 font-medium">ข้อมูลทั้งหมดถูกตรวจสอบเรียบร้อยแล้ว</span>
          </label>
          {hasIncompleteChecks && (
            <p className="text-[11px] text-amber-600 mt-2">กรุณาเลือกผลตรวจสอบให้ครบทุกหัวข้อก่อนดำเนินการ</p>
          )}
          {mustReject && (
            <p className="text-[11px] text-red-600 mt-2">พบข้อมูลไม่ตรง ต้องทำรายการส่งคืน</p>
          )}
        </div>

        <div className="space-y-3">
          {mustReject ? (
            <button
              onClick={() => handleVerificationSubmit('REJECTED')}
              disabled={submitting}
              className="w-full bg-white border border-[#EF4444] hover:bg-red-50 text-[#EF4444] rounded-2xl py-3 flex flex-col items-center justify-center transition-colors active:scale-[0.98] disabled:opacity-50"
            >
              <span className="text-base font-bold">{submitting ? 'กำลังดำเนินการ...' : 'ส่งคืน'}</span>
              <span className="text-[10px] font-light opacity-80">Return</span>
            </button>
          ) : (
            <button
              onClick={() => handleVerificationSubmit('APPROVED')}
              disabled={submitting || !canApprove}
              className="w-full bg-[#365314] hover:bg-[#2d4610] text-white rounded-2xl py-3 flex flex-col items-center justify-center shadow-sm transition-colors active:scale-[0.98] disabled:opacity-50"
            >
              <span className="text-base font-bold">{submitting ? 'กำลังดำเนินการ...' : 'ยืนยัน'}</span>
              <span className="text-[10px] font-light opacity-80">Confirm</span>
            </button>
          )}
        </div>

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

      </div>
    </div>
  );
}

export default function DropPointVerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#365314] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <DropPointVerifyContent />
    </Suspense>
  );
}
