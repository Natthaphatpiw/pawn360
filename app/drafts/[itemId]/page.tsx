'use client';

import { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { XCircle } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { getMockDraftItems, isMockPawnerMode } from '@/lib/mock-pawner';

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
  const mockMode = isMockPawnerMode();

  const [draft, setDraft] = useState<DraftItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isCreatingContract, setIsCreatingContract] = useState(false);

  useEffect(() => {
    if ((mockMode || profile?.userId) && itemId) {
      fetchDraft();
      checkRegistration();
    }
  }, [mockMode, profile?.userId, itemId]);

  const fetchDraft = async () => {
    try {
      setLoading(true);
      setError(null);

      if (mockMode) {
        const mockDraft = getMockDraftItems().find((item) => item.item_id === itemId);

        if (!mockDraft) {
          setError('ไม่พบบันทึกนี้');
          return;
        }

        setDraft({
          item_id: mockDraft.item_id,
          line_id: 'Umock_dev_user_001',
          item_type: mockDraft.item_type,
          brand: mockDraft.brand,
          model: mockDraft.model,
          capacity: mockDraft.capacity,
          color: mockDraft.color,
          serial_number: mockDraft.item_type === 'Apple' ? 'MLPN3ZP/A' : undefined,
          cpu: mockDraft.item_type === 'โน้ตบุค' ? 'Apple M2' : undefined,
          ram: mockDraft.item_type === 'โน้ตบุค' ? '8GB' : undefined,
          storage: mockDraft.item_type === 'โน้ตบุค' ? '512GB SSD' : undefined,
          screen_size: mockDraft.item_type === 'กล้อง' ? undefined : '6.7 นิ้ว',
          item_condition: mockDraft.item_condition,
          ai_condition_score: mockDraft.item_condition / 100,
          ai_condition_reason: `Mock preview: สินค้า ${mockDraft.brand} ${mockDraft.model} อยู่ในสภาพประมาณ ${mockDraft.item_condition}% พร้อมสำหรับทดสอบหน้า detail`,
          estimated_value: mockDraft.estimated_value,
          ai_confidence: 0.92,
          accessories: mockDraft.item_type === 'Apple' ? 'กล่อง, สายชาร์จ' : 'อุปกรณ์มาตรฐาน',
          defects: 'รอยใช้งานเล็กน้อยตามขอบเครื่อง',
          notes: 'ข้อมูลตัวอย่างสำหรับ preview หน้ารายละเอียดบันทึก',
          image_urls: mockDraft.image_urls,
          item_status: 'draft',
          created_at: mockDraft.created_at,
        });
        return;
      }

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
      if (mockMode) {
        setIsRegistered(true);
        return;
      }

      const response = await axios.get(`/api/pawners/check?lineId=${profile?.userId}`);
      setIsRegistered(Boolean(response.data?.exists));
    } catch (error) {
      console.error('Error checking registration:', error);
      setIsRegistered(false);
    }
  };

  const handleContinueToContract = () => {
    if (!isRegistered) {
      const liffIdRegister = process.env.NEXT_PUBLIC_LIFF_ID_REGISTER || '2008216710-BEZ5XNyd';
      window.location.href = `https://liff.line.me/${liffIdRegister}`;
      return;
    }

    // Continue to create contract with this draft data
    router.push(`/estimate?draftId=${itemId}`);
  };

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen bg-background-white font-sans flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-32 w-32 items-center justify-center rounded-full bg-error-soft">
            <XCircle className="h-24 w-24 text-error" />
          </div>
          <p className="mb-2 font-semibold text-foreground-muted">ไม่พบข้อมูล</p>
          <p className="mb-6 text-sm text-foreground-subtle">{error || 'ไม่พบบันทึกชั่วคราวนี้'}</p>
          <button
            onClick={() => router.push('/drafts')}
            className="min-h-12 rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            กลับไปหน้าบันทึก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-liff page-neutral min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="m-4 mb-0 rounded-xl border border-primary-border bg-primary-soft/50 p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
        <div className="rounded-lg border border-background-white/80 bg-background-white/90 px-4 py-4">
          <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/40">
            Draft Preview
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-primary">
            รายละเอียดบันทึก
          </div>
          <p className="mt-1 text-xs text-foreground-subtle">
            Draft Details
          </p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 pb-24">
        {/* Images */}
        {draft.image_urls && draft.image_urls.length > 0 && (
          <div className="mb-6">
            <div className="grid grid-cols-3 gap-2">
              {draft.image_urls.map((url, index) => (
                <div key={index} className="relative aspect-square overflow-hidden rounded-lg bg-background-subtle">
                  <img
                    src={url}
                    alt={`Image ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Item Info Card */}
        <div className="mb-4 rounded-xl border border-primary-border bg-primary-soft/50 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground-muted">
                {draft.brand} {draft.model}
              </h2>
              <p className="text-sm text-foreground-subtle">{draft.item_type}</p>
            </div>
            <div className="rounded-full bg-primary/20 px-3 py-1 text-xs font-bold text-primary">
              DRAFT
            </div>
          </div>

          <div className="space-y-2 text-sm">
            {draft.capacity && (
              <div className="flex justify-between">
                <span className="text-foreground-subtle">ความจุ:</span>
                <span className="font-medium text-foreground-muted">{draft.capacity}</span>
              </div>
            )}
            {draft.color && (
              <div className="flex justify-between">
                <span className="text-foreground-subtle">สี:</span>
                <span className="font-medium text-foreground-muted">{draft.color}</span>
              </div>
            )}
            {draft.serial_number && (
              <div className="flex justify-between">
                <span className="text-foreground-subtle">Serial No.:</span>
                <span className="text-xs font-medium text-foreground-muted">{draft.serial_number}</span>
              </div>
            )}
            {draft.screen_size && (
              <div className="flex justify-between">
                <span className="text-foreground-subtle">ขนาดหน้าจอ:</span>
                <span className="font-medium text-foreground-muted">{draft.screen_size}</span>
              </div>
            )}
            {draft.cpu && (
              <div className="flex justify-between">
                <span className="text-foreground-subtle">CPU:</span>
                <span className="font-medium text-foreground-muted">{draft.cpu}</span>
              </div>
            )}
            {draft.ram && (
              <div className="flex justify-between">
                <span className="text-foreground-subtle">RAM:</span>
                <span className="font-medium text-foreground-muted">{draft.ram}</span>
              </div>
            )}
            {draft.storage && (
              <div className="flex justify-between">
                <span className="text-foreground-subtle">Storage:</span>
                <span className="font-medium text-foreground-muted">{draft.storage}</span>
              </div>
            )}
            {draft.gpu && (
              <div className="flex justify-between">
                <span className="text-foreground-subtle">GPU:</span>
                <span className="font-medium text-foreground-muted">{draft.gpu}</span>
              </div>
            )}
            {draft.watch_size && (
              <div className="flex justify-between">
                <span className="text-foreground-subtle">ขนาด:</span>
                <span className="font-medium text-foreground-muted">{draft.watch_size}</span>
              </div>
            )}
            {draft.watch_connectivity && (
              <div className="flex justify-between">
                <span className="text-foreground-subtle">รุ่น:</span>
                <span className="font-medium text-foreground-muted">{draft.watch_connectivity}</span>
              </div>
            )}
          </div>
        </div>

        {/* Condition Card */}
        <div className="mb-4 rounded-xl border border-primary-border bg-primary-soft/50 p-4">
          <h3 className="mb-3 font-bold text-foreground-muted">สภาพสินค้า</h3>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-foreground-subtle">สภาพโดยรวม:</span>
            <span className="text-lg font-bold text-success">{draft.item_condition}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-background-subtle">
            <div
              className="h-3 rounded-full bg-success transition-all"
              style={{ width: `${draft.item_condition}%` }}
            ></div>
          </div>

          {draft.ai_condition_reason && (
            <div className="mt-3 rounded-md bg-primary/20 p-3">
              <p className="text-xs text-primary">
                <span className="font-semibold">AI Analysis: </span>
                {draft.ai_condition_reason}
              </p>
            </div>
          )}

          {draft.accessories && (
            <div className="mt-3">
              <span className="text-sm font-semibold text-foreground-muted">อุปกรณ์เสริม: </span>
              <span className="text-sm text-foreground-subtle">{draft.accessories}</span>
            </div>
          )}

          {draft.defects && (
            <div className="mt-2">
              <span className="text-sm font-semibold text-foreground-muted">ตำหนิ: </span>
              <span className="text-sm text-foreground-subtle">{draft.defects}</span>
            </div>
          )}

          {draft.notes && (
            <div className="mt-2">
              <span className="text-sm font-semibold text-foreground-muted">หมายเหตุ: </span>
              <span className="text-sm text-foreground-subtle">{draft.notes}</span>
            </div>
          )}
        </div>

        {/* Price Card */}
        <div className="mb-4 rounded-xl border border-primary-border bg-primary-soft/50 p-4">
          <div className="text-center">
            <p className="mb-1 text-sm text-foreground-subtle">ราคาประเมินโดย AI</p>
            <p className="text-3xl font-bold text-primary">{draft.estimated_value.toLocaleString()} ฿</p>
            {draft.ai_confidence && (
              <p className="mt-1 text-xs text-foreground-subtle">
                Confidence: {Math.round(draft.ai_confidence * 100)}%
              </p>
            )}
          </div>
        </div>

        {/* Registration Status */}
        {!isRegistered && (
          <div className="mb-4 rounded-xl border border-warning/20 bg-warning-soft p-4">
            <div className="flex gap-2">
              <div className="flex-shrink-0">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-warning/10">
                  <span className="text-xs font-bold text-warning">!</span>
                </div>
              </div>
              <div className="text-sm">
                <p className="mb-1 font-semibold text-foreground-muted">ต้องลงทะเบียนก่อน</p>
                <p className="text-xs text-foreground-subtle">
                  คุณต้องลงทะเบียนก่อนจึงจะสามารถดำเนินการขอสินเชื่อต่อได้
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-background-white/5 border-t border-white/50 p-4 pb-8 backdrop-blur-sm shadow-[0_-2px_10px_rgba(11,59,130,0.1)]">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleContinueToContract}
            disabled={isCreatingContract}
            className="flex w-full items-center justify-center rounded-full bg-primary px-4 py-3.5 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreatingContract ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary-fg"></div>
                กำลังดำเนินการ...
              </>
            ) : (
              <>{isRegistered ? 'ดำเนินการต่อ' : 'ลงทะเบียนเพื่อขอสินเชื่อ'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
