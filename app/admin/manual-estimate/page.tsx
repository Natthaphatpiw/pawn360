"use client";

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';

type ManualEstimateRequest = {
  request_id: string;
  line_id: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  item_data: Record<string, any>;
  image_urls: string[];
  estimated_price?: number | null;
  condition_score?: number | null;
  condition_note?: string | null;
  admin_line_id?: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
};

const extractRequestId = (searchParams: URLSearchParams | ReadonlyURLSearchParams) => {
  const direct = searchParams.get('requestId');
  if (direct) return direct;

  const liffState = searchParams.get('liff.state');
  if (!liffState) return null;

  const decoded = decodeURIComponent(liffState);
  const queryString = decoded.includes('?') ? decoded.split('?')[1] : decoded;
  const stateParams = new URLSearchParams(queryString);
  return stateParams.get('requestId');
};

const buildDetailRows = (itemData: Record<string, any>) => {
  const rows: Array<{ label: string; value: string }> = [];

  const addRow = (label: string, value?: string) => {
    if (value && value.trim()) rows.push({ label, value });
  };

  addRow('ประเภท', itemData.itemType);
  addRow('ยี่ห้อ', itemData.brand);
  addRow('รุ่น', itemData.model);
  addRow('ความจุ', itemData.capacity);
  addRow('สี', itemData.color);
  addRow('ขนาดจอ', itemData.screenSize);
  addRow('ขนาดนาฬิกา', itemData.watchSize);
  addRow('การเชื่อมต่อ', itemData.watchConnectivity);
  addRow('อุปกรณ์เสริม', itemData.accessories);
  addRow('หมวด Apple', itemData.appleCategory);
  addRow('สเปค Apple', itemData.appleSpecs);
  addRow('CPU', itemData.cpu);
  addRow('RAM', itemData.ram);
  addRow('Storage', itemData.storage);
  addRow('GPU', itemData.gpu);

  if (Array.isArray(itemData.lenses) && itemData.lenses.length) {
    addRow('เลนส์', itemData.lenses.join(', '));
  }

  if (typeof itemData.pawnerCondition === 'number') {
    addRow('สภาพที่ลูกค้ากรอก', `${Math.round(itemData.pawnerCondition)}%`);
  } else if (typeof itemData.condition === 'number') {
    addRow('สภาพที่ลูกค้ากรอก', `${Math.round(itemData.condition)}%`);
  }

  addRow('ตำหนิ', itemData.defects);
  addRow('หมายเหตุ', itemData.note);

  return rows;
};

export default function ManualEstimatePage() {
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [request, setRequest] = useState<ManualEstimateRequest | null>(null);
  const [estimatedPrice, setEstimatedPrice] = useState('');
  const [conditionScore, setConditionScore] = useState('');
  const [conditionNote, setConditionNote] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const id = extractRequestId(searchParams);
    setRequestId(id);
  }, [searchParams]);

  useEffect(() => {
    if (!requestId) return;

    const fetchRequest = async () => {
      setIsFetching(true);
      setError(null);
      try {
        const response = await axios.get('/api/manual-estimate', {
          params: { requestId },
        });
        const data = response.data?.request as ManualEstimateRequest;
        setRequest(data);

        if (data?.estimated_price) {
          setEstimatedPrice(String(data.estimated_price));
        }
        if (typeof data?.condition_score === 'number') {
          setConditionScore(String(Math.round(data.condition_score)));
        }
        if (data?.condition_note) {
          setConditionNote(data.condition_note);
        }
      } catch (fetchError: any) {
        setError(fetchError.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
      } finally {
        setIsFetching(false);
      }
    };

    fetchRequest();
  }, [requestId]);

  const detailRows = useMemo(() => buildDetailRows(request?.item_data || {}), [request]);
  const isCompleted = request?.status === 'COMPLETED';
  const isCancelled = request?.status === 'CANCELLED';

  const handleSubmit = async () => {
    if (!requestId) return;

    const price = Number(estimatedPrice.replace(/,/g, ''));
    const condition = Number(conditionScore);

    if (!Number.isFinite(price) || price <= 0) {
      setError('กรุณาระบุราคาจำนำให้ถูกต้อง');
      return;
    }
    if (!Number.isFinite(condition) || condition < 0 || condition > 100) {
      setError('กรุณาระบุสภาพสินค้า 0-100');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await axios.patch('/api/manual-estimate', {
        requestId,
        estimatedPrice: price,
        conditionScore: condition,
        conditionNote,
        adminLineId: profile?.userId,
      });
      setRequest(response.data?.request || null);
      setSuccess('บันทึกการประเมินเรียบร้อยแล้ว');
    } catch (submitError: any) {
      setError(submitError.response?.data?.error || 'ไม่สามารถบันทึกการประเมินได้');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (typeof window !== 'undefined' && window.liff?.isInClient?.()) {
      window.liff.closeWindow();
    }
  };

  if (liffLoading || isFetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-3 text-sm text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (liffError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-red-600">{liffError}</p>
      </div>
    );
  }

  if (!requestId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-gray-600">ไม่พบรหัสคำขอ</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-800">ประเมินราคาแบบแมนนวล</h1>
              <p className="text-xs text-gray-500">Manual estimate request</p>
            </div>
            {request?.status && (
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                request.status === 'COMPLETED'
                  ? 'bg-green-100 text-green-700'
                  : request.status === 'CANCELLED'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-orange-100 text-orange-700'
              }`}>
                {request.status}
              </span>
            )}
          </div>
        </div>

        {request?.image_urls?.length ? (
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">รูปภาพสินค้า</h2>
            <div className="grid grid-cols-2 gap-3">
              {request.image_urls.map((url, index) => (
                <img
                  key={`${url}-${index}`}
                  src={url}
                  alt={`ภาพสินค้า ${index + 1}`}
                  className="h-40 w-full rounded-lg object-cover border border-gray-200"
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">รายละเอียดสินค้า</h2>
          <div className="space-y-2 text-sm text-gray-600">
            {detailRows.length ? detailRows.map((row) => (
              <div key={row.label} className="flex justify-between gap-4">
                <span className="text-gray-500">{row.label}</span>
                <span className="text-gray-800 text-right">{row.value}</span>
              </div>
            )) : (
              <p className="text-gray-400">ไม่มีรายละเอียดเพิ่มเติม</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">บันทึกผลประเมิน</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-gray-600">
              ราคาจำนำ (บาท)
              <input
                type="number"
                value={estimatedPrice}
                onChange={(e) => setEstimatedPrice(e.target.value)}
                disabled={isCompleted || isCancelled}
                className="mt-2 w-full rounded-lg border border-gray-200 p-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
            </label>
            <label className="text-sm text-gray-600">
              สภาพสินค้า (0-100)
              <input
                type="number"
                value={conditionScore}
                onChange={(e) => setConditionScore(e.target.value)}
                disabled={isCompleted || isCancelled}
                className="mt-2 w-full rounded-lg border border-gray-200 p-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
            </label>
          </div>

          <label className="text-sm text-gray-600">
            หมายเหตุการประเมิน
            <textarea
              rows={3}
              value={conditionNote}
              onChange={(e) => setConditionNote(e.target.value)}
              disabled={isCompleted || isCancelled}
              className="mt-2 w-full rounded-lg border border-gray-200 p-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </label>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-200">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-600 border border-green-200">
              {success}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isCompleted || isCancelled}
              className="flex-1 rounded-lg bg-orange-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกผลประเมิน'}
            </button>
            <button
              onClick={handleClose}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700"
            >
              ปิดหน้าต่าง
            </button>
          </div>

          {(isCompleted || isCancelled) && (
            <p className="text-xs text-gray-500">
              {isCompleted ? 'คำขอนี้ถูกประเมินแล้ว' : 'คำขอนี้ถูกยกเลิกแล้ว'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
