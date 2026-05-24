'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';
import { isDropPointMockEnabled, mockHistoryEntries } from '@/lib/mock-drop-point';
import {
  DropPointCard,
  DropPointHeroCard,
  DropPointLoadingScreen,
  DropPointMessageState,
  DropPointPageShell,
  DropPointStatusBadge,
} from '@/components/drop-point/ui';

type HistoryEntry = {
  id: string;
  type: 'PAWN' | 'REDEMPTION';
  title: string;
  status: string;
  rawStatus: string;
  date?: string;
};

const FILTERS = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: 'ARRIVED', label: 'รับแล้ว' },
  { key: 'RETURNED', label: 'คืนแล้ว' },
  { key: 'CANCELLED', label: 'ยกเลิก' },
] as const;

function getDisplayStatus(entry: Pick<HistoryEntry, 'status' | 'rawStatus'>) {
  if (entry.rawStatus === 'RECEIVED_AT_DROP_POINT' || entry.rawStatus === 'VERIFIED' || entry.status === 'ถึงแล้ว') {
    return 'รับแล้ว';
  }
  return entry.status;
}

function formatDate(dateString?: string) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function DropPointHistoryContent() {
  const { profile, isLoading: liffLoading } = useLiff();
  const searchParams = useSearchParams();
  const previewMode = isDropPointMockEnabled(searchParams);

  const [loading, setLoading] = useState(true);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('ALL');

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
        setEntries(mockHistoryEntries);
        setLoading(false);
        return;
      }
      if (liffLoading || !profile?.userId || !pinVerified) return;
      try {
        setLoading(true);
        const response = await axios.get(`/api/drop-points/history/${profile.userId}`);
        setEntries(response.data.entries || []);
      } catch (fetchError: any) {
        setError(fetchError.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [previewMode, liffLoading, profile?.userId, pinVerified]);

  const filteredEntries = useMemo(() => {
    if (filter === 'ALL') return entries;
    if (filter === 'ARRIVED') return entries.filter((entry) => getDisplayStatus(entry) === 'รับแล้ว');
    if (filter === 'RETURNED') return entries.filter((entry) => getDisplayStatus(entry) === 'คืนแล้ว');
    if (filter === 'CANCELLED') return entries.filter((entry) => getDisplayStatus(entry) === 'ยกเลิก');
    return entries;
  }, [entries, filter]);

  if (liffLoading && !previewMode) return <DropPointLoadingScreen />;
  if (!previewMode && !pinVerified) {
    return (
      <DropPointPageShell className="flex items-center justify-center p-6">
        <div className="register-shell-strong w-full max-w-md rounded-[30px] p-4">
          <div className="register-inner-card rounded-lg px-5 py-6 text-center">
            <h2 className="register-heading text-xl font-semibold">ยืนยัน PIN ก่อนเข้าดูประวัติ</h2>
            <p className="register-subtle mt-2 text-sm">
              เพื่อความปลอดภัย กรุณายืนยัน PIN 6 หลักก่อนดูข้อมูลย้อนหลังของ Drop Point
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
  if (loading) return <DropPointLoadingScreen />;
  if (error) return <DropPointMessageState title="โหลดประวัติไม่สำเร็จ" description={error} />;

  return (
    <DropPointPageShell>
      <DropPointHeroCard
        eyebrow={previewMode ? 'Preview Mode' : 'Drop Point'}
        title="ประวัติรายการ"
        subtitle="รวมรายการรับเข้า ส่งคืน และสถานะย้อนหลังทั้งหมด"
      />

      <div className="mt-4 grid grid-cols-4 gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            onClick={() => setFilter(option.key)}
            className={`w-full rounded-full px-2 py-2 text-center text-xs font-semibold transition-colors ${
              filter === option.key ? 'register-primary-btn' : 'register-secondary-btn'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {filteredEntries.length === 0 ? (
          <DropPointCard className="text-center text-sm text-foreground-subtle">ไม่มีรายการในสถานะนี้</DropPointCard>
        ) : filteredEntries.map((entry) => (
          <DropPointCard key={`${entry.type}-${entry.id}`}>
            {(() => {
              const displayStatus = getDisplayStatus(entry);
              return (
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="register-heading text-base font-semibold">{entry.title || '-'}</div>
                <div className="register-subtle mt-1 text-xs">
                  {entry.type === 'PAWN' ? 'รับเข้า' : 'ส่งคืน'} • {formatDate(entry.date)}
                </div>
              </div>
              <DropPointStatusBadge
                tone={
                  displayStatus === 'รับแล้ว' ? 'success'
                  : displayStatus === 'คืนแล้ว' ? 'warning'
                  : displayStatus === 'ยกเลิก' ? 'danger'
                  : 'neutral'
                }
              >
                {displayStatus}
              </DropPointStatusBadge>
            </div>
              );
            })()}
          </DropPointCard>
        ))}
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

export default function DropPointHistoryPage() {
  return (
    <Suspense fallback={<DropPointLoadingScreen />}>
      <DropPointHistoryContent />
    </Suspense>
  );
}
