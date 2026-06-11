'use client';

import { Check } from 'lucide-react';

interface SuccessConfirmationProps {
  loanRequestId: string;
  itemId: string;
  onBackToHome: () => void;
  onContinue?: () => void;
}

export default function SuccessConfirmation({ loanRequestId, itemId, onBackToHome, onContinue }: SuccessConfirmationProps) {
  return (
    <div className="theme-liff min-h-screen bg-background-white flex items-center justify-center p-4 font-sans">

      {/* Main Card Container */}
      <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-primary-border/60 bg-primary-soft/50 p-4 shadow-[0_22px_60px_rgba(219,71,16,0.14)]">
        <div className="rounded-[var(--radius-lg)] border border-white/90 bg-background-white/90 p-8 flex flex-col items-center text-center shadow-[0_10px_24px_rgba(219,71,16,0.06)]">

        {/* Success Icon */}
        <div className="mb-8">
          <div className="w-32 h-32 rounded-full border-4 border-primary flex items-center justify-center bg-primary-soft">
            <Check className="w-16 h-16 text-primary stroke-[3]" />
          </div>
        </div>

        {/* Main Title */}
        <h1 className="mb-2 text-xl font-medium text-foreground-muted md:text-2xl">
          ระบบรับข้อมูลเรียบร้อย
        </h1>

        {/* Subtitle */}
        <p className="mb-8 text-sm font-medium text-foreground-muted md:text-base">
          กรุณารอการตอบรับข้อเสนอภายใน 4 ชั่วโมง
        </p>

        {/* Footer Note */}
        <p className="mb-6 px-4 text-xs leading-relaxed text-foreground-subtle md:text-sm">
          หากเกินระยะเวลาที่กำหนด สามารถกดเสนออีกครั้งได้ที่หน้ารายละเอียดข้อเสนอ
        </p>

        {/* Action Buttons */}
        <div className="w-full space-y-3">
          {/* Continue Button */}
          <button
            onClick={() => {
              console.log('Continuing with loanRequestId:', loanRequestId, 'itemId:', itemId);

              if (!loanRequestId || !itemId || loanRequestId === 'undefined' || itemId === 'undefined') {
                console.error('Invalid loanRequestId or itemId:', { loanRequestId, itemId });
                alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
                return;
              }

              if (onContinue) {
                onContinue();
              } else {
                // Default: navigate to contract agreement LIFF page
                console.log('Redirecting to contract-agreement LIFF...');
                const contractLiffId = '2008216710-WJXR6xOM'; // LIFF ID for contract agreement
                const liffUrl = `https://liff.line.me/${contractLiffId}/contract-agreement?loanRequestId=${loanRequestId}&itemId=${itemId}`;
                window.location.href = liffUrl;
              }
            }}
            className="w-full min-h-12 rounded-full btn-transition btn-sheen bg-[image:var(--background-image-grad-primary)] px-4 py-2 text-base font-medium text-primary-fg transition-colors hover:bg-primary-hover active:scale-[0.98] flex flex-col items-center justify-center"
          >
            <span className="text-base font-medium">ดำเนินการต่อ</span>
            <span className="text-xs font-light opacity-90">Continue</span>
          </button>

          {/* Back to Home Button */}
          <button
            onClick={onBackToHome}
            className="w-full min-h-12 rounded-full border border-primary bg-background-white px-4 py-2 text-base font-medium text-primary transition-colors hover:bg-background-subtle active:scale-[0.98] flex flex-col items-center justify-center"
          >
            <span className="text-base font-medium">กลับหน้าหลัก</span>
            <span className="text-xs font-light opacity-90">Back to Home</span>
          </button>
        </div>

        {/* Hidden data for tracking (optional) */}
        <div className="hidden">
          <span>Request ID: {loanRequestId}</span>
          <span>Item ID: {itemId}</span>
        </div>

        </div>
      </div>
    </div>
  );
}
