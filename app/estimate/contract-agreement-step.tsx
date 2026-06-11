'use client';

import { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import axios from 'axios';
import PinModal from '@/components/PinModal';
import { getPinSession } from '@/lib/security/pin-session';
import { createMockContract, isMockPawnerMode, waitMock } from '@/lib/mock-pawner';

interface ContractAgreementStepProps {
  loanRequestId: string;
  itemId: string;
  lineId: string;
  onBack: () => void;
  onSuccess: (contractId: string) => void;
}

export default function ContractAgreementStep({
  loanRequestId,
  itemId,
  lineId,
  onBack,
  onSuccess
}: ContractAgreementStepProps) {
  const mockMode = isMockPawnerMode();
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signatureRef = useRef<SignatureCanvas>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const pendingActionRef = useRef<((token: string) => void) | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const submitWithPin = async (pinToken: string) => {
    try {
      setIsSubmitting(true);
      setError(null);

      const signatureDataURL = signatureRef.current?.toDataURL();

      if (mockMode) {
        await waitMock(500);
        onSuccess(createMockContract());
        return;
      }

      const response = await axios.post('/api/contracts/create', {
        loanRequestId,
        itemId,
        accepted,
        signature: signatureDataURL,
        lineId,
        pinToken
      });

      if (response.data.success) {
        onSuccess(response.data.contractId);
      }
    } catch (error: any) {
      console.error('Error submitting agreement:', error);
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกสัญญา');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!accepted) {
      setError('กรุณายอมรับเงื่อนไขและข้อตกลง');
      return;
    }

    if (signatureRef.current?.isEmpty()) {
      setError('กรุณาเซ็นลายเซ็นในช่องที่กำหนด');
      return;
    }

    if (!lineId) {
      setError('ไม่สามารถระบุตัวตนได้ กรุณาลองใหม่อีกครั้ง');
      return;
    }

    if (mockMode) {
      await submitWithPin('mock-pin-token');
      return;
    }

    const session = getPinSession('PAWNER', lineId);
    if (session?.token) {
      await submitWithPin(session.token);
      return;
    }

    pendingActionRef.current = async (token: string) => {
      await submitWithPin(token);
    };
    setPinModalOpen(true);
  };

  const clearSignature = () => {
    signatureRef.current?.clear();
  };

  return (
    <div className="theme-liff min-h-screen bg-background-white font-sans pb-8">
      <div className="max-w-md mx-auto rounded-xl border border-primary-border/60 bg-primary-soft/50 py-6 px-4">
        <div className="">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-2">ข้อตกลงและเงื่อนไข</h1>
          <p className="text-sm text-foreground-subtle">Terms & Conditions</p>
        </div>

        {/* Legal Content */}
        <div className="bg-background-white rounded-lg p-6 mb-6 max-h-96 overflow-y-auto text-sm text-foreground-muted leading-relaxed border border-primary/50">
          <h2 className="mb-4 text-lg font-medium text-foreground">สัญญาสินเชื่อ P2P</h2>

          <p className="mb-4">
            ข้าพเจ้าได้อ่านและเข้าใจเงื่อนไขในการขอสินเชื่อโดยใช้สินค้าค้ำประกันผ่านแพลตฟอร์ม P2P เรียบร้อยแล้ว
            และยอมรับในเงื่อนไขดังต่อไปนี้:
          </p>

          <ol className="list-decimal list-inside space-y-2 mb-4">
            <li>สินค้าที่นำมาใช้เป็นหลักประกันเป็นของข้าพเจ้าเอง และไม่มีข้อพิพาททางกฎหมาย</li>
            <li>ข้าพเจ้าจะปฏิบัติตามเงื่อนไขการชำระดอกเบี้ยและการไถ่ถอนสินค้า</li>
            <li>ในกรณีที่ไม่ชำระดอกเบี้ยหรือไถ่ถอนภายในกำหนด สินค้าจะตกเป็นของผู้ให้กู้</li>
            <li>ข้าพเจ้ายอมรับในการใช้ข้อมูลส่วนบุคคลตามนโยบายความเป็นส่วนตัว</li>
            <li>ข้าพเจ้ายอมรับในเงื่อนไขและข้อกำหนดของแพลตฟอร์ม Pawnly</li>
          </ol>

          <h3 className="font-bold mb-2">เงื่อนไขการขอสินเชื่อ:</h3>
          <ul className="list-disc list-inside space-y-1 mb-4">
            <li>อัตราดอกเบี้ยคำนวณแบบรายวัน</li>
            <li>ค่าธรรมเนียมการขอสินเชื่อ 1% ของวงเงิน (คำนวณจากวงเงินเริ่มต้นของสัญญา)</li>
            <li>ระยะเวลาในการไถ่ถอนสินค้าตามที่กำหนด</li>
            <li>การผิดนัดชำระจะมีค่าปรับเพิ่มเติม</li>
          </ul>

          <h3 className="font-bold mb-2">นโยบายความเป็นส่วนตัว:</h3>
          <p className="mb-4">
            ข้อมูลส่วนบุคคลของข้าพเจ้าจะถูกใช้เพื่อวัตถุประสงค์ในการขอสินเชื่อและการให้บริการ
            เท่านั้น และจะไม่ถูกเปิดเผยให้บุคคลที่สามโดยไม่ได้รับความยินยอม
          </p>

          <p className="mt-6 text-xs text-foreground-subtle">
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
              className="mt-1 h-7 w-7 rounded-sm border-primary/50 accent-primary focus:ring-primary"
            />
            <div className="text-sm text-foreground-muted">
              <span className="font-base">ข้าพเจ้าได้อ่านและยอมรับใน</span>
              <span className="text-primary font-bold"> ข้อตกลงและเงื่อนไข</span>
              <span className="font-base"> รวมถึงนโยบายความเป็นส่วนตัวทั้งหมด</span>
            </div>
          </label>
        </div>

        {/* Signature Section */}
        <div className="mb-6">
          <h3 className="font-semibold text-foreground mb-1">ลายเซ็นผู้ขอสินเชื่อ</h3>
          <p className="mb-3 text-xs text-foreground-subtle">เซ็นลายเซ็นในช่องด้านล่าง</p>

          <div className="rounded-lg border-1 border-primary/50 bg-background-white overflow-hidden">
            <SignatureCanvas
              ref={signatureRef}
              canvasProps={{
                width: 300,
                height: 150,
                className: 'w-full'
              }}
              backgroundColor="white"
            />
          </div>

          <button
            onClick={clearSignature}
            className="w-full mt-2 inline-flex items-center justify-center rounded-full border border-primary bg-background-white px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-background-subtle"
          >
            ล้างลายเซ็น
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 rounded-md border border-error-border bg-error-soft p-3 text-sm text-error">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!accepted || isSubmitting}
            className={`w-full min-h-12 rounded-full px-4 py-2 flex flex-col items-center justify-center transition-colors active:scale-[0.98] ${
              accepted
                ? 'btn-transition btn-sheen bg-[image:var(--background-image-grad-primary)] text-primary-fg hover:bg-primary-hover'
                : 'bg-grey-5 text-foreground-subtle cursor-not-allowed'
            }`}
          >
            <span className="text-base font-medium">
              {isSubmitting ? 'กำลังบันทึก...' : 'ยืนยันและดำเนินการต่อ'}
            </span>
            <span className="text-xs font-light opacity-90">
              {isSubmitting ? 'Processing...' : 'Confirm & Continue'}
            </span>
          </button>

          {/* Back Button */}
          <button
            onClick={onBack}
            disabled={isSubmitting}
            className="flex w-full min-h-12 flex-col items-center justify-center rounded-full bg-background-subtle px-4 py-2 text-base font-medium text-foreground-muted transition-colors hover:bg-line-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-base font-medium">ย้อนกลับ</span>
            <span className="text-xs font-light opacity-70">Back</span>
          </button>
        </div>

        {/* Note */}
        <p className="mt-4 text-center text-xs text-foreground-subtle">
          การกดยืนยันถือว่าคุณยอมรับในข้อตกลงทั้งหมดและสัญญามีผลผูกพันทางกฎหมาย
        </p>

        </div>
      </div>

      <PinModal
        open={pinModalOpen}
        role="PAWNER"
        lineId={lineId}
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
