'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Detect if accessed via LIFF and redirect based on path
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const isLiff = urlParams.has('liff.state') ||
                     window.navigator.userAgent.includes('LIFF') ||
                     window.location.hostname === 'liff.line.me';

      if (isLiff) {
        // For LIFF access, redirect based on intended path
        const path = window.location.pathname;

        // If accessing root with LIFF, redirect to register
        if (path === '/' || path === '') {
          router.replace('/register');
          return;
        }

        // If accessing specific paths via LIFF, let them load normally
        // Next.js will handle the routing
      }
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center p-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">Pawn360</h1>
        <p className="text-lg text-gray-600 mb-8">ระบบจำนำ P2P</p>

        <div className="space-y-4 max-w-sm mx-auto">
          <button
            onClick={() => router.push('/register')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-sm"
          >
            เริ่มใช้งาน
          </button>

          <button
            onClick={() => router.push('/pawner/list-item')}
            className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-sm"
          >
            รายการสัญญา
          </button>

          <button
            onClick={() => router.push('/estimate')}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-sm"
          >
            ประเมินราคาสินค้า
          </button>
        </div>

        <div className="mt-8 text-sm text-gray-500">
          <p>เข้าสู่ระบบผ่าน LINE LIFF</p>
        </div>
      </div>
    </div>
  );
}
