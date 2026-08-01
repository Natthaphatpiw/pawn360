'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import { clearPawnerEstimateResume, getPawnerEstimateResume } from '@/lib/pawner-estimate-resume';
import { openLiffEntry } from '@/lib/liff/navigation';
import { getLiffAuthorizationHeaders } from '@/lib/liff/auth-header';

export default function EKYCWaitingPage() {
  const router = useRouter();
  const { profile, isLoading: liffLoading, liffObject } = useLiff();
  const [loading, setLoading] = useState(true);
  const [waitingForReview, setWaitingForReview] = useState(false);

  const redirectToPostKycDestination = useCallback((lineId: string) => {
    const resume = getPawnerEstimateResume(lineId);
    if (resume?.returnAfterVerify && resume.draftId) {
      clearPawnerEstimateResume(lineId);
      openLiffEntry({
        liffIdCandidates: [
          process.env.NEXT_PUBLIC_LIFF_ID_PAWN,
        ],
        fallbackPath: `/estimate?draftId=${resume.draftId}`,
        statePath: `/estimate?draftId=${resume.draftId}`,
      });
      return;
    }

    router.push('/register');
  }, [router]);

  useEffect(() => {
    const checkAndRedirect = async () => {
      if (!profile?.userId) {
        router.push('/ekyc');
        return;
      }

      try {
        const headers = getLiffAuthorizationHeaders(liffObject);
        const response = await axios.get('/api/ekyc/status?role=PAWNER', { headers });
        if (!response.data.exists) {
          router.push('/register');
          return;
        }

        const submitted = Boolean(response.data.submissionCompleted);
        const needReview = Boolean(response.data.reviewRequired);

        if (response.data.status === 'VERIFIED') {
          redirectToPostKycDestination(profile.userId);
          return;
        }

        if (response.data.status === 'PENDING' && (needReview || submitted)) {
          setWaitingForReview(true);
          return;
        }

        if (response.data.status === 'PENDING' && response.data.resumeAvailable) {
          const resumed = await axios.post('/api/ekyc/initiate', {}, { headers });
          if (resumed.data.success && resumed.data.url) window.location.href = resumed.data.url;
          return;
        }

        router.push('/ekyc');
      } catch (error) {
        console.error('Seller eKYC waiting status failed', {
          code: axios.isAxiosError(error) ? error.response?.data?.code || 'EKYC_STATUS_FAILED' : 'EKYC_STATUS_FAILED',
        });
        router.push('/ekyc');
      } finally {
        setLoading(false);
      }
    };

    if (!liffLoading) {
      checkAndRedirect();
    }
  }, [profile?.userId, router, liffLoading, liffObject, redirectToPostKycDestination]);

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#C0562F] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!waitingForReview) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white font-sans p-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-md">
        <div className="bg-[#F9EFE6] rounded-3xl p-6 text-center">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-[#C0562F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">รอเจ้าหน้าที่ตรวจ</h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            ระบบได้รับข้อมูลยืนยันตัวตนแล้ว และกำลังรอการตรวจสอบเพิ่มเติมจากเจ้าหน้าที่
          </p>
        </div>
        <button
          onClick={() => router.push('/register')}
          className="w-full mt-4 bg-[#B85C38] hover:bg-[#A04D2D] text-white font-bold py-4 rounded-2xl transition-all"
        >
          กลับหน้าหลัก
        </button>
      </div>
    </div>
  );
}
