'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Force dynamic rendering to avoid SSR issues with useSearchParams
export const dynamic = 'force-dynamic';

function InvestorPrincipalIncreaseEntryInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [requestId, setRequestId] = useState<string | null>(null);

  const resolvedRequestId = useMemo(() => {
    const direct = searchParams.get('requestId');
    if (direct) return direct;

    const liffState = searchParams.get('liff.state');
    if (!liffState) return null;

    const decoded = decodeURIComponent(liffState);
    const match = decoded.match(/requestId=([^&]+)/);
    if (match) return match[1];
    return null;
  }, [searchParams]);

  useEffect(() => {
    if (resolvedRequestId) {
      setRequestId(resolvedRequestId);
      router.replace(`/investor/principal-increase/${resolvedRequestId}`);
    }
  }, [resolvedRequestId, router]);

  if (requestId) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังเปิดรายละเอียด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="text-red-600 mb-4">ไม่พบคำขอเพิ่มเงินต้น</div>
        <div className="text-sm text-gray-500 mb-4">
          กรุณาเปิดลิงก์จากข้อความ LINE อีกครั้ง
        </div>
        <button
          onClick={() => router.back()}
          className="bg-[#1E3A8A] text-white px-6 py-3 rounded-lg"
        >
          กลับ
        </button>
      </div>
    </div>
  );
}

export default function InvestorPrincipalIncreaseEntry() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <InvestorPrincipalIncreaseEntryInner />
    </Suspense>
  );
}
