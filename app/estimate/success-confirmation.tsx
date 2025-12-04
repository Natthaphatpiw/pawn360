'use client';

import { Check } from 'lucide-react';

interface SuccessConfirmationProps {
  loanRequestId: string;
  itemId: string;
  onBackToHome: () => void;
}

export default function SuccessConfirmation({ loanRequestId, itemId, onBackToHome }: SuccessConfirmationProps) {
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
        <p className="text-gray-500 text-xs md:text-sm leading-relaxed px-4">
          หากเกินระยะเวลาที่กำหนด สามารถกดเสนออีกครั้งได้ที่หน้ารายละเอียดข้อเสนอ
        </p>

        {/* Hidden data for tracking (optional) */}
        <div className="hidden">
          <span>Request ID: {loanRequestId}</span>
          <span>Item ID: {itemId}</span>
        </div>

      </div>
    </div>
  );
}
