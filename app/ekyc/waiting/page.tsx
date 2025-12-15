'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

// This page now just redirects to the eKYC URL or main eKYC page
// No more 5-minute waiting timer
export default function EKYCWaitingPage() {
  const router = useRouter();
  const { profile, isLoading: liffLoading } = useLiff();

  useEffect(() => {
    const checkAndRedirect = async () => {
      if (!profile?.userId) {
        router.push('/ekyc');
        return;
      }

      try {
        const response = await axios.get(`/api/pawners/check?lineId=${profile.userId}`);
        if (response.data.exists) {
          const pawner = response.data.pawner;

          if (pawner.kyc_status === 'VERIFIED') {
            // Already verified - go to register page
            router.push('/register');
          } else if (pawner.kyc_status === 'PENDING' && pawner.ekyc_url) {
            // Has eKYC URL - redirect directly to UpPass to continue
            window.location.href = pawner.ekyc_url;
          } else {
            // No URL or rejected - go to eKYC page to start fresh
            router.push('/ekyc');
          }
        } else {
          router.push('/register');
        }
      } catch (error) {
        console.error('Error:', error);
        router.push('/ekyc');
      }
    };

    if (!liffLoading) {
      checkAndRedirect();
    }
  }, [profile?.userId, router, liffLoading]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#C0562F] mx-auto"></div>
        <p className="mt-4 text-gray-600">กำลังโหลด...</p>
      </div>
    </div>
  );
}
