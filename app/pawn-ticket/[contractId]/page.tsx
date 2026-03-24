'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Home } from 'lucide-react';
import axios from 'axios';

export default function PawnTicketPage() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.contractId as string;

  const [loading, setLoading] = useState(true);
  const [ticketData, setTicketData] = useState<any>(null);

  useEffect(() => {
    if (contractId) {
      fetchTicketData();
    }
  }, [contractId]);

  const fetchTicketData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/contracts/pawn-ticket/${contractId}?viewer=pawner`);
      setTicketData(response.data.ticketData);
    } catch (error) {
      console.error('Error fetching ticket data:', error);
      alert('ไม่สามารถโหลดข้อมูลสัญญาสินเชื่อได้');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#B85C38] mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!ticketData) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">ไม่พบข้อมูลสัญญาสินเชื่อ</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center p-4 pb-20">

      {/* Header Actions */}
      <div className="w-full max-w-sm flex justify-between items-center mb-4 px-2">
        <h1 className="text-lg font-bold text-gray-800">สัญญาสินเชื่ออิเล็กทรอนิกส์</h1>
      </div>

      {/* Ticket Paper Card */}
      <div className="w-full max-w-sm bg-white rounded-xl shadow-md overflow-hidden relative">
        {/* Decorative Top Border */}
        <div className="h-2 bg-[#B85C38]"></div>

        <div className="p-6">
          {/* Shop Header */}
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#F2E8E3] rounded-lg flex items-center justify-center text-[#B85C38] font-bold text-xl border border-[#B85C38]/20">
                P
              </div>
              <div>
                <div className="font-bold text-gray-800 text-lg">{ticketData.shopName}</div>
                <div className="text-xs text-gray-500">{ticketData.branch}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="inline-block bg-[#B85C38] text-white text-xs font-bold px-3 py-1 rounded-full mb-1">
                สัญญาสินเชื่อ
              </div>
              <div className="text-[10px] text-gray-400">Loan Contract</div>
            </div>
          </div>

          {/* Ticket Numbers */}
          <div className="flex justify-between mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
            <div>
              <div className="text-[10px] text-gray-500">เล่มที่ (Book No.)</div>
              <div className="font-bold text-gray-700">{ticketData.bookNo}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-gray-500">เลขที่ (No.)</div>
              <div className="font-bold text-[#B85C38]">{ticketData.ticketNo}</div>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-[10px] text-gray-500 mb-1">วันที่ทำรายการ</div>
              <div className="text-sm font-medium text-gray-800 border-b border-gray-200 pb-1">
                {ticketData.date}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 mb-1">วันครบกำหนดไถ่ถอน</div>
              <div className="text-sm font-medium text-gray-800 border-b border-gray-200 pb-1">
                {ticketData.dueDate}
              </div>
            </div>
          </div>

          {/* Pawner Info */}
          <div className="mb-6">
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">ข้อมูลผู้ขอสินเชื่อ</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">ชื่อ-นามสกุล</span>
                <span className="font-medium text-gray-800 text-right">{ticketData.pawner.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">เลขบัตรประชาชน</span>
                <span className="font-medium text-gray-800 text-right">{ticketData.pawner.idCard}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-gray-500 whitespace-nowrap">ที่อยู่</span>
                <span className="font-medium text-gray-800 text-right text-xs leading-relaxed max-w-[60%]">
                  {ticketData.pawner.address}
                </span>
              </div>
            </div>
          </div>

          {/* Investor Info (Redacted) */}
          <div className="mb-6">
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">ข้อมูลผู้ให้เงินกู้</h3>
            <div className="text-sm text-gray-500">
              ข้อมูลส่วนบุคคลของผู้ให้เงินกู้ถูกปกปิดตามนโยบายความเป็นส่วนตัว
            </div>
          </div>

          {/* Item Details */}
          <div className="mb-6">
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">ทรัพย์สินค้ำประกัน</h3>
            <div className="bg-[#F9FAFB] rounded-lg p-3 border border-gray-100">
              {ticketData.items.map((item: any, index: number) => (
                <div key={index} className="mb-2 last:mb-0">
                  <div className="text-sm font-bold text-gray-800 mb-1">{item.seq}. รายการทรัพย์สิน</div>
                  <div className="text-xs text-gray-600 leading-relaxed pl-4 border-l-2 border-[#B85C38]">
                    {item.description}
                    {item.serial && (
                      <div className="text-[10px] text-gray-400 mt-1">{item.serial}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Amount Section */}
          <div className="mb-6 bg-[#F2E8E3] rounded-xl p-4 border border-[#B85C38]/20">
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="text-center">
                <div className="text-xs text-gray-600 mb-1">เงินต้น</div>
                <div className="text-xl font-bold text-[#B85C38]">{ticketData.amount}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600 mb-1">ดอกเบี้ย</div>
                <div className="text-xl font-bold text-[#B85C38]">{ticketData.interestAmountInterest || ticketData.interestAmount}</div>
                {ticketData.interestAmountFee && (
                  <div className="text-[10px] text-gray-500">ค่าธรรมเนียม {ticketData.interestAmountFee}</div>
                )}
              </div>
            </div>
            <div className="text-center pt-3 border-t border-[#B85C38]/20">
              <div className="text-xs text-gray-600 mb-1">รวมยอดชำระคืน</div>
              <div className="text-2xl font-bold text-[#B85C38]">{ticketData.totalAmount}</div>
              <div className="text-sm font-medium text-gray-700 mt-1">{ticketData.amountText}</div>
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="text-[10px] text-gray-400 text-justify leading-snug mb-8">
            <p>
              * ผู้ขอสินเชื่อตกลงใช้ทรัพย์สินรายการข้างต้นเป็นหลักประกันการชำระหนี้
              โดยยอมเสียดอกเบี้ยในอัตรา {ticketData.interestRate} หากไม่มาไถ่ถอนหรือส่งดอกเบี้ยภายในระยะเวลาที่กำหนด
              ทรัพย์สินจะตกเป็นสิทธิ์ของผู้ให้กู้ทันทีตามกฎหมาย
            </p>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 mt-4">
            <div className="text-center">
              <div className="h-16 border-b border-dashed border-gray-300 mb-2 relative flex items-end justify-center">
                {ticketData.pawner.signatureUrl ? (
                  <img
                    src={ticketData.pawner.signatureUrl}
                    alt="Pawner Signature"
                    className="absolute bottom-2 max-h-12 max-w-full object-contain"
                  />
                ) : (
                  <span className="text-gray-300 text-xs italic opacity-50 absolute bottom-2">ลายเซ็นผู้ขอสินเชื่อ</span>
                )}
              </div>
              <div className="text-[10px] text-gray-500">ลงชื่อ ผู้ขอสินเชื่อ</div>
            </div>
            <div className="text-center">
              <div className="h-16 border-b border-dashed border-gray-300 mb-2 relative flex items-end justify-center">
                <div className="w-12 h-12 bg-[#B85C38]/10 rounded-full absolute top-1 right-2 border-2 border-[#B85C38]/30 flex items-center justify-center rotate-[-15deg]">
                  <span className="text-[8px] text-[#B85C38] font-bold uppercase">Pawnly</span>
                </div>
                <span className="text-gray-300 text-xs italic opacity-50 absolute bottom-2">ลายเซ็นผู้ให้กู้</span>
              </div>
              <div className="text-[10px] text-gray-500">ลงชื่อ ผู้ให้กู้</div>
            </div>
          </div>
        </div>

        {/* Decorative Bottom */}
        <div className="h-1 bg-gray-100"></div>
        <div className="flex">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="flex-1 h-2 bg-white rounded-full mx-[1px] -mt-1 shadow-sm"></div>
          ))}
        </div>
      </div>

      {/* Footer Action Buttons */}
      <div className="w-full max-w-sm mt-6 space-y-3">
        <button
          onClick={() => router.push('/dashboard')}
          className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-600 rounded-2xl py-3 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
        >
          <Home className="w-5 h-5" />
          <span className="text-base font-bold">กลับหน้าหลัก</span>
        </button>
      </div>

    </div>
  );
}
