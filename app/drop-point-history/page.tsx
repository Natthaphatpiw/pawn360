'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

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
  { key: 'INCOMING', label: 'กำลังมา' },
  { key: 'ARRIVED', label: 'ถึงแล้ว' },
  { key: 'RETURN_PENDING', label: 'รอคืนของ' },
  { key: 'RETURNED', label: 'คืนแล้ว' },
  { key: 'CANCELLED', label: 'ยกเลิก' },
];

function formatDate(dateString?: string) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('th-TH');
}

function DropPointHistoryContent() {
  const { profile, isLoading: liffLoading } = useLiff();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    if (liffLoading || !profile?.userId) return;
    fetchHistory(profile.userId);
  }, [liffLoading, profile?.userId]);

  const fetchHistory = async (lineId: string) => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/drop-points/history/${lineId}`);
      setEntries(response.data.entries || []);
    } catch (fetchError: any) {
      console.error('Error fetching history:', fetchError);
      setError(fetchError.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = useMemo(() => {
    if (filter === 'ALL') return entries;
    if (filter === 'INCOMING') return entries.filter((entry) => entry.status === 'กำลังมา');
    if (filter === 'ARRIVED') return entries.filter((entry) => entry.status === 'ถึงแล้ว');
    if (filter === 'RETURN_PENDING') return entries.filter((entry) => entry.status === 'รอคืนของ');
    if (filter === 'RETURNED') return entries.filter((entry) => entry.status === 'คืนแล้ว');
    if (filter === 'CANCELLED') return entries.filter((entry) => entry.status === 'ยกเลิก');
    return entries;
  }, [entries, filter]);

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

  return (
    <div className="min-h-screen bg-[#F5F7FA] font-sans px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-800">ประวัติรายการ</h1>
        <p className="text-sm text-gray-500">รวมรายการทั้งหมดของ Drop Point</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            onClick={() => setFilter(option.key)}
            className={`px-4 py-2 rounded-full text-xs font-semibold border ${
              filter === option.key
                ? 'bg-[#365314] text-white border-[#365314]'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filteredEntries.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center text-sm text-gray-500">
          ไม่มีรายการในสถานะนี้
        </div>
      ) : (
        filteredEntries.map((entry) => (
          <div key={`${entry.type}-${entry.id}`} className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-base font-bold text-gray-800">{entry.title || '-'}</div>
                <div className="text-xs text-gray-500">
                  {entry.type === 'PAWN' ? 'จำนำ' : 'ส่งคืน'} • {formatDate(entry.date)}
                </div>
              </div>
              <span className="text-xs font-bold text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                {entry.status}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function DropPointHistoryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#365314] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <DropPointHistoryContent />
    </Suspense>
  );
}
