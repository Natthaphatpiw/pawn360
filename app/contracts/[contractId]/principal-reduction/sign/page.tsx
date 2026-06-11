'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle, TrendingDown } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';
import { getMockPrincipalReductionRequest, isPreviewMode } from '../../_lib/preview';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signatureData: string) => void;
  title: string;
}

function SignatureModal({ isOpen, onClose, onSave, title }: SignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      clearCanvas();
    }
  }, [isOpen]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const { x, y } = getCoordinates(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const { x, y } = getCoordinates(e);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    startDrawing(e);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    draw(e);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      onSave(canvas.toDataURL('image/png'));
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/35 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-white rounded-xl max-w-sm w-full overflow-hidden">
        <div className="p-4 border-b border-primary-border bg-primary-soft">
          <h3 className="text-lg font-bold text-center text-foreground">{title}</h3>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground-muted">เซ็นลายเซ็นของคุณ</label>
            <div className="border-2 border-dashed border-primary rounded-xl bg-background-white overflow-hidden">
              <canvas
                ref={canvasRef}
                width={300}
                height={150}
                className="w-full h-40 cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={stopDrawing}
                style={{ touchAction: 'none' }}
              />
            </div>
            <p className="text-xs text-foreground-subtle mt-2 text-center">ใช้นิ้วหรือเมาส์วาดลายเซ็น</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={clearCanvas}
              className="flex-1 py-3 px-4 bg-background-white text-primary rounded-full hover:bg-gray-200 transition-colors font-medium border border-primary"
            >
              ล้าง
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-primary-soft text-primary rounded-full hover:bg-gray-200 transition-colors font-medium"
            >
              ยกเลิก
            </button>
            <button
              onClick={saveSignature}
              className="flex-1 py-3 px-4 bg-primary text-white rounded-full hover:bg-primary/80 transition-colors font-medium"
            >
              บันทึก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrincipalReductionSignPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const requestId = searchParams.get('requestId');
  const previewMode = isPreviewMode(searchParams);
  const { profile } = useLiff();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const pendingActionRef = useRef<((token: string) => void) | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (previewMode) {
      const mockRequest = getMockPrincipalReductionRequest(requestId || `preview-reduction-${contractId}`, contractId);
      setRequestDetails(mockRequest);
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
        const request = response.data.request;
        setRequestDetails(request);
        if (request.pawner_signature_url || request.signature_url) {
          setSignature(request.pawner_signature_url || request.signature_url);
        }
      }
    } catch (error) {
      console.error('Error fetching request:', error);
      setError('ไม่พบข้อมูลคำขอ');
    } finally {
      setLoading(false);
    }
  };

  const submitWithPin = async (pinToken: string) => {
    const effectiveSignature = signature || requestDetails?.pawner_signature_url || requestDetails?.signature_url;
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
      let signatureUrl: string | undefined;
      if (signature?.startsWith('data:')) {
        const signatureBlob = await fetch(signature).then((r) => r.blob());
        const formData = new FormData();
        formData.append('file', signatureBlob, 'signature.png');
        formData.append('folder', 'signatures');

        const uploadRes = await axios.post('/api/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (!uploadRes.data.url) {
          throw new Error('Failed to upload signature');
        }
        signatureUrl = uploadRes.data.url;
      }

      // Complete the action
      const response = await axios.post('/api/contract-actions/complete', {
        requestId,
        signatureUrl,
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
    const effectiveSignature = signature || requestDetails?.pawner_signature_url || requestDetails?.signature_url;

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
    if (loading || showSuccess || !requestDetails || startedRef.current) {
      return;
    }

    const effectiveTermsAccepted = Boolean(requestDetails?.terms_accepted);
    const effectiveSignature = signature || requestDetails?.pawner_signature_url || requestDetails?.signature_url;

    if (!effectiveTermsAccepted || !effectiveSignature) {
      return;
    }

    if (!previewMode && !profile?.userId) {
      return;
    }

    startedRef.current = true;
    void startAutoComplete();
  }, [loading, requestDetails, showSuccess, previewMode, profile?.userId, signature]);

  const handleGoToContracts = () => {
    router.push('/contracts');
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

          <h1 className="text-xl font-bold text-foreground mb-2">ลดเงินต้นสำเร็จ</h1>
          <p className="text-foreground-subtle text-sm mb-6">
            เงินต้นของสัญญาได้รับการปรับลดเรียบร้อยแล้ว
          </p>

          {requestDetails?.contract && (
            <div className="bg-primary-soft rounded-lg p-4 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">เลขที่สัญญา:</span>
                  <span className="font-bold">{requestDetails.contract.contract_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">เงินต้นใหม่:</span>
                  <span className="font-bold text-primary">
                    {(requestDetails.principal_after_reduction || requestDetails.new_principal_amount)?.toLocaleString()} บาท
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-subtle">ลดไป:</span>
                  <span className="font-bold text-green-600">
                    {requestDetails.reduction_amount?.toLocaleString()} บาท
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
  const effectiveSignature = signature || requestDetails?.pawner_signature_url || requestDetails?.signature_url;

  return (
    <div className="min-h-screen bg-background-white font-sans flex flex-col items-center justify-center p-6">
      <SignatureModal
        isOpen={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onSave={(sig) => {
          setSignature(sig);
          setError(null);
        }}
        title="เซ็นลายเซ็น"
      />

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
          <TrendingDown className="w-16 h-16 text-success" />
        </div>

        <h1 className="text-xl font-bold text-foreground mb-2">กำลังยืนยันการลดเงินต้น</h1>
        <p className="text-foreground-subtle text-sm mb-6">
          ระบบกำลังดำเนินการลดเงินต้นให้คุณอัตโนมัติ
        </p>

        {requestDetails?.contract && (
          <div className="bg-primary-soft rounded-lg p-4 mb-6 text-left">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-foreground-subtle">เลขที่สัญญา:</span>
                <span className="font-bold">{requestDetails.contract.contract_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-subtle">เงินต้นใหม่:</span>
                <span className="font-bold text-primary">
                  {(requestDetails.principal_after_reduction || requestDetails.new_principal_amount)?.toLocaleString()} บาท
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-subtle">ลดไป:</span>
                <span className="font-bold text-green-600">
                  {requestDetails.reduction_amount?.toLocaleString()} บาท
                </span>
              </div>
            </div>
          </div>
        )}

        {submitting && (
          <div className="flex items-center justify-center py-2">
            <div className="dot-bricks" />
          </div>
        )}

        {!effectiveSignature && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left">
            <p className="text-sm text-amber-800">
              คำขอนี้ยังไม่มีลายเซ็นที่บันทึกไว้ กรุณาเซ็นยืนยันหนึ่งครั้งเพื่อให้ระบบดำเนินการต่อ
            </p>
            <button
              onClick={() => setShowSignatureModal(true)}
              className="mt-3 w-full rounded-full bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary/80"
            >
              เซ็นยืนยันเพื่อดำเนินการต่อ
            </button>
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
