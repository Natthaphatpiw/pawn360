'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isInvestorPreviewMode, MOCK_PRINCIPAL_INCREASE_REQUEST_ID } from '@/lib/mock-investment';

// Force dynamic rendering to avoid SSR issues with useSearchParams
export const dynamic = 'force-dynamic';

function InvestorPrincipalIncreaseEntryInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, setRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    if (!resolvedRequestId && isInvestorPreviewMode()) {
      setRequestId(MOCK_PRINCIPAL_INCREASE_REQUEST_ID);
      router.replace(`/investor/principal-increase/${MOCK_PRINCIPAL_INCREASE_REQUEST_ID}`);
      return;
    }

    if (resolvedRequestId) {
      setRequestId(resolvedRequestId);
      router.replace(`/investor/principal-increase/${resolvedRequestId}`);
      return;
    }

    setLoading(false);
  }, [resolvedRequestId, router]);

  if (loading) {
    return (
      <div className="page-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
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
          className="bg-s2 text-white px-6 py-3 rounded-lg"
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
      <div className="theme-liff theme-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    }>
      <InvestorPrincipalIncreaseEntryInner />
    </Suspense>
  );
}
