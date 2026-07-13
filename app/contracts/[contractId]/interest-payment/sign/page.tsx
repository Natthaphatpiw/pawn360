'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';
import { getMockInterestPaymentRequest, isPreviewMode, withPreview } from '../../_lib/preview';

export default function InterestPaymentSignPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const requestId = searchParams.get('requestId');
  const previewMode = isPreviewMode(searchParams);
  const slipStatus = searchParams.get('slipStatus');
  const expectedAmount = Number(searchParams.get('expectedAmount') || 0);
  const remainingAttempts = Number(searchParams.get('remainingAttempts') || 0);
  const { profile } = useLiff();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const pendingActionRef = useRef<((token: string) => void) | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (previewMode) {
      setRequestDetails(getMockInterestPaymentRequest(requestId || `preview-interest-${contractId}`, contractId));
      setLoading(false);
    } else if (requestId) {
      fetchRequestDetails();
    }
  }, [requestId, previewMode, contractId]);

  const fetchRequestDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/contract-actions/${requestId}`);
      if (response.data.success) {
        setRequestDetails(response.data.request);
      }
    } catch (error) {
      console.error('Error fetching request:', error);
      setError('ไม่พบข้อมูลคำขอ');
    } finally {
      setLoading(false);
    }
  };

  const submitWithPin = async (pinToken: string) => {
    const effectiveSignature = requestDetails?.pawner_signature_url || requestDetails?.signature_url;
    if (!effectiveSignature || !requestId) {
      return;
    }

    if (previewMode) {
      setSubmitting(true);
      setError(null);
      setTimeout(() => {
        setShowSuccess(true);
        setSubmitting(false);
      }, 400);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Complete the action
      const response = await axios.post('/api/contract-actions/complete', {
        requestId,
        pawnerLineId: profile?.userId,
        pinToken,
      });

      if (response.data.success) {
        setShowSuccess(true);
      } else {
        throw new Error(response.data.error || 'Failed to complete action');
      }
    } catch (error: any) {
      console.error('Error completing action:', error);
      setError(error.response?.data?.error || error.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  const startAutoComplete = async () => {
    const effectiveTermsAccepted = Boolean(requestDetails?.terms_accepted);
    const effectiveSignature = requestDetails?.pawner_signature_url || requestDetails?.signature_url;

    if (previewMode) {
      if (!effectiveTermsAccepted || !effectiveSignature) {
        return;
      }
      await submitWithPin('preview-pin');
      return;
    }

    if (!profile?.userId) {
      setError('กรุณาเข้าสู่ระบบ LINE');
      return;
    }

    const session = getPinSession('PAWNER', profile.userId);
    if (session?.token) {
      await submitWithPin(session.token);
      return;
    }

    pendingActionRef.current = async (token: string) => {
      await submitWithPin(token);
    };
    setPinModalOpen(true);
  };

  useEffect(() => {
    if (slipStatus === 'invalid' || loading || showSuccess || !requestDetails || startedRef.current) {
      return;
    }

    if (!previewMode && !profile?.userId) {
      return;
    }

    startedRef.current = true;
    void startAutoComplete();
  }, [slipStatus, loading, requestDetails, showSuccess, previewMode, profile?.userId]);

  const handleGoToContracts = () => {
    router.push('/contracts');
  };

  const handleBackToUpload = () => {
    const nextPath = `/contracts/${contractId}/interest-payment/upload`;
    router.push(previewMode ? withPreview(nextPath, 'requestId', requestId || `preview-interest-${contractId}`) : `${nextPath}?requestId=${requestId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-white font-sans flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-background-white font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-background-white rounded-xl p-4 text-center max-w-sm w-full">
          <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-24 h-24 text-green-500" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2">ต่อดอกเบี้ยสำเร็จ</h1>
          <p className="text-foreground-subtle text-sm mb-6">
            สัญญาของคุณได้รับการต่ออายุเรียบร้อยแล้ว
          </p>

          {requestDetails?.contract && (
            <div className="bg-primary-soft rounded-lg p-4 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">เลขที่สัญญา:</span>
                  <span className="font-bold">{requestDetails.contract.contract_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">วันหมดอายุใหม่:</span>
                  <span className="font-bold text-primary">
                    {requestDetails.new_end_date ? new Date(requestDetails.new_end_date).toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : '-'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleGoToContracts}
            className="w-full btn-transition btn-sheen bg-[image:var(--background-image-grad-primary)] hover:bg-primary/80 text-white rounded-full py-4 font-medium transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  const effectiveTermsAccepted = Boolean(requestDetails?.terms_accepted);
  const effectiveSignature = requestDetails?.pawner_signature_url || requestDetails?.signature_url;

    if (slipStatus === 'invalid') {
      return (
        <div className="min-h-screen bg-background-white font-sans flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm bg-background rounded-xl p-4">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-red-700 text-sm mb-1">ยอดไม่ตรง</h3>
                  <p className="text-xs text-red-600 mb-2">
                    กรุณาโอนใหม่เต็มจำนวน {expectedAmount.toLocaleString()} บาท
                  </p>
                  <p className="text-xs text-red-600">
                    หากมีปัญหา กรุณาติดต่อฝ่าย Support โทร 0626092941
                  </p>
                  <p className="text-xs text-red-500 mt-2">
                    เหลือโอกาสอีก {remainingAttempts} ครั้ง
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleBackToUpload}
              className="w-full bg-primary hover:bg-primary/80 text-white rounded-full py-4 font-medium transition-colors"
            >
              กลับไปอัปโหลดสลิปอีกครั้ง
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-white font-sans flex flex-col items-center justify-center p-6">
      <div className="bg-background-white rounded-xl p-4 text-center max-w-sm w-full">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        <div className="mx-auto mb-5 flex h-32 w-32 items-center justify-center rounded-full bg-success/10 text-3xl text-success">
          <CheckCircle className="w-24 h-24 text-success" />
        </div>

        <h1 className="text-xl font-bold text-foreground mb-2">กำลังยืนยันการต่อดอกเบี้ย</h1>
        <p className="text-foreground-subtle text-sm mb-6">
          ระบบกำลังดำเนินการต่อดอกเบี้ยให้คุณอัตโนมัติ
        </p>

        {requestDetails?.contract && (
          <div className="bg-primary-soft rounded-lg p-4 mb-6 text-left">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-foreground-subtle">เลขที่สัญญา:</span>
                <span className="font-bold">{requestDetails.contract.contract_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-subtle">วันหมดอายุใหม่:</span>
                <span className="font-bold text-primary">
                  {requestDetails.new_end_date ? new Date(requestDetails.new_end_date).toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  }) : '-'}
                </span>
              </div>
            </div>
          </div>
        )}

        {submitting && (
          <div className="flex items-center justify-center py-2 mb-3">
            <div className="dot-bricks" />
          </div>
        )}

        {(!effectiveTermsAccepted || !effectiveSignature || error) && (
          <button
            onClick={handleGoToContracts}
            className="w-full bg-background-white text-primary border border-primary rounded-full py-4 font-medium transition-colors hover:bg-primary-soft"
          >
            กลับหน้าสัญญา
          </button>
        )}
      </div>

      <PinModal
        open={pinModalOpen}
        role="PAWNER"
        lineId={profile?.userId || ''}
        onClose={() => setPinModalOpen(false)}
        onVerified={(token) => {
          setPinModalOpen(false);
          pendingActionRef.current?.(token);
          pendingActionRef.current = null;
        }}
      />
    </div>
  );
}
