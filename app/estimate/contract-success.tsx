'use client';

import { Check, Clock, Bell } from 'lucide-react';

interface ContractSuccessProps {
  contractId: string;
  onBackToHome: () => void;
}

export default function ContractSuccess({ contractId, onBackToHome }: ContractSuccessProps) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 font-sans">

      {/* Main Card Container */}
      <div className="w-full max-w-md bg-[#F2F2F2] rounded-3xl p-8 flex flex-col items-center text-center shadow-sm">

        {/* Success Icon */}
        <div className="mb-6">
          <div className="w-28 h-28 rounded-full border-4 border-[#7CAB4A] flex items-center justify-center bg-[#7CAB4A]/10">
            <Check className="w-14 h-14 text-[#7CAB4A] stroke-[3]" />
          </div>
        </div>

        {/* Main Title */}
        <h1 className="text-xl md:text-2xl font-bold text-gray-700 mb-2">
          สร้างสัญญาเรียบร้อยแล้ว!
        </h1>

        {/* Contract ID */}
        <div className="bg-white rounded-lg px-4 py-2 mb-4">
          <p className="text-sm text-gray-500">หมายเลขสัญญา</p>
          <p className="text-lg font-bold text-[#C0562F]">{contractId}</p>
        </div>

        {/* Status Info */}
        <div className="w-full space-y-3 mb-6">
          {/* Waiting for Investor */}
          <div className="bg-white rounded-xl p-4 flex items-start gap-3">
            <div className="bg-[#FFF3E0] p-2 rounded-full">
              <Clock className="w-5 h-5 text-[#F57C00]" />
            </div>
            <div className="text-left">
              <p className="font-bold text-gray-800 text-sm">รอการตอบรับจากนักลงทุน</p>
              <p className="text-xs text-gray-500">
                ระบบกำลังส่งข้อเสนอไปยังนักลงทุน กรุณารอการตอบรับ
              </p>
            </div>
          </div>

          {/* LINE Notification */}
          <div className="bg-white rounded-xl p-4 flex items-start gap-3">
            <div className="bg-[#E8F5E9] p-2 rounded-full">
              <Bell className="w-5 h-5 text-[#4CAF50]" />
            </div>
            <div className="text-left">
              <p className="font-bold text-gray-800 text-sm">รับแจ้งเตือนทาง LINE</p>
              <p className="text-xs text-gray-500">
                เมื่อมีนักลงทุนสนใจ คุณจะได้รับแจ้งเตือนทาง LINE ทันที
              </p>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="w-full bg-white rounded-xl p-4 mb-6 text-left">
          <h3 className="font-bold text-gray-800 mb-3 text-sm">ขั้นตอนถัดไป:</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
            <li>รอการตอบรับจากนักลงทุน (ภายใน 4 ชั่วโมง)</li>
            <li>เมื่อมีนักลงทุนยอมรับ คุณจะได้รับแจ้งเตือนทาง LINE</li>
            <li>นำสินค้าไปส่งที่ Drop Point ที่เลือกไว้</li>
            <li>รับเงินหลังจากพนักงานตรวจสอบสินค้าเรียบร้อย</li>
          </ol>
        </div>

        {/* Action Button */}
        <button
          onClick={onBackToHome}
          className="w-full bg-[#7CAB4A] hover:bg-[#6B9B41] text-white rounded-2xl py-4 flex flex-col items-center justify-center shadow-sm transition-colors active:scale-[0.98]"
        >
          <span className="text-base font-bold">เสร็จสิ้น</span>
          <span className="text-[10px] font-light opacity-90">Done</span>
        </button>

        {/* Footer Note */}
        <p className="text-xs text-gray-500 mt-4">
          ข้อเสนอจะหมดอายุหลังจาก 4 ชั่วโมง หากไม่มีนักลงทุนตอบรับ
        </p>

      </div>
    </div>
  );
}
