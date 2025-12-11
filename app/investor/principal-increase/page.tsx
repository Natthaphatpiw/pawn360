'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function InvestorPrincipalIncreaseRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = searchParams.get('requestId');

  useEffect(() => {
    if (requestId) {
      // Redirect to dynamic route
      router.replace(`/investor/principal-increase/${requestId}`);
    } else {
      // No requestId provided
      router.replace('/investor/contracts');
    }
  }, [requestId, router]);

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A]"></div>
    </div>
  );
}

export default function InvestorPrincipalIncreasePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F0F4F8] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A]"></div>
        </div>
      }
    >
      <InvestorPrincipalIncreaseRedirect />
    </Suspense>
  );
}