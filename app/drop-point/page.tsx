'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { ChevronLeft, Package, Clock } from 'lucide-react';
import ImageCarousel from '@/components/ImageCarousel';

type DropPoint = {
  drop_point_id: string;
  drop_point_name: string;
  drop_point_code?: string;
};

type ContractItem = {
  brand?: string;
  model?: string;
  item_type?: string;
  image_urls?: string[];
};

type ContractListItem = {
  contract_id: string;
  contract_number: string;
  item_delivery_status: string;
  displayStatus: string;
  displayDate?: string;
  statusGroup?: 'INCOMING' | 'ARRIVED' | 'UNKNOWN';
  items?: ContractItem;
};

type ContractDetail = {
  contract_id: string;
  contract_number: string;
  item_delivery_status: string;
  item_received_at?: string;
  item_verified_at?: string;
  created_at?: string;
  updated_at?: string;
  bag_number?: string | null;
  bag_assigned_at?: string | null;
  items?: {
    item_id?: string;
    brand?: string;
    model?: string;
    capacity?: string | null;
    image_urls?: string[];
    item_condition?: number;
    notes?: string | null;
    defects?: string | null;
  };
  pawners?: {
    firstname?: string;
    lastname?: string;
    phone_number?: string;
  };
  drop_points?: {
    drop_point_name?: string;
    phone_number?: string;
  };
};

function formatDate(dateString?: string) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('th-TH');
}

function DropPointContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading } = useLiff();

  const [loading, setLoading] = useState(true);
  const [dropPoint, setDropPoint] = useState<DropPoint | null>(null);
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [contractDetail, setContractDetail] = useState<ContractDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  let contractId = searchParams.get('contractId');
  if (!contractId) {
    const liffState = searchParams.get('liff.state');
    if (liffState) {
      const match = liffState.match(/contractId=([^&]+)/);
      if (match) contractId = match[1];
    }
  }

  useEffect(() => {
    if (liffLoading || !profile?.userId) return;
    if (contractId) {
      fetchContractDetail(profile.userId, contractId);
    } else {
      fetchContracts(profile.userId);
    }
  }, [liffLoading, profile?.userId, contractId]);

  const fetchContracts = async (lineId: string) => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/drop-points/contracts/${lineId}`);
      setDropPoint(response.data.dropPoint);
      setContracts(response.data.contracts || []);
    } catch (fetchError: any) {
      console.error('Error fetching drop point contracts:', fetchError);
      setError(fetchError.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const fetchContractDetail = async (lineId: string, targetContractId: string) => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/drop-points/contracts/detail/${targetContractId}?lineId=${lineId}`);
      setContractDetail(response.data.contract);
    } catch (fetchError: any) {
      console.error('Error fetching contract detail:', fetchError);
      setError(fetchError.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const incomingContracts = useMemo(
    () => contracts.filter((contract) => contract.statusGroup === 'INCOMING'),
    [contracts]
  );

  const arrivedContracts = useMemo(
    () => contracts.filter((contract) => contract.statusGroup === 'ARRIVED'),
    [contracts]
  );

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

  if (contractId && !contractDetail) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">ไม่พบข้อมูลสัญญา</p>
        </div>
      </div>
    );
  }

  if (contractId && contractDetail) {
    const statusText = ['RECEIVED_AT_DROP_POINT', 'VERIFIED'].includes(contractDetail.item_delivery_status)
      ? 'ถึงแล้ว'
      : ['PAWNER_CONFIRMED', 'IN_TRANSIT'].includes(contractDetail.item_delivery_status)
        ? 'กำลังมา'
        : 'ไม่ทราบสถานะ';

    const verifyLiffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_VERIFY || '2008651088-m9yMlA7Q';
    const verifyUrl = `https://liff.line.me/${verifyLiffId}?contractId=${encodeURIComponent(contractDetail.contract_id)}`;

    return (
      <div className="min-h-screen bg-[#F5F7FA] font-sans px-4 py-6">
        <button
          onClick={() => router.push('/drop-point')}
          className="flex items-center text-[#365314] mb-4"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-medium">กลับ</span>
        </button>

        <div className="bg-white rounded-3xl p-5 shadow-sm mb-4">
          <h1 className="text-lg font-bold text-gray-800 mb-2">
            {contractDetail.items?.brand} {contractDetail.items?.model}
          </h1>
          <div className="text-sm text-gray-500">สถานะ: {statusText}</div>
          <div className="text-sm text-gray-500">หมายเลขสัญญา: {contractDetail.contract_number}</div>
          <div className="text-sm text-gray-500">
            วันส่งมา: {formatDate(contractDetail.item_received_at || contractDetail.item_verified_at || contractDetail.updated_at || contractDetail.created_at)}
          </div>
          {contractDetail.bag_number && (
            <div className="text-sm text-gray-700 mt-2">
              หมายเลขถุงสินค้า: <span className="font-bold">{contractDetail.bag_number}</span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-sm mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-3">ข้อมูลลูกค้า</h2>
          <div className="text-sm text-gray-600">
            {contractDetail.pawners?.firstname} {contractDetail.pawners?.lastname}
          </div>
          <div className="text-sm text-gray-600">{contractDetail.pawners?.phone_number || '-'}</div>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-sm mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-3">รูปถ่ายสินค้า</h2>
          <ImageCarousel
            images={contractDetail.items?.image_urls}
            className="no-scrollbar"
            itemClassName="w-36 aspect-square rounded-2xl overflow-hidden bg-gray-100"
            emptyLabel="No Image"
            emptyClassName="w-full text-center text-gray-400 text-xs"
          />
        </div>

        {contractDetail.item_delivery_status !== 'VERIFIED' && (
          <button
            onClick={() => {
              window.location.href = verifyUrl;
            }}
            className="w-full bg-[#365314] hover:bg-[#2d4610] text-white rounded-2xl py-4 text-base font-bold shadow-sm transition-colors"
          >
            ตรวจสอบสินค้า
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] font-sans px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">รายการสินค้ารับฝาก</h1>
        <p className="text-sm text-gray-500">{dropPoint?.drop_point_name || 'Drop Point'}</p>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => {
            const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_RETURN || '2008651088-fsjSpdo9';
            window.location.href = `https://liff.line.me/${liffId}`;
          }}
          className="flex-1 bg-white border border-gray-200 rounded-2xl py-2 text-sm font-semibold text-[#365314]"
        >
          รายการส่งคืน
        </button>
        <button
          onClick={() => {
            const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_HISTORY || '2008651088-97dWJEQB';
            window.location.href = `https://liff.line.me/${liffId}`;
          }}
          className="flex-1 bg-white border border-gray-200 rounded-2xl py-2 text-sm font-semibold text-gray-600"
        >
          ประวัติ
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-[#F59E0B]" />
            <h2 className="text-sm font-bold text-gray-700">กำลังมา</h2>
          </div>
          {incomingContracts.length === 0 ? (
            <div className="bg-white rounded-2xl p-4 text-sm text-gray-500 text-center">
              ไม่มีรายการกำลังมา
            </div>
          ) : (
            incomingContracts.map((contract) => (
              <button
                key={contract.contract_id}
                onClick={() => router.push(`/drop-point?contractId=${contract.contract_id}`)}
                className="w-full bg-white rounded-2xl p-4 mb-3 text-left shadow-sm"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-base font-bold text-gray-800">
                      {contract.items?.brand} {contract.items?.model}
                    </div>
                    <div className="text-xs text-gray-500">
                      วันที่ส่งมา: {formatDate(contract.displayDate)}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#F59E0B] bg-[#FEF3C7] px-3 py-1 rounded-full">
                    กำลังมา
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-[#22C55E]" />
            <h2 className="text-sm font-bold text-gray-700">ถึงแล้ว</h2>
          </div>
          {arrivedContracts.length === 0 ? (
            <div className="bg-white rounded-2xl p-4 text-sm text-gray-500 text-center">
              ไม่มีรายการถึงแล้ว
            </div>
          ) : (
            arrivedContracts.map((contract) => (
              <button
                key={contract.contract_id}
                onClick={() => router.push(`/drop-point?contractId=${contract.contract_id}`)}
                className="w-full bg-white rounded-2xl p-4 mb-3 text-left shadow-sm"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-base font-bold text-gray-800">
                      {contract.items?.brand} {contract.items?.model}
                    </div>
                    <div className="text-xs text-gray-500">
                      วันที่ส่งมา: {formatDate(contract.displayDate)}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#22C55E] bg-[#DCFCE7] px-3 py-1 rounded-full">
                    ถึงแล้ว
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function DropPointPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#365314] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <DropPointContent />
    </Suspense>
  );
}
