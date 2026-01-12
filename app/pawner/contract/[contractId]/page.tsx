'use client';

import React, { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter, useParams } from 'next/navigation';
import axios from 'axios';
import { ChevronDown, AlertCircle, ChevronLeft, X } from 'lucide-react';

interface ContractDetail {
  contract_id: string;
  contract_number: string;
  customer: {
    name: string;
    idCard: string;
    phone: string;
  };
  details: {
    contractId: string;
    item: string;
    status: string;
    value: string;
    interest: string;
    duration: string;
    startDate: string;
    endDate: string;
    partnerName: string;
  };
  remark: string;
  remainingDays: number;
}

const PawnContractDetail = () => {
  const { profile, isLoading: liffLoading } = useLiff();
  const router = useRouter();
  const params = useParams();
  const contractId = params.contractId as string;

  // State ควบคุมการแสดงผล Modal
  const [activeModal, setActiveModal] = useState<string | null>(null); // 'redeem', 'interest', 'decrease', 'increase' or null
  const [modalStep, setModalStep] = useState(1); // 1 = Input Form, 2 = Confirmation
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContractDetail = async () => {
      if (!profile?.userId || !contractId) return;

      try {
        const response = await axios.get(`/api/pawners/contract/${contractId}`);
        if (response.data.success) {
          setContract(response.data.contract);
        }
      } catch (error) {
        console.error('Error fetching contract detail:', error);
      } finally {
        setLoading(false);
      }
    };

    if (profile?.userId && contractId) {
      fetchContractDetail();
    }
  }, [profile?.userId, contractId]);

  // ฟังก์ชันเปิด Modal (Reset step เป็น 1 เสมอ)
  const openModal = (modalType: string) => {
    setActiveModal(modalType);
    setModalStep(1);
  };

  // ฟังก์ชันปิด Modal
  const closeModal = () => {
    setActiveModal(null);
    setModalStep(1);
  };

  // ฟังก์ชันไป Step ถัดไป
  const nextStep = () => {
    setModalStep(2);
  };

  const InfoRow = ({ label, value, valueColor = 'text-gray-600', isBoldValue = false }: {
    label: string;
    value: string;
    valueColor?: string;
    isBoldValue?: boolean;
  }) => (
    <div className="flex justify-between items-start mb-2">
      <div className="font-bold text-gray-800 text-sm w-1/3">{label}</div>
      <div className={`text-right w-2/3 text-sm ${valueColor} ${isBoldValue ? 'font-medium' : ''}`}>{value}</div>
    </div>
  );

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C0562F]"></div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <p className="text-gray-600">ไม่พบข้อมูลสัญญา</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans relative flex flex-col">

      {/* ================= HEADER ================= */}
      <div className="bg-white px-4 py-3 flex justify-between items-center shadow-sm z-10 sticky top-0">
        <ChevronLeft className="w-6 h-6 text-gray-800 cursor-pointer" onClick={() => router.back()} />
        <div className="text-center">
          <h1 className="font-bold text-lg text-gray-800">รายการจำนำ</h1>
          <p className="text-xs text-gray-400">pawn360.com</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border border-gray-400 rounded flex items-center justify-center text-[10px] font-bold text-gray-600">
            1
          </div>
          <X className="w-6 h-6 text-gray-800 cursor-pointer" />
        </div>
      </div>

      <div className="p-4 pb-20 overflow-y-auto">

        {/* ================= MODALS ================= */}

        {/* 1. Modal: ต่อดอกเบี้ย (Pay Interest) - มีหน้าเดียว */}
        {activeModal === 'interest' && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-fade-in shadow-xl relative">

              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full border-4 border-[#C0562F] flex items-center justify-center">
                  <span className="text-4xl text-[#C0562F] font-bold">!</span>
                </div>
              </div>

              <h3 className="text-lg font-bold text-gray-800">ยืนยันรายการต่อดอกเบี้ย</h3>
              <p className="text-xs text-gray-500 mb-2 font-light">Confirm Interest rate extension</p>

              <p className="text-[#C0562F] font-bold text-sm mb-4">ยอดชำระรวม 2,000 Baht</p>

              <p className="text-[10px] text-red-500 mb-6 px-4 leading-relaxed font-light">
                เมื่อกดยืนยันแล้วกรุณารอการยืนยันจากร้าน<br/>
                เมื่อร้านยืนยันแล้วข้อมูลการชำระเงินจะอยู่หน้าแรก
              </p>

              <div className="space-y-3">
                <button className="w-full bg-[#C0562F] hover:bg-[#A04D2D] text-white rounded-full py-3 font-bold text-sm shadow-sm transition-colors">
                  ยืนยัน
                </button>
                <button onClick={closeModal} className="w-full bg-white border border-gray-300 text-gray-500 rounded-full py-3 font-bold text-sm hover:bg-gray-50 transition-colors">
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Modal: ลดเงินต้น (Decrease Loan) - มี 2 Steps */}
        {activeModal === 'decrease' && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 animate-fade-in shadow-xl relative">

              {/* Step 1: Input Form */}
              {modalStep === 1 && (
                <>
                  <div className="flex items-center gap-2 mb-6 text-left">
                    <h3 className="text-lg font-bold text-gray-800">ลดเงินต้น</h3>
                    <span className="bg-gray-200 text-gray-500 text-[10px] px-2 py-0.5 rounded-md font-medium">Decrease loan</span>
                  </div>
                  <div className="mb-6 text-left">
                    <label className="text-xs font-bold text-gray-800 block mb-2">
                      ระบุจำนวนเงินต้นที่ต้องการลด(บาท)
                    </label>
                    <input
                      type="text"
                      defaultValue="5,000"
                      className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C0562F] text-gray-800 font-medium text-sm"
                    />
                    <p className="text-[10px] text-gray-500 mt-1 font-light">เงินต้นปัจจุบัน 10,000 บาท</p>
                  </div>
                  <div className="space-y-3">
                    <button onClick={nextStep} className="w-full bg-[#C0562F] hover:bg-[#A04D2D] text-white rounded-full py-3 font-bold text-sm shadow-sm transition-colors">
                      ถัดไป
                    </button>
                    <button onClick={closeModal} className="w-full bg-white border border-[#C0562F] text-[#C0562F] rounded-full py-3 font-bold text-sm hover:bg-gray-50 transition-colors">
                      ยกเลิก
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Confirmation */}
              {modalStep === 2 && (
                <div className="text-center">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 rounded-full border-4 border-[#C0562F] flex items-center justify-center">
                      <span className="text-4xl text-[#C0562F] font-bold">!</span>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-gray-800">ยืนยันการลดเงินต้น</h3>
                  <p className="text-xs text-gray-500 mb-2 font-light">Confirm principal reduction</p>

                  <p className="text-[#C0562F] font-bold text-sm mb-4">ยอดชำระรวม 7,000 Baht</p>

                  <p className="text-[10px] text-red-500 mb-6 px-4 leading-relaxed font-light">
                    เมื่อกดยืนยันแล้วกรุณารอการร้านยืนยัน<br/>
                    เมื่อร้านยืนยันแล้วข้อมูลการชำระเงินจะอยู่หน้าแรก
                  </p>

                  <div className="space-y-3">
                    <button className="w-full bg-[#C0562F] hover:bg-[#A04D2D] text-white rounded-full py-3 font-bold text-sm shadow-sm transition-colors">
                      ยืนยัน
                    </button>
                    <button onClick={closeModal} className="w-full bg-white border border-gray-300 text-gray-500 rounded-full py-3 font-bold text-sm hover:bg-gray-50 transition-colors">
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. Modal: ไถ่ถอน (Redeem) - มีหน้าเดียว */}
        {activeModal === 'redeem' && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-fade-in shadow-xl relative">

              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full border-4 border-[#C0562F] flex items-center justify-center">
                  <span className="text-4xl text-[#C0562F] font-bold">!</span>
                </div>
              </div>

              <h3 className="text-lg font-bold text-gray-800">ยืนยันการไถ่ถอน</h3>
              <p className="text-xs text-gray-500 mb-2 font-light">Confirm redemption</p>
              <p className="text-[#C0562F] font-bold text-sm mb-6">ยอดชำระรวม 22,000 Baht</p>

              <div className="text-left mb-6">
                <label className="text-xs font-bold text-gray-800 block mb-1">การจัดส่ง*</label>
                <div className="relative">
                  <select className="w-full p-3 pr-10 bg-white border border-gray-300 rounded-xl text-gray-800 text-xs appearance-none focus:outline-none focus:border-[#C0562F]">
                    <option>บริการจัดส่ง (+40บาท)</option>
                    <option>ดำเนินการด้วยตัวเอง</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <p className="text-[10px] text-[#C0562F] mt-2 leading-tight font-light">
                  *ถ้าอยู่นอกพื้นที่การจัดส่งสามารถเลือก &ldquo;ดำเนินการด้วยตัวเอง&rdquo;<br/>
                  แล้วเรียกบริการส่งของด้วยตัวเองได้
                </p>
              </div>

              <div className="space-y-3">
                <button className="w-full bg-[#C0562F] hover:bg-[#A04D2D] text-white rounded-full py-3 font-bold text-sm shadow-sm transition-colors">
                  ยืนยัน
                </button>
                <button onClick={closeModal} className="w-full bg-white border border-gray-300 text-gray-500 rounded-full py-3 font-bold text-sm hover:bg-gray-50 transition-colors">
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. Modal: เพิ่มเงินต้น (Increase Loan) - มี 2 Steps */}
        {activeModal === 'increase' && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 animate-fade-in shadow-xl relative">

              {/* Step 1: Input Form */}
              {modalStep === 1 && (
                <>
                  <div className="flex items-center gap-2 mb-6 text-left">
                    <h3 className="text-lg font-bold text-gray-800">เพิ่มเงินต้น</h3>
                    <span className="bg-gray-200 text-gray-500 text-[10px] px-2 py-0.5 rounded-md font-medium">Increase loan</span>
                  </div>
                  <div className="mb-4 text-left">
                    <label className="text-xs font-bold text-gray-800 block mb-2">
                      ระบุจำนวนเงินต้นที่ต้องการเพิ่ม(บาท)
                    </label>
                    <input
                      type="text"
                      defaultValue="5,000"
                      className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C0562F] text-gray-800 font-medium text-sm"
                    />
                    <p className="text-[10px] text-gray-500 mt-1 font-light">ยอดสูงสุดไม่เกิน 10,000 บาท</p>
                  </div>
                  <div className="flex items-center gap-2 mb-6 text-left">
                    <div className="relative flex items-center">
                      <input type="checkbox" id="pay-interest" className="peer w-4 h-4 rounded border-gray-300 accent-[#C0562F] cursor-pointer" />
                    </div>
                    <label htmlFor="pay-interest" className="text-xs text-gray-600 cursor-pointer">ต้องการชำระดอกเบี้ยแยกต่างหาก</label>
                  </div>
                  <div className="space-y-3">
                    <button onClick={nextStep} className="w-full bg-[#C0562F] hover:bg-[#A04D2D] text-white rounded-full py-3 font-bold text-sm shadow-sm transition-colors">
                      ถัดไป
                    </button>
                    <button onClick={closeModal} className="w-full bg-white border border-[#C0562F] text-[#C0562F] rounded-full py-3 font-bold text-sm hover:bg-gray-50 transition-colors">
                      ยกเลิก
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Confirmation */}
              {modalStep === 2 && (
                <div className="text-center">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 rounded-full border-4 border-[#C0562F] flex items-center justify-center">
                      <span className="text-4xl text-[#C0562F] font-bold">!</span>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-gray-800">ยืนยันการเพิ่มเงินต้น</h3>
                  <p className="text-xs text-gray-500 mb-2 font-light">Confirm principal increase</p>

                  <div className="my-4">
                    <p className="text-gray-700 text-sm font-medium">ยอดที่ขอเพิ่มไป 5,000 Baht</p>
                    <p className="text-[#C0562F] font-bold text-sm">ยอดชำระดอกเบี้ย 1,000 Baht</p>
                  </div>

                  <p className="text-[10px] text-red-500 mb-6 px-4 leading-relaxed font-light">
                    เมื่อกดยืนยันแล้วกรุณารอการร้านยืนยัน<br/>
                    เมื่อร้านยืนยันแล้วโปรดเข้าไปทำรายการต่อที่หน้าร้าน
                  </p>

                  <div className="space-y-3">
                    <button className="w-full bg-[#C0562F] hover:bg-[#A04D2D] text-white rounded-full py-3 font-bold text-sm shadow-sm transition-colors">
                      ยืนยัน
                    </button>
                    <button onClick={closeModal} className="w-full bg-white border border-gray-300 text-gray-500 rounded-full py-3 font-bold text-sm hover:bg-gray-50 transition-colors">
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= MAIN CONTENT ================= */}

        {/* 1. Customer Info Section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-800 mb-3">ข้อมูลลูกค้า</h2>
          <div className="space-y-2">
            <InfoRow label="ชื่อ" value={contract.customer.name} />
            <InfoRow label="เลขบัตรประชาชน" value={contract.customer.idCard} />
            <InfoRow label="เบอร์มือถือ" value={contract.customer.phone} />
          </div>
          <div className="h-px bg-gray-200 my-4"></div>
        </div>

        {/* 2. Contract Details Section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-800 mb-3">รายละเอียดสัญญา</h2>
          <div className="space-y-2">
            <InfoRow label="หมายเลขสัญญา" value={contract.details.contractId} />
            <InfoRow label="สินค้า" value={contract.details.item} />
            <InfoRow label="สถานะ" value={contract.details.status} valueColor="text-[#7CAB4A]" isBoldValue />
            <InfoRow label="มูลค่า" value={contract.details.value} />
            <InfoRow label="ดอกเบี้ย" value={contract.details.interest} />
            <InfoRow label="ระยะเวลา" value={contract.details.duration} />
            <InfoRow label="วันเริ่มต้น" value={contract.details.startDate} />
            <InfoRow label="วันสิ้นสุด" value={contract.details.endDate} />
            <InfoRow label="ชื่อคู่สัญญา:" value={contract.details.partnerName} />
          </div>
          <div className="h-px bg-gray-200 my-4"></div>
        </div>

        {/* 3. Remarks */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-800 mb-1">หมายเหตุ</h2>
          <p className="text-gray-600 text-sm">{contract.remark}</p>
        </div>

        {/* 4. Remaining Days Card */}
        <div className="bg-[#EBCDBF] rounded-2xl p-6 mb-6 flex justify-between items-center text-[#B85C38] relative overflow-hidden shadow-sm">
          {/* Background gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#EBCDBF] via-[#EBCDBF] to-[#E6C2B0]"></div>

          <div className="relative z-10">
            <div className="font-bold text-lg mb-1">ระยะเวลาคงเหลือ</div>
            <div className="text-xs opacity-80 font-light">Remaining days</div>
          </div>

          <div className="relative z-10 text-right flex flex-col items-end">
            <div className="text-xs opacity-80 mb-0 font-light">วัน</div>
            <div className="text-5xl font-bold leading-none tracking-tight">{contract.remainingDays}</div>
          </div>
        </div>

        {/* 5. Action Buttons Grid - Added onClick Handlers with Step Reset */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Redeem (ไถ่ถอน) */}
          <button
            onClick={() => openModal('redeem')}
            className="bg-[#7CAB4A] hover:bg-[#689F38] text-white rounded-2xl py-3 flex flex-col items-center justify-center shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="text-sm font-bold">ไถ่ถอน</span>
            <span className="text-[10px] font-light opacity-90">Redeem</span>
          </button>

          {/* Pay Interest (ต่อดอกเบี้ย) */}
          <button
            onClick={() => openModal('interest')}
            className="bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-3 flex flex-col items-center justify-center shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="text-sm font-bold">ต่อดอกเบี้ย</span>
            <span className="text-[10px] font-light opacity-90">Pay interest</span>
          </button>

          {/* Decrease Loan (ลดเงินต้น) */}
          <button
            onClick={() => openModal('decrease')}
            className="bg-[#F4B95F] hover:bg-[#E0A850] text-white rounded-2xl py-3 flex flex-col items-center justify-center shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="text-sm font-bold">ลดเงินต้น</span>
            <span className="text-[10px] font-light opacity-90">Decrease loan</span>
          </button>

          {/* Increase Loan (เพิ่มเงินต้น) */}
          <button
            onClick={() => openModal('increase')}
            className="bg-[#E56363] hover:bg-[#D35252] text-white rounded-2xl py-3 flex flex-col items-center justify-center shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="text-sm font-bold">เพิ่มเงินต้น</span>
            <span className="text-[10px] font-light opacity-90">Increase loan</span>
          </button>
        </div>

        {/* 6. Bottom Outline Buttons */}
        <div className="space-y-3">
          <button className="w-full bg-white border border-[#B85C38] hover:bg-gray-50 text-[#B85C38] rounded-2xl py-3 flex flex-col items-center justify-center transition-transform active:scale-[0.98]">
            <span className="text-sm font-bold">ที่ตั้ง Drop point</span>
          </button>

          <button
            onClick={() => router.push(`/pawn-ticket/${contractId}`)}
            className="w-full bg-white border border-[#B85C38] hover:bg-gray-50 text-[#B85C38] rounded-2xl py-3 flex flex-col items-center justify-center transition-transform active:scale-[0.98]"
          >
            <span className="text-sm font-bold">ดูสัญญา</span>
            <span className="text-[10px] opacity-80 font-light">See contract</span>
          </button>
        </div>

      </div>
    </div>
  );
};

export default PawnContractDetail;
