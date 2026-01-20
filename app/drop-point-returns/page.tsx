'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { ChevronLeft, CheckCircle, Camera, RefreshCw } from 'lucide-react';
import ImageCarousel from '@/components/ImageCarousel';

type RedemptionItem = {
  redemption_id: string;
  request_status: string;
  displayDate?: string;
  contract?: {
    contract_id: string;
    contract_number: string;
    items?: {
      brand?: string;
      model?: string;
      image_urls?: string[];
    };
    pawners?: {
      firstname?: string;
      lastname?: string;
      phone_number?: string;
      national_id?: string;
    };
  };
};

type RedemptionDetail = {
  redemption_id: string;
  request_status: string;
  drop_point_return_photos?: string[] | null;
  delivery_method?: string;
  delivery_address_full?: string;
  delivery_contact_phone?: string;
  contract?: {
    contract_id: string;
    contract_number: string;
    items?: {
      brand?: string;
      model?: string;
      image_urls?: string[];
    };
    pawners?: {
      firstname?: string;
      lastname?: string;
      phone_number?: string;
      national_id?: string;
    };
    drop_points?: {
      drop_point_name?: string;
      phone_number?: string;
    };
  };
  bag_number?: string | null;
};

function formatDate(dateString?: string) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('th-TH');
}

function DropPointReturnsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading } = useLiff();

  const [loading, setLoading] = useState(true);
  const [redemptions, setRedemptions] = useState<RedemptionItem[]>([]);
  const [detail, setDetail] = useState<RedemptionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [returnPhotos, setReturnPhotos] = useState<Array<string | null>>([null, null]);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const returnPhotoInputRef1 = useRef<HTMLInputElement>(null);
  const returnPhotoInputRef2 = useRef<HTMLInputElement>(null);

  let redemptionId = searchParams.get('redemptionId');
  if (!redemptionId) {
    const liffState = searchParams.get('liff.state');
    if (liffState) {
      const match = liffState.match(/redemptionId=([^&]+)/);
      if (match) redemptionId = match[1];
    }
  }

  useEffect(() => {
    if (liffLoading || !profile?.userId) return;
    if (redemptionId) {
      fetchDetail(profile.userId, redemptionId);
    } else {
      fetchList(profile.userId);
    }
  }, [liffLoading, profile?.userId, redemptionId]);

  useEffect(() => {
    if (!detail) return;
    const nextPhotos: Array<string | null> = [null, null];
    if (detail.drop_point_return_photos?.length) {
      detail.drop_point_return_photos.slice(0, 2).forEach((url, index) => {
        nextPhotos[index] = url;
      });
    }
    setReturnPhotos(nextPhotos);
  }, [detail]);

  const fetchList = async (lineId: string) => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/drop-points/returns/${lineId}`);
      setRedemptions(response.data.redemptions || []);
    } catch (fetchError: any) {
      console.error('Error fetching returns:', fetchError);
      setError(fetchError.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (lineId: string, targetRedemptionId: string) => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/drop-points/returns/detail/${targetRedemptionId}?lineId=${lineId}`);
      setDetail(response.data.redemption);
    } catch (fetchError: any) {
      console.error('Error fetching redemption detail:', fetchError);
      setError(fetchError.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReturn = async () => {
    if (!detail || confirming || !profile?.userId) return;
    if (!returnPhotos[0] || !returnPhotos[1]) {
      alert('กรุณาถ่ายรูปให้ครบ 2 รูปก่อนยืนยันการส่งคืน');
      return;
    }
    try {
      setConfirming(true);
      const response = await axios.post('/api/drop-points/returns/confirm', {
        redemptionId: detail.redemption_id,
        lineId: profile.userId,
        returnPhotos: returnPhotos.filter((photo): photo is string => Boolean(photo))
      });
      if (response.data.success) {
        setConfirmed(true);
      }
    } catch (confirmError: any) {
      console.error('Error confirming return:', confirmError);
      alert(confirmError.response?.data?.error || 'เกิดข้อผิดพลาด');
    } finally {
      setConfirming(false);
    }
  };

  const handleReturnPhotoChange = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingIndex(index);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'drop-point-returns');

      const response = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.url) {
        setReturnPhotos((prev) => {
          const next = [...prev];
          next[index] = response.data.url;
          return next;
        });
      }
    } catch (uploadError) {
      console.error('Error uploading return photo:', uploadError);
      alert('ไม่สามารถอัปโหลดรูปภาพได้');
    } finally {
      setUploadingIndex(null);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#365314] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-10 text-center shadow-sm max-w-sm w-full">
          <div className="w-24 h-24 rounded-full border-4 border-[#16A34A] flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-[#16A34A]" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">ส่งคืนเรียบร้อย</h2>
          <p className="text-sm text-gray-500 mb-6">ระบบบันทึกการส่งคืนสินค้าเรียบร้อยแล้ว</p>
          <button
            onClick={() => router.push('/drop-point-returns')}
            className="w-full bg-[#365314] text-white rounded-2xl py-3 font-bold hover:bg-[#2d4610] transition-colors"
          >
            กลับไปหน้ารายการ
          </button>
        </div>
      </div>
    );
  }

  if (redemptionId && !detail) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">ไม่พบข้อมูลรายการส่งคืน</p>
        </div>
      </div>
    );
  }

  if (redemptionId && detail) {
    const deliveryMethodText = detail.delivery_method === 'SELF_PICKUP'
      ? 'ดำเนินการด้วยตัวเอง'
      : detail.delivery_method === 'SELF_ARRANGE'
        ? 'เรียกขนส่งเอง'
        : detail.delivery_method === 'PLATFORM_ARRANGE'
          ? 'Pawnly จัดส่งให้'
          : detail.delivery_method || '-';
    const contactPhone = detail.delivery_contact_phone || detail.contract?.pawners?.phone_number || '-';
    const addressText = detail.delivery_address_full || '-';
    const returnPhotoLabels = [
      {
        title: 'รูปสินค้า',
        description: 'ถ่ายสินค้าให้เห็นชัดเจน 1 รูป'
      },
      {
        title: 'รูปคู่สินค้ากับผู้รับ',
        description: 'ถ่ายคู่กับคนที่มารับของเพื่อยืนยันตัวตน'
      }
    ];

    return (
      <div className="min-h-screen bg-[#F5F7FA] font-sans px-4 py-6 pb-24">
        <button
          onClick={() => router.push('/drop-point-returns')}
          className="flex items-center text-[#365314] mb-4"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-medium">กลับ</span>
        </button>

        <div className="bg-[#F4F1EE] rounded-3xl p-5 mb-4">
          <h2 className="font-bold text-gray-800 text-base mb-2">ข้อมูลลูกค้า</h2>
          <div className="text-sm text-gray-600">
            {detail.contract?.pawners?.firstname} {detail.contract?.pawners?.lastname}
          </div>
          <div className="text-sm text-gray-600">เลขบัตรประชาชน: {detail.contract?.pawners?.national_id || '-'}</div>
          <div className="text-sm text-gray-600">เบอร์โทรติดต่อ: {contactPhone}</div>
          <div className="text-sm text-gray-600">ที่อยู่: {addressText}</div>
        </div>

        <div className="bg-[#F4F1EE] rounded-3xl p-5 mb-4">
          <ImageCarousel
            images={detail.contract?.items?.image_urls}
            className="no-scrollbar"
            itemClassName="w-36 aspect-square rounded-2xl overflow-hidden bg-gray-200"
            emptyLabel="No Image"
            emptyClassName="w-full text-center text-gray-400 text-xs"
          />
          <div className="mt-4 text-sm text-gray-700">
            สินค้า: {detail.contract?.items?.brand} {detail.contract?.items?.model}
          </div>
          <div className="text-sm text-gray-700">รหัสสัญญา: {detail.contract?.contract_number}</div>
          {detail.bag_number && (
            <div className="text-sm text-gray-700">รหัสถุงสินค้า: {detail.bag_number}</div>
          )}
          <div className="text-sm text-gray-700">วิธีส่งคืน: {deliveryMethodText}</div>
        </div>

        <div className="bg-white rounded-3xl p-5 mb-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-800 mb-3">ถ่ายรูปก่อนส่งคืน</h2>
          <p className="text-xs text-gray-500 mb-4">ต้องถ่ายครบ 2 รูป (ถ่ายจากกล้องเท่านั้น)</p>

          <div className="space-y-4">
            {returnPhotoLabels.map((label, index) => {
              const photoUrl = returnPhotos[index];
              const isUploading = uploadingIndex === index;
              const inputRef = index === 0 ? returnPhotoInputRef1 : returnPhotoInputRef2;
              return (
                <div key={label.title} className="border border-dashed border-gray-200 rounded-2xl p-4 bg-[#F9FAFB]">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-bold text-gray-800">{label.title}</div>
                      <div className="text-xs text-gray-500">{label.description}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      disabled={isUploading}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#365314] text-white text-xs font-semibold disabled:opacity-60"
                    >
                      {photoUrl ? <RefreshCw className="w-3 h-3" /> : <Camera className="w-3 h-3" />}
                      {photoUrl ? 'ถ่ายใหม่' : 'ถ่ายรูป'}
                    </button>
                  </div>

                  <div className="w-full aspect-video rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                    {photoUrl ? (
                      <img src={photoUrl} alt={label.title} className="w-full h-full object-cover" />
                    ) : (
                      'ยังไม่มีรูป'
                    )}
                  </div>

                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => handleReturnPhotoChange(index, event)}
                  />
                  {isUploading && (
                    <div className="mt-2 text-xs text-gray-500">กำลังอัปโหลดรูป...</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleConfirmReturn}
          disabled={confirming || uploadingIndex !== null || !returnPhotos[0] || !returnPhotos[1]}
          className="w-full bg-[#0F6C2F] text-white rounded-2xl py-4 font-bold shadow-sm hover:bg-[#0B5A27] transition-colors disabled:opacity-60"
        >
          {confirming ? 'กำลังยืนยัน...' : 'ยืนยันการส่งคืน'}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] font-sans px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-800">รายการส่งคืนสินค้า</h1>
        <p className="text-sm text-gray-500">รายการที่รอส่งคืนให้ลูกค้า</p>
      </div>

      {redemptions.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center text-sm text-gray-500">
          ไม่มีรายการรอคืนของ
        </div>
      ) : (
        redemptions.map((item) => (
          <button
            key={item.redemption_id}
            onClick={() => router.push(`/drop-point-returns?redemptionId=${item.redemption_id}`)}
            className="w-full bg-white rounded-2xl p-4 mb-3 text-left shadow-sm"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="text-base font-bold text-gray-800">
                  {item.contract?.items?.brand} {item.contract?.items?.model}
                </div>
                <div className="text-xs text-gray-500">
                  วันที่ยืนยันยอด: {formatDate(item.displayDate)}
                </div>
              </div>
              <span className="text-xs font-bold text-[#F59E0B] bg-[#FEF3C7] px-3 py-1 rounded-full">
                รอคืนของ
              </span>
            </div>
          </button>
        ))
      )}
    </div>
  );
}

export default function DropPointReturnsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#365314] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <DropPointReturnsContent />
    </Suspense>
  );
}
