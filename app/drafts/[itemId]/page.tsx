'use client';

import { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import Image from 'next/image';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { Sarabun } from 'next/font/google';
import { useRouter, useParams } from 'next/navigation';

const sarabun = Sarabun({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

interface DraftItem {
  item_id: string;
  customer_id?: string;
  line_id: string;
  item_type: string;
  brand: string;
  model: string;
  capacity?: string;
  serial_number?: string;
  color?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  gpu?: string;
  screen_size?: string;
  watch_size?: string;
  watch_connectivity?: string;
  item_condition: number;
  ai_condition_score?: number;
  ai_condition_reason?: string;
  estimated_value: number;
  ai_confidence?: number;
  accessories?: string;
  defects?: string;
  notes?: string;
  image_urls: string[];
  item_status: string;
  created_at: string;
}

export default function DraftDetailPage() {
  const { profile, isLoading: liffLoading } = useLiff();
  const router = useRouter();
  const params = useParams();
  const itemId = params?.itemId as string;

  const [draft, setDraft] = useState<DraftItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isCreatingContract, setIsCreatingContract] = useState(false);

  useEffect(() => {
    if (profile?.userId && itemId) {
      fetchDraft();
      checkRegistration();
    }
  }, [profile?.userId, itemId]);

  const fetchDraft = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/items/draft?lineId=${profile?.userId}&itemId=${itemId}`);
      if (response.data.success && response.data.item) {
        setDraft(response.data.item);
      } else {
        setError('ไม่พบบันทึกนี้');
      }
    } catch (error: any) {
      console.error('Error fetching draft:', error);
      setError('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const checkRegistration = async () => {
    try {
      const response = await axios.get(`/api/users/check?lineId=${profile?.userId}`);
      setIsRegistered(response.data.exists);
    } catch (error) {
      console.error('Error checking registration:', error);
    }
  };

  const handleContinueToContract = () => {
    if (!isRegistered) {
      // Redirect to registration
      const liffIdRegister = process.env.NEXT_PUBLIC_LIFF_ID_REGISTER || '2008216710-BEZ5XNyd';
      window.location.href = `https://liff.line.me/${liffIdRegister}/register?returnTo=/drafts/${itemId}`;
      return;
    }

    // Continue to create contract with this draft data
    router.push(`/estimate?draftId=${itemId}`);
  };

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <p className="text-gray-800 font-semibold mb-2">ไม่พบข้อมูล</p>
          <p className="text-sm text-gray-600 mb-6">{error || 'ไม่พบบันทึกชั่วคราวนี้'}</p>
          <button
            onClick={() => router.push('/drafts')}
            className="px-6 py-2.5 bg-orange-700 text-white rounded-lg font-medium hover:bg-orange-800 transition-colors"
          >
            กลับไปหน้าบันทึก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-50 ${sarabun.className}`}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.push('/drafts')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-800">รายละเอียดบันทึก</h1>
            <p className="text-xs text-gray-500">Draft Details</p>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 pb-24">
        {/* Images */}
        {draft.image_urls && draft.image_urls.length > 0 && (
          <div className="mb-6">
            <div className="grid grid-cols-3 gap-2">
              {draft.image_urls.map((url, index) => (
                <div key={index} className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  <Image
                    src={url}
                    alt={`Image ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Item Info Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-800">
                {draft.brand} {draft.model}
              </h2>
              <p className="text-sm text-gray-500">{draft.item_type}</p>
            </div>
            <div className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold">
              DRAFT
            </div>
          </div>

          <div className="space-y-2 text-sm">
            {draft.capacity && (
              <div className="flex justify-between">
                <span className="text-gray-600">ความจุ:</span>
                <span className="font-medium">{draft.capacity}</span>
              </div>
            )}
            {draft.color && (
              <div className="flex justify-between">
                <span className="text-gray-600">สี:</span>
                <span className="font-medium">{draft.color}</span>
              </div>
            )}
            {draft.serial_number && (
              <div className="flex justify-between">
                <span className="text-gray-600">Serial No.:</span>
                <span className="font-medium text-xs">{draft.serial_number}</span>
              </div>
            )}
            {draft.screen_size && (
              <div className="flex justify-between">
                <span className="text-gray-600">ขนาดหน้าจอ:</span>
                <span className="font-medium">{draft.screen_size}</span>
              </div>
            )}
            {draft.cpu && (
              <div className="flex justify-between">
                <span className="text-gray-600">CPU:</span>
                <span className="font-medium">{draft.cpu}</span>
              </div>
            )}
            {draft.ram && (
              <div className="flex justify-between">
                <span className="text-gray-600">RAM:</span>
                <span className="font-medium">{draft.ram}</span>
              </div>
            )}
            {draft.storage && (
              <div className="flex justify-between">
                <span className="text-gray-600">Storage:</span>
                <span className="font-medium">{draft.storage}</span>
              </div>
            )}
            {draft.gpu && (
              <div className="flex justify-between">
                <span className="text-gray-600">GPU:</span>
                <span className="font-medium">{draft.gpu}</span>
              </div>
            )}
            {draft.watch_size && (
              <div className="flex justify-between">
                <span className="text-gray-600">ขนาด:</span>
                <span className="font-medium">{draft.watch_size}</span>
              </div>
            )}
            {draft.watch_connectivity && (
              <div className="flex justify-between">
                <span className="text-gray-600">รุ่น:</span>
                <span className="font-medium">{draft.watch_connectivity}</span>
              </div>
            )}
          </div>
        </div>

        {/* Condition Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <h3 className="font-bold text-gray-800 mb-3">สภาพสินค้า</h3>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">สภาพโดยรวม:</span>
            <span className="text-lg font-bold text-green-600">{draft.item_condition}%</span>
          </div>
          <div className="w-full rounded-full h-3 bg-gray-200 overflow-hidden">
            <div
              className="h-3 bg-green-600 rounded-full transition-all"
              style={{ width: `${draft.item_condition}%` }}
            ></div>
          </div>

          {draft.ai_condition_reason && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">
                <span className="font-semibold">AI Analysis: </span>
                {draft.ai_condition_reason}
              </p>
            </div>
          )}

          {draft.accessories && (
            <div className="mt-3">
              <span className="text-sm font-semibold text-gray-700">อุปกรณ์เสริม: </span>
              <span className="text-sm text-gray-600">{draft.accessories}</span>
            </div>
          )}

          {draft.defects && (
            <div className="mt-2">
              <span className="text-sm font-semibold text-gray-700">ตำหนิ: </span>
              <span className="text-sm text-gray-600">{draft.defects}</span>
            </div>
          )}

          {draft.notes && (
            <div className="mt-2">
              <span className="text-sm font-semibold text-gray-700">หมายเหตุ: </span>
              <span className="text-sm text-gray-600">{draft.notes}</span>
            </div>
          )}
        </div>

        {/* Price Card */}
        <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl border border-orange-200 p-4 mb-4">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">ราคาประเมินโดย AI</p>
            <p className="text-3xl font-bold text-orange-700">{draft.estimated_value.toLocaleString()} ฿</p>
            {draft.ai_confidence && (
              <p className="text-xs text-gray-500 mt-1">
                Confidence: {Math.round(draft.ai_confidence * 100)}%
              </p>
            )}
          </div>
        </div>

        {/* Registration Status */}
        {!isRegistered && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex gap-2">
              <div className="flex-shrink-0">
                <div className="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center">
                  <span className="text-yellow-600 text-xs font-bold">!</span>
                </div>
              </div>
              <div className="text-sm">
                <p className="font-semibold text-gray-800 mb-1">ต้องลงทะเบียนก่อน</p>
                <p className="text-xs text-gray-600">
                  คุณต้องลงทะเบียนก่อนจึงจะสามารถสร้างสัญญาจำนำได้
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleContinueToContract}
            disabled={isCreatingContract}
            className="w-full py-3.5 bg-orange-700 text-white rounded-lg font-bold hover:bg-orange-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isCreatingContract ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                กำลังดำเนินการ...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                {isRegistered ? 'ดำเนินการจำนำต่อ' : 'ลงทะเบียนเพื่อจำนำ'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
