'use client';

import { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { ArrowLeft, Trash2, Clock } from 'lucide-react';
import { Sarabun } from 'next/font/google';
import { useRouter } from 'next/navigation';
import ImageCarousel from '@/components/ImageCarousel';

const sarabun = Sarabun({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

interface DraftItem {
  item_id: string;
  item_type: string;
  brand: string;
  model: string;
  capacity?: string;
  color?: string;
  estimated_value: number;
  image_urls: string[];
  item_condition: number;
  created_at: string;
}

export default function DraftsPage() {
  const { profile, isLoading } = useLiff();
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DraftItem | null>(null);

  useEffect(() => {
    if (profile?.userId) {
      fetchDrafts();
    }
  }, [profile?.userId]);

  const fetchDrafts = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/items/draft?lineId=${profile?.userId}`);
      if (response.data.success) {
        setDrafts(response.data.items);
      }
    } catch (error: any) {
      console.error('Error fetching drafts:', error);
      setError('ไม่สามารถโหลดบันทึกชั่วคราวได้');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;

    try {
      setDeletingId(pendingDelete.item_id);
      await axios.delete(`/api/items/draft?itemId=${pendingDelete.item_id}&lineId=${profile?.userId}`);
      setDrafts(drafts.filter(d => d.item_id !== pendingDelete.item_id));
      setPendingDelete(null);
    } catch (error) {
      console.error('Error deleting draft:', error);
      alert('ไม่สามารถลบบันทึกได้');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInHours < 1) {
      return 'เมื่อสักครู่';
    } else if (diffInHours < 24) {
      return `${diffInHours} ชั่วโมงที่แล้ว`;
    } else if (diffInDays < 7) {
      return `${diffInDays} วันที่แล้ว`;
    } else {
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
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
            onClick={() => router.push('/estimate')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-800">บันทึกชั่วคราว</h1>
            <p className="text-xs text-gray-500">
              {drafts.length} รายการ
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 pb-20">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Info Card */}
        <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex gap-2">
            <Clock className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-700">
              <p className="font-semibold mb-1">บันทึกชั่วคราว</p>
              <p className="text-xs text-gray-600">
                สินค้าที่คุณบันทึกไว้จะถูกเก็บไว้ 7 วัน คุณสามารถกลับมาสร้างสัญญาจำนำได้ภายหลัง
              </p>
            </div>
          </div>
        </div>

        {drafts.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-10 h-10 text-gray-400" />
            </div>
            <p className="text-gray-600 font-medium mb-2">ยังไม่มีบันทึกชั่วคราว</p>
            <p className="text-sm text-gray-500 mb-6">
              เมื่อคุณบันทึกสินค้าชั่วคราว จะแสดงที่นี่
            </p>
            <button
              onClick={() => router.push('/estimate')}
              className="px-6 py-2.5 bg-orange-700 text-white rounded-lg font-medium hover:bg-orange-800 transition-colors"
            >
              ประเมินราคาสินค้า
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <div
                key={draft.item_id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div
                  onClick={() => router.push(`/drafts/${draft.item_id}`)}
                  className="cursor-pointer"
                >
                  <div className="flex gap-3 p-3">
                    {/* Image */}
                    <div className="w-20 h-20 flex-shrink-0">
                      <ImageCarousel
                        images={draft.image_urls}
                        className="w-20 h-20 rounded-lg gap-2 no-scrollbar"
                        itemClassName="w-20 h-20 rounded-lg overflow-hidden bg-gray-100"
                        emptyLabel="No Image"
                        emptyClassName="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs"
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">
                            {draft.brand} {draft.model}
                          </p>
                          <p className="text-xs text-gray-500">
                            {draft.item_type}
                          </p>
                        </div>
                      </div>

                      {/* Specs */}
                      <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
                        {draft.capacity && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            {draft.capacity}
                          </span>
                        )}
                        {draft.color && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            {draft.color}
                          </span>
                        )}
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
                          สภาพ {draft.item_condition}%
                        </span>
                      </div>

                      {/* Price and Time */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-orange-700">
                          {draft.estimated_value?.toLocaleString() || 0} บาท
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatDate(draft.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Delete Button */}
                <div className="border-t border-gray-100 px-3 py-2 bg-gray-50">
                  <button
                    onClick={() => setPendingDelete(draft)}
                    disabled={deletingId === draft.item_id}
                    className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {deletingId === draft.item_id ? 'กำลังลบ...' : 'ลบบันทึก'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-800">ยืนยันการลบบันทึก</h3>
            <p className="mt-2 text-sm text-gray-600">
              ต้องการลบบันทึก <span className="font-semibold text-gray-800">{pendingDelete.brand} {pendingDelete.model}</span> ใช่หรือไม่
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingId === pendingDelete.item_id}
                className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {deletingId === pendingDelete.item_id ? 'กำลังลบ...' : 'ลบบันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
