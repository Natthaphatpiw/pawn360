'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';

interface SuccessConfirmationProps {
  loanRequestId: string;
  itemId: string;
  onBackToHome: () => void;
  onContinue?: () => void;
}

export default function SuccessConfirmation({ loanRequestId, itemId, onBackToHome, onContinue }: SuccessConfirmationProps) {
  const router = useRouter();
  const { liffObject } = useLiff();
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 font-sans">

      {/* Main Card Container */}
      <div className="w-full max-w-md bg-[#F2F2F2] rounded-3xl p-8 flex flex-col items-center text-center shadow-sm">

        {/* Success Icon */}
        <div className="mb-8">
          <div className="w-32 h-32 rounded-full border-4 border-[#7CAB4A] flex items-center justify-center">
            <Check className="w-16 h-16 text-[#7CAB4A] stroke-[3]" />
          </div>
        </div>

        {/* Main Title */}
        <h1 className="text-xl md:text-2xl font-bold text-gray-700 mb-2">
          ระบบรับข้อมูลเรียบร้อย
        </h1>

        {/* Subtitle */}
        <p className="text-gray-600 text-sm md:text-base mb-8 font-medium">
          กรุณารอการตอบรับข้อเสนอภายใน 4 ชั่วโมง
        </p>

        {/* Footer Note */}
        <p className="text-gray-500 text-xs md:text-sm leading-relaxed px-4 mb-6">
          หากเกินระยะเวลาที่กำหนด สามารถกดเสนออีกครั้งได้ที่หน้ารายละเอียดข้อเสนอ
        </p>

        {/* Action Buttons */}
        <div className="w-full space-y-3">
          {/* Continue Button */}
          <button
            onClick={() => {
              if (onContinue) {
                onContinue();
              } else {
                // Default: navigate to contract agreement
                if (liffObject && liffObject.isInClient()) {
                  // Open contract-agreement LIFF (different LIFF ID)
                  const contractAgreementLiffUrl = `https://liff.line.me/2008216710-5YORGA1N?loanRequestId=${loanRequestId}&itemId=${itemId}`;
                  liffObject.openWindow({
                    url: contractAgreementLiffUrl,
                    external: true  // Open as external LIFF app
                  });
                } else {
                  // Fallback for web browser
                  window.location.href = `/contract-agreement?loanRequestId=${loanRequestId}&itemId=${itemId}`;
                }
              }
            }}
            className="w-full bg-[#7CAB4A] hover:bg-[#6B9B41] text-white rounded-2xl py-3 flex flex-col items-center justify-center shadow-sm transition-colors active:scale-[0.98]"
          >
            <span className="text-base font-bold">ดำเนินการต่อ</span>
            <span className="text-[10px] font-light opacity-90">Continue</span>
          </button>

          {/* Back to Home Button */}
          <button
            onClick={onBackToHome}
            className="w-full bg-white border border-[#7CAB4A] hover:bg-gray-50 text-[#7CAB4A] rounded-2xl py-3 flex flex-col items-center justify-center transition-colors active:scale-[0.98]"
          >
            <span className="text-base font-bold">กลับหน้าหลัก</span>
            <span className="text-[10px] font-light opacity-90">Back to Home</span>
          </button>
        </div>

        {/* Hidden data for tracking (optional) */}
        <div className="hidden">
          <span>Request ID: {loanRequestId}</span>
          <span>Item ID: {itemId}</span>
        </div>

      </div>
    </div>
  );
}
