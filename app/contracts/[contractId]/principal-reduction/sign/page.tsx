'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ChevronLeft, CheckCircle, AlertTriangle, TrendingDown } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';

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
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }
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
      const dataURL = canvas.toDataURL('image/png');
      onSave(dataURL);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-[#FFF8F5]">
          <h3 className="text-lg font-bold text-center text-gray-800">{title}</h3>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">เซ็นลายเซ็นของคุณ</label>
            <div className="border-2 border-dashed border-[#B85C38] rounded-xl bg-white overflow-hidden">
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
            <p className="text-xs text-gray-500 mt-2 text-center">ใช้นิ้วหรือเมาส์วาดลายเซ็น</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={clearCanvas}
              className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
            >
              ล้าง
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
            >
              ยกเลิก
            </button>
            <button
              onClick={saveSignature}
              className="flex-1 py-3 px-4 bg-[#B85C38] text-white rounded-xl hover:bg-[#A04D2D] transition-colors font-medium"
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
  const { profile } = useLiff();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (requestId) {
      fetchRequestDetails();
    }
  }, [requestId]);

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

  const handleSubmit = async () => {
    if (!termsAccepted || !signature || !requestId) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Upload signature to S3
      const signatureBlob = await fetch(signature).then(r => r.blob());
      const formData = new FormData();
      formData.append('file', signatureBlob, 'signature.png');
      formData.append('folder', 'signatures');

      const uploadRes = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!uploadRes.data.url) {
        throw new Error('Failed to upload signature');
      }

      // Complete the action
      const response = await axios.post('/api/contract-actions/complete', {
        requestId,
        signatureUrl: uploadRes.data.url,
        pawnerLineId: profile?.userId,
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

  const handleGoToContracts = () => {
    router.push('/contracts');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#B85C38]"></div>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-2">ลดเงินต้นสำเร็จ</h1>
          <p className="text-gray-500 text-sm mb-6">
            เงินต้นของสัญญาได้รับการปรับลดเรียบร้อยแล้ว
          </p>

          {requestDetails?.contract && (
            <div className="bg-[#FFF8F5] rounded-2xl p-4 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">เลขที่สัญญา:</span>
                  <span className="font-bold">{requestDetails.contract.contract_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">เงินต้นใหม่:</span>
                  <span className="font-bold text-[#B85C38]">
                    {(requestDetails.principal_after_reduction || requestDetails.new_principal_amount)?.toLocaleString()} บาท
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">ลดไป:</span>
                  <span className="font-bold text-green-600">
                    {requestDetails.reduction_amount?.toLocaleString()} บาท
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleGoToContracts}
            className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  const contract = requestDetails?.contract;
  const item = contract?.items;

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col">
      {/* Signature Modal */}
      <SignatureModal
        isOpen={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onSave={(sig) => setSignature(sig)}
        title="เซ็นลายเซ็น"
      />

      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center shadow-sm sticky top-0 z-10">
        <ChevronLeft
          className="w-6 h-6 text-gray-800 cursor-pointer"
          onClick={() => router.back()}
        />
        <div className="flex-1 text-center">
          <h1 className="font-bold text-lg text-gray-800">เซ็นสัญญาลดเงินต้น</h1>
          <p className="text-xs text-gray-400">Sign Reduction Contract</p>
        </div>
        <div className="w-6"></div>
      </div>

      <div className="flex-1 flex flex-col items-center p-6 pb-32">
        {error && (
          <div className="w-full max-w-sm bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Contract Summary */}
        {requestDetails && contract && (
          <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">รายละเอียดการลดเงินต้น</h3>
                <p className="text-xs text-gray-500">{item?.brand} {item?.model}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">เลขที่สัญญา:</span>
                <span className="font-bold">{contract.contract_number}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-600">เงินต้นเดิม:</span>
                <span className="font-bold">{(contract.current_principal_amount || contract.loan_principal_amount)?.toLocaleString()} บาท</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-600">จำนวนที่ลด:</span>
                <span className="font-bold text-green-600">- {requestDetails.reduction_amount?.toLocaleString()} บาท</span>
              </div>

              <div className="border-t pt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">เงินต้นใหม่:</span>
                  <span className="font-bold text-[#B85C38] text-lg">
                    {(requestDetails.principal_after_reduction || requestDetails.new_principal_amount)?.toLocaleString()} บาท
                  </span>
                </div>
              </div>

              <div className="bg-green-50 rounded-xl p-3 mt-2">
                <p className="text-xs text-green-700">
                  <span className="font-bold">ประหยัดดอกเบี้ย/เดือน:</span>{' '}
                  {((requestDetails.reduction_amount || 0) * (contract.interest_rate || 0) / 100).toLocaleString()} บาท
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Terms and Conditions */}
        <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3">ข้อตกลงและเงื่อนไข</h3>

          <div className="bg-[#FFF8F5] rounded-xl p-3 mb-4 text-xs text-gray-600 space-y-2 max-h-48 overflow-y-auto">
            <p className="font-bold text-gray-800">สัญญาลดเงินต้น</p>
            <p>
              ข้าพเจ้ายืนยันว่าได้ชำระเงินตามจำนวนที่กำหนดเรียบร้อยแล้ว
              และยินยอมให้ปรับลดเงินต้นตามเงื่อนไขดังนี้:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>เงินต้นจะลดลงตามจำนวนที่ระบุ</li>
              <li>ดอกเบี้ยจะคำนวณใหม่ตามเงินต้นที่ลดลง</li>
              <li>วันครบกำหนดสัญญาคงเดิม</li>
              <li>อัตราดอกเบี้ยคงเดิมตามสัญญาเดิม</li>
            </ul>
            <p className="font-bold text-red-600 mt-2">
              คำเตือน: การลดเงินต้นไม่สามารถยกเลิกได้หลังจากยืนยัน
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="w-5 h-5 mt-0.5 rounded border-gray-300 text-[#B85C38] focus:ring-[#B85C38]"
            />
            <span className="text-sm text-gray-700">
              ข้าพเจ้าได้อ่านและยอมรับข้อตกลงและเงื่อนไขทั้งหมดแล้ว
            </span>
          </label>
        </div>

        {/* Signature Section */}
        <div className="w-full max-w-sm bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3">ลายเซ็นผู้จำนำ</h3>

          {signature ? (
            <div className="space-y-3">
              <div className="border-2 border-[#B85C38] rounded-xl p-2 bg-white">
                <img
                  src={signature}
                  alt="Signature"
                  className="w-full h-32 object-contain"
                />
              </div>
              <button
                onClick={() => setShowSignatureModal(true)}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                เซ็นใหม่
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSignatureModal(true)}
              className="w-full py-4 border-2 border-dashed border-[#B85C38] rounded-xl text-[#B85C38] font-medium hover:bg-[#FFF8F5] transition-colors"
            >
              แตะเพื่อเซ็นลายเซ็น
            </button>
          )}
        </div>
      </div>

      {/* Fixed Bottom Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F2]">
        <div className="max-w-sm mx-auto">
          <button
            onClick={handleSubmit}
            disabled={!termsAccepted || !signature || submitting}
            className={`w-full py-4 rounded-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-[0.98] ${
              termsAccepted && signature && !submitting
                ? 'bg-[#B85C38] hover:bg-[#A04D2D] text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mb-1"></div>
                <span className="text-xs">กำลังดำเนินการ...</span>
              </>
            ) : (
              <>
                <span className="text-lg font-bold">ยืนยันลดเงินต้น</span>
                <span className="text-xs font-light opacity-80">Confirm Reduction</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
