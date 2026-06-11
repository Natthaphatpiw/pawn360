'use client';

import { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { Trash2, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ImageCarousel from '@/components/ImageCarousel';
import { deleteMockDraft, getMockDraftItems, isMockPawnerMode } from '@/lib/mock-pawner';

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
  const mockMode = isMockPawnerMode();
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DraftItem | null>(null);

  useEffect(() => {
    if (mockMode || profile?.userId) {
      fetchDrafts();
    }
  }, [mockMode, profile?.userId]);

  const fetchDrafts = async () => {
    try {
      setLoading(true);
      setError(null);

      if (mockMode) {
        setDrafts(getMockDraftItems());
        return;
      }

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

      if (mockMode) {
        deleteMockDraft(pendingDelete.item_id);
        setDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.item_id !== pendingDelete.item_id));
        setPendingDelete(null);
        return;
      }

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

  const parseDraftDate = (value: string) => {
    if (!value) return null;
    const trimmed = value.trim();
    const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed);
    const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    const withTimezone = hasTimezone ? normalized : `${normalized}Z`;
    const parsed = new Date(withTimezone);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  };

  const formatDate = (dateString: string) => {
    const date = parseDraftDate(dateString);
    if (!date) return '-';
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
      <div className="min-h-screen bg-background-white font-sans flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 1. Header Section */}
      <div className="mt-6 mx-4 mb-0 rounded-xl border border-primary-border bg-primary-soft/50 p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
        <div className="rounded-[var(--radius-lg)] border border-background-white/80 bg-background-white/90 px-4 py-4">
          <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/40">
            Draft Management
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-primary">
            บันทึกชั่วคราว
          </div>
          <p className="mt-1 text-xs text-foreground-subtle">{drafts.length} รายการ</p>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 py-6 pb-20">
        {error && (
          <div className="mb-4 rounded-[var(--radius-lg)] border border-error/20 bg-error-soft px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {/* Info Card */}
        <div className="mb-6 rounded-lg border border-primary-border bg-primary-soft/60 p-4 shadow-[var(--shadow-soft)]">
          <div className="flex gap-2">
            <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
            <div className="text-sm text-foreground-muted">
              <p className="mb-1 font-semibold">บันทึกชั่วคราว</p>
              <p className="text-xs text-foreground-subtle">
                สินค้าที่คุณบันทึกไว้จะถูกเก็บไว้ 7 วัน คุณสามารถกลับมาดำเนินการขอสินเชื่อได้ภายหลัง
              </p>
            </div>
          </div>
        </div>

        {drafts.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center rounded-full bg-background-subtle text-foreground-subtle">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"><g fill="none" fill-rule="evenodd"><path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M12.916 3.244a3 3 0 0 0-1.832 0L4.55 5.34a1 1 0 0 0-.556.45L1.757 9.654a1 1 0 0 0 .56 1.453l7.14 2.292a1 1 0 0 0 1.171-.451l.372-.642v2.317a1 1 0 0 1-1.306.952l-5.838-1.873v3.278a2 2 0 0 0 1.388 1.905l5.84 1.872a3 3 0 0 0 1.832 0l5.84-1.872a2 2 0 0 0 1.389-1.905l-.002-3.278l-5.837 1.873A1 1 0 0 1 13 14.622v-2.317l.371.642a1 1 0 0 0 1.171.45l7.141-2.29a1 1 0 0 0 .56-1.454L20.006 5.79a1 1 0 0 0-.556-.45zm2.953 3.048L12 7.533L8.13 6.292l3.564-1.144a1 1 0 0 1 .611 0z"/></g></svg>
            </div>
            <p className="mb-2 font-medium text-foreground-muted">ยังไม่มีบันทึกชั่วคราว</p>
            <p className="mb-6 text-sm text-foreground-subtle">
              เมื่อคุณบันทึกสินค้าชั่วคราว จะแสดงที่นี่
            </p>
            <button
              onClick={() => router.push('/estimate')}
              className="min-h-12 rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
            >
              ประเมินราคาสินค้า
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <div
                key={draft.item_id}
                className="overflow-hidden rounded-lg border border-primary-border bg-background-white shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-strong)]"
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
                        className="w-20 h-20 rounded-md gap-2 no-scrollbar"
                        itemClassName="w-20 h-20 overflow-hidden rounded-md bg-background-subtle"
                        emptyLabel="No Image"
                        emptyClassName="flex h-20 w-20 items-center justify-center rounded-md bg-background-subtle text-xs text-foreground-subtle"
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-bold text-foreground-muted">
                            {draft.brand} {draft.model}
                          </p>
                          <p className="text-xs text-foreground-subtle">
                            {draft.item_type}
                          </p>
                        </div>
                      </div>

                      {/* Specs */}
                      <div className="mb-2 flex items-center gap-2 text-xs text-foreground-muted">
                        {draft.capacity && (
                          <span className="rounded-full bg-background-subtle px-2 py-0.5">
                            {draft.capacity}
                          </span>
                        )}
                        {draft.color && (
                          <span className="rounded-full bg-background-subtle px-2 py-0.5">
                            {draft.color}
                          </span>
                        )}
                        <span className="rounded-full bg-success/10 px-2 py-0.5 font-medium text-success">
                          สภาพ {draft.item_condition}%
                        </span>
                      </div>

                      {/* Price and Time */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-primary">
                          {draft.estimated_value?.toLocaleString() || 0} บาท
                        </span>
                        <span className="text-xs text-foreground-subtle">
                          {formatDate(draft.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Delete Button */}
                <div className="border-t border-primary-border bg-primary-soft px-3 py-2">
                  <button
                    onClick={() => setPendingDelete(draft)}
                    disabled={deletingId === draft.item_id}
                    className="flex items-center gap-1.5 text-xs font-medium text-error transition-colors hover:text-error/90 disabled:opacity-50"
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
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/35 p-4 pb-8 sm:items-center"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="modal-pop-in w-full max-w-sm rounded-xl bg-background-white p-5 shadow-[var(--shadow-strong)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-bold text-foreground-muted">ยืนยันการลบบันทึก</h3>
            <p className="mt-2 text-sm text-foreground-muted">
              ต้องการลบบันทึก <span className="font-semibold text-foreground-muted">{pendingDelete.brand} {pendingDelete.model}</span> ใช่หรือไม่
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="flex-1 rounded-full bg-background-subtle py-2 text-sm font-semibold text-foreground-muted transition-colors hover:bg-line-soft"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingId === pendingDelete.item_id}
                className="flex-1 rounded-full bg-error py-2 text-sm font-semibold text-white transition-colors hover:bg-error-hover disabled:opacity-60"
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
