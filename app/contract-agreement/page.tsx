'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import SignatureCanvas from 'react-signature-canvas';
import axios from 'axios';

function ContractAgreementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();

  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signatureRef = useRef<SignatureCanvas>(null);

  const loanRequestId = searchParams.get('loanRequestId');
  const itemId = searchParams.get('itemId');

  useEffect(() => {
    if (!loanRequestId || !itemId) {
      router.push('/estimate');
    }
  }, [loanRequestId, itemId, router]);

  const handleSubmit = async () => {
    console.log('🚀 Contract agreement submit initiated');
    console.log('📊 Current state:', { accepted, loanRequestId, itemId, profile: profile?.userId });

    if (!accepted) {
      setError('กรุณายอมรับเงื่อนไขและข้อตกลง');
      return;
    }

    if (!loanRequestId || !itemId) {
      setError('ข้อมูลคำขอไม่ครบถ้วน กรุณาลองใหม่อีกครั้ง');
      return;
    }

    if (!profile?.userId) {
      setError('ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
      return;
    }

    if (signatureRef.current?.isEmpty()) {
      setError('กรุณาเซ็นลายเซ็นในช่องที่กำหนด');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Get signature as data URL
      const signatureDataURL = signatureRef.current?.toDataURL();

      if (!signatureDataURL || signatureDataURL === 'data:,') {
        setError('ลายเซ็นไม่ถูกต้อง กรุณาเซ็นใหม่อีกครั้ง');
        return;
      }

      console.log('📝 Contract agreement submit data:', {
        loanRequestId,
        itemId,
        accepted,
        signatureLength: signatureDataURL?.length,
        lineId: profile?.userId,
        hasProfile: !!profile,
        profileKeys: profile ? Object.keys(profile) : null
      });

      const response = await axios.post('/api/contracts/create', {
        loanRequestId,
        itemId,
        accepted,
        signature: signatureDataURL,
        lineId: profile?.userId
      });

      if (response.data.success) {
        // Redirect to pawner contract details page
        router.push(`/pawner/contract/${response.data.contractId}`);
      }
    } catch (error: any) {
      console.error('Error submitting agreement:', error);
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกสัญญา');
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearSignature = () => {
    signatureRef.current?.clear();
  };

  if (liffLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C0562F] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลดระบบ LINE...</p>
        </div>
      </div>
    );
  }

  if (liffError) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">เกิดข้อผิดพลาดในการเชื่อมต่อ LINE: {liffError}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-[#C0562F] text-white px-6 py-3 rounded-lg"
          >
            ลองใหม่
          </button>
        </div>
      </div>
    );
  }

  if (!loanRequestId || !itemId) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">ข้อมูลคำขอไม่ครบถ้วน</p>
          <button
            onClick={() => router.push('/estimate')}
            className="bg-[#C0562F] text-white px-6 py-3 rounded-lg"
          >
            กลับไปเริ่มใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans p-4 pb-8">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">ข้อตกลงและเงื่อนไข</h1>
          <p className="text-sm text-gray-500">Terms & Conditions</p>
        </div>

        {/* Legal Content */}
        <div className="bg-gray-50 rounded-xl p-6 mb-6 max-h-96 overflow-y-auto text-sm text-gray-700 leading-relaxed">
          <h2 className="font-bold text-lg mb-4 text-gray-800">สัญญาจำนำ P2P</h2>

          <p className="mb-4">
            ข้าพเจ้าได้อ่านและเข้าใจเงื่อนไขในการจำนำสินค้าผ่านแพลตฟอร์ม P2P เรียบร้อยแล้ว
            และยอมรับในเงื่อนไขดังต่อไปนี้:
          </p>

          <ol className="list-decimal list-inside space-y-2 mb-4">
            <li>สินค้าที่นำมาจำนำเป็นของข้าพเจ้าเอง และไม่มีข้อพิพาททางกฎหมาย</li>
            <li>ข้าพเจ้าจะปฏิบัติตามเงื่อนไขการชำระดอกเบี้ยและการไถ่ถอนสินค้า</li>
            <li>ในกรณีที่ไม่ชำระดอกเบี้ยหรือไถ่ถอนภายในกำหนด สินค้าจะตกเป็นของผู้ให้กู้</li>
            <li>ข้าพเจ้ายอมรับในการใช้ข้อมูลส่วนบุคคลตามนโยบายความเป็นส่วนตัว</li>
            <li>ข้าพเจ้ายอมรับในเงื่อนไขและข้อกำหนดของแพลตฟอร์ม Pawnly</li>
          </ol>

          <h3 className="font-bold mb-2">เงื่อนไขการจำนำ:</h3>
          <ul className="list-disc list-inside space-y-1 mb-4">
            <li>อัตราดอกเบี้ยคำนวณแบบรายวัน</li>
            <li>ค่าธรรมเนียมการจำนำ 10% ของดอกเบี้ย</li>
            <li>ระยะเวลาในการไถ่ถอนสินค้าตามที่กำหนด</li>
            <li>การผิดนัดชำระจะมีค่าปรับเพิ่มเติม</li>
          </ul>

          <h3 className="font-bold mb-2">นโยบายความเป็นส่วนตัว:</h3>
          <p className="mb-4">
            ข้อมูลส่วนบุคคลของข้าพเจ้าจะถูกใช้เพื่อวัตถุประสงค์ในการจำนำและการให้บริการ
            เท่านั้น และจะไม่ถูกเปิดเผยให้บุคคลที่สามโดยไม่ได้รับความยินยอม
          </p>

          <p className="text-xs text-gray-500 mt-6">
            * ข้อตกลงนี้มีผลผูกพันทางกฎหมาย
          </p>
        </div>

        {/* Acceptance Checkbox */}
        <div className="mb-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 w-4 h-4 text-[#C0562F] border-gray-300 rounded focus:ring-[#C0562F]"
            />
            <div className="text-sm text-gray-700">
              <span className="font-bold">ข้าพเจ้าได้อ่านและยอมรับใน</span>
              <span className="text-[#C0562F] font-bold"> ข้อตกลงและเงื่อนไข</span>
              <span className="font-bold"> รวมถึงนโยบายความเป็นส่วนตัวทั้งหมด</span>
            </div>
          </label>
        </div>

        {/* Signature Section */}
        <div className="mb-6">
          <h3 className="font-bold text-gray-800 mb-3">ลายเซ็นผู้จำนำ</h3>
          <p className="text-xs text-gray-500 mb-3">เซ็นลายเซ็นในช่องด้านล่าง</p>

          <div className="border-2 border-gray-300 rounded-lg p-3 bg-white">
            <SignatureCanvas
              ref={signatureRef}
              canvasProps={{
                width: 300,
                height: 150,
                className: 'border border-gray-200 rounded w-full'
              }}
              backgroundColor="white"
            />
          </div>

          <button
            onClick={clearSignature}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline"
          >
            ล้างลายเซ็น
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!accepted || isSubmitting}
          className={`w-full rounded-2xl py-4 flex flex-col items-center justify-center shadow-md transition-all active:scale-[0.98] ${
            accepted
              ? 'bg-[#C0562F] hover:bg-[#A04D2D] text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          <span className="text-base font-bold">
            {isSubmitting ? 'กำลังบันทึก...' : 'ยืนยันและดำเนินการต่อ'}
          </span>
          <span className="text-[10px] font-light opacity-90">
            {isSubmitting ? 'Processing...' : 'Confirm & Continue'}
          </span>
        </button>

        {/* Note */}
        <p className="text-xs text-gray-500 text-center mt-4">
          การกดยืนยันถือว่าคุณยอมรับในข้อตกลงทั้งหมดและสัญญามีผลผูกพันทางกฎหมาย
        </p>

      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';

export default function ContractAgreementPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C0562F] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <ContractAgreementContent />
    </Suspense>
  );
}
