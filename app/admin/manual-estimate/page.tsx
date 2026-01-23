import { Suspense } from 'react';
import ManualEstimateClient from './manual-estimate-client';

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div className="text-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600 mx-auto"></div>
      <p className="mt-3 text-sm text-gray-600">กำลังโหลดข้อมูล...</p>
    </div>
  </div>
);

export default function ManualEstimatePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ManualEstimateClient />
    </Suspense>
  );
}
