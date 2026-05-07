'use client';

import { useEffect } from 'react';
import { Check, Clock, Bell } from 'lucide-react';

interface ContractSuccessProps {
  contractId: string;
  onBackToHome: () => void;
}

export default function ContractSuccess({ contractId, onBackToHome }: ContractSuccessProps) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  return (
    <div className="theme-liff min-h-screen bg-background-white font-sans pb-8">

      {/* Main Card Container */}
      <div className="max-w-md mx-auto rounded-xl border border-primary-border/60 bg-primary-soft/50 py-6 px-4">
        <div className="flex flex-col items-center text-center">

        {/* Success Icon */}
        <div className="mb-6">
          <div className="w-28 h-28 rounded-full border-4 border-success flex items-center justify-center bg-success-soft">
            <Check className="w-14 h-14 text-success stroke-[3]" />
          </div>
        </div>

        {/* Main Title */}
        <h1 className="mb-2 text-xl font-medium text-foreground-muted md:text-2xl">
          ส่งข้อเสนอเรียบร้อยแล้ว!
        </h1>

        {/* Contract ID */}
        <div className="pawner-panel mb-4 px-4 py-2">
          <p className="text-sm text-foreground-subtle">หมายเลขข้อเสนอ</p>
          <p className="text-lg font-bold text-primary font-english">{contractId}</p>
        </div>

        {/* Status Info */}
        <div className="w-full space-y-3 mb-6">
          {/* Waiting for Investor */}
          <div className="pawner-panel flex items-start gap-3 p-4 border border-primary/50 rounded-lg bg-background-white/70">
          <div className="rounded-full bg-warning-soft p-2">
            <Clock className="w-5 h-5 text-warning" />
          </div>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">รอการตอบรับจากนักลงทุน</p>
              <p className="text-xs text-foreground-subtle">
                ระบบกำลังส่งข้อเสนอไปยังนักลงทุน กรุณารอการตอบรับ
              </p>
            </div>
          </div>

          {/* LINE Notification */}
          <div className="pawner-panel flex items-start gap-3 p-4 border border-primary/50 rounded-lg bg-background-white/70">
          <div className="rounded-full bg-success-soft p-2">
            <Bell className="w-5 h-5 text-success" />
          </div>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">รับแจ้งเตือนทาง LINE</p>
              <p className="text-xs text-foreground-subtle">
                เมื่อมีนักลงทุนสนใจ คุณจะได้รับแจ้งเตือนทาง LINE ทันที
              </p>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="pawner-panel mb-6 w-full p-4 text-left">
          <h3 className="mb-3 text-sm font-medium text-foreground">ขั้นตอนถัดไป:</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-foreground-muted">
            <li>รอการตอบรับจากนักลงทุน (ภายใน 4 ชั่วโมง)</li>
            <li>เมื่อมีนักลงทุนยอมรับ คุณจะได้รับแจ้งเตือนทาง LINE</li>
            <li>นำสินค้าไปส่งที่ Drop Point ที่เลือกไว้</li>
            <li>รับเงินหลังจากพนักงานตรวจสอบสินค้าเรียบร้อย</li>
          </ol>
        </div>

        {/* Action Button */}
        <button
          onClick={onBackToHome}
          className="w-full min-h-12 rounded-full bg-primary px-4 py-3 text-base font-medium text-primary-fg transition-colors hover:bg-primary-hover active:scale-[0.98] flex flex-col items-center justify-center"
        >
          <span className="text-base font-medium">เสร็จสิ้น</span>
          <span className="text-xs font-light opacity-90">Done</span>
        </button>

        {/* Footer Note */}
        <p className="mt-4 text-xs text-foreground-subtle">
          ข้อเสนอจะหมดอายุหลังจาก 4 ชั่วโมง หากไม่มีนักลงทุนตอบรับ
        </p>

        </div>
      </div>
    </div>
  );
}
