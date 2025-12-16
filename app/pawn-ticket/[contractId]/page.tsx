'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Download, Home, Share2 } from 'lucide-react';
import axios from 'axios';
import html2canvas from 'html2canvas';

export default function PawnTicketPage() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.contractId as string;
  const ticketRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ticketData, setTicketData] = useState<any>(null);

  useEffect(() => {
    if (contractId) {
      fetchTicketData();
    }
  }, [contractId]);

  const fetchTicketData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/contracts/pawn-ticket/${contractId}`);
      setTicketData(response.data.ticketData);
    } catch (error) {
      console.error('Error fetching ticket data:', error);
      alert('ไม่สามารถโหลดข้อมูลตั๋วจำนำได้');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!ticketRef.current) return;

    try {
      setSaving(true);

      // Capture the ticket as canvas
      const canvas = await html2canvas(ticketRef.current, {
        scale: 2,
        backgroundColor: '#F2F2F2',
        logging: false,
        useCORS: true
      });

      // Convert to base64 for upload
      const imageBase64 = canvas.toDataURL('image/png');

      // Upload to S3
      try {
        const uploadResponse = await axios.post('/api/contracts/upload-pawn-ticket', {
          contractId,
          imageBase64
        });

        if (uploadResponse.data.success) {
          console.log('Pawn ticket uploaded to S3:', uploadResponse.data.url);
        }
      } catch (uploadError) {
        console.error('Error uploading to S3:', uploadError);
        // Continue with download even if upload fails
      }

      // Download locally
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `pawn-ticket-${ticketData.ticketNo}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          alert('บันทึกรูปภาพสำเร็จ');
        }
      }, 'image/png');

    } catch (error) {
      console.error('Error downloading image:', error);
      alert('ไม่สามารถบันทึกรูปภาพได้');
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!ticketRef.current) return;

    try {
      const canvas = await html2canvas(ticketRef.current, {
        scale: 2,
        backgroundColor: '#F2F2F2',
        logging: false,
        useCORS: true
      });

      canvas.toBlob(async (blob) => {
        if (blob && navigator.share) {
          const file = new File([blob], `pawn-ticket-${ticketData.ticketNo}.png`, { type: 'image/png' });
          try {
            await navigator.share({
              files: [file],
              title: 'ตั๋วจำนำอิเล็กทรอนิกส์',
              text: `ตั๋วจำนำเลขที่ ${ticketData.ticketNo}`
            });
          } catch (err) {
            console.error('Error sharing:', err);
          }
        } else {
          alert('เบราว์เซอร์ของคุณไม่รองรับการแชร์');
        }
      }, 'image/png');
    } catch (error) {
      console.error('Error sharing:', error);
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
          <p className="text-gray-600">ไม่พบข้อมูลตั๋วจำนำ</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center p-4 pb-20">

      {/* Header Actions */}
      <div className="w-full max-w-sm flex justify-between items-center mb-4 px-2">
        <h1 className="text-lg font-bold text-gray-800">ตั๋วจำนำอิเล็กทรอนิกส์</h1>
        <button
          onClick={handleShare}
          className="p-2 bg-white rounded-full shadow-sm text-gray-600 hover:text-[#B85C38]"
        >
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      {/* Ticket Paper Card */}
      <div ref={ticketRef} className="w-full max-w-sm bg-white rounded-xl shadow-md overflow-hidden relative">
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
                ตั๋วจำนำ
              </div>
              <div className="text-[10px] text-gray-400">Pawn Ticket</div>
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
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">ข้อมูลผู้จำนำ</h3>
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

          {/* Investor Info */}
          <div className="mb-6">
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">ข้อมูลผู้ให้เงินกู้</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">ชื่อ-นามสกุล</span>
                <span className="font-medium text-gray-800 text-right">{ticketData.investor.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">เลขบัตรประชาชน</span>
                <span className="font-medium text-gray-800 text-right">{ticketData.investor.idCard}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-gray-500 whitespace-nowrap">ที่อยู่</span>
                <span className="font-medium text-gray-800 text-right text-xs leading-relaxed max-w-[60%]">
                  {ticketData.investor.address}
                </span>
              </div>
            </div>
          </div>

          {/* Item Details */}
          <div className="mb-6">
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">ทรัพย์สินที่จำนำ</h3>
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
          <div className="mb-6 text-center bg-[#F2E8E3] rounded-xl p-4 border border-[#B85C38]/20">
            <div className="text-xs text-gray-600 mb-1">จำนวนเงินที่รับจำนำ (Amount)</div>
            <div className="text-3xl font-bold text-[#B85C38] mb-1">{ticketData.amount}</div>
            <div className="text-sm font-medium text-gray-700">{ticketData.amountText}</div>
          </div>

          {/* Terms & Conditions */}
          <div className="text-[10px] text-gray-400 text-justify leading-snug mb-8">
            <p>
              * ผู้จำนำตกลงจำนำทรัพย์สินรายการข้างต้นไว้กับผู้รับจำนำเพื่อเป็นประกันการชำระหนี้
              โดยยอมเสียดอกเบี้ยในอัตรา {ticketData.interestRate} หากไม่มาไถ่ถอนหรือส่งดอกเบี้ยภายในระยะเวลาที่กำหนด
              ทรัพย์สินจะตกเป็นสิทธิ์ของผู้รับจำนำทันทีตามกฎหมาย
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
                  <span className="text-gray-300 text-xs italic opacity-50 absolute bottom-2">ลายเซ็นผู้จำนำ</span>
                )}
              </div>
              <div className="text-[10px] text-gray-500">ลงชื่อ ผู้จำนำ</div>
            </div>
            <div className="text-center">
              <div className="h-16 border-b border-dashed border-gray-300 mb-2 relative flex items-end justify-center">
                <div className="w-12 h-12 bg-[#B85C38]/10 rounded-full absolute top-1 right-2 border-2 border-[#B85C38]/30 flex items-center justify-center rotate-[-15deg]">
                  <span className="text-[8px] text-[#B85C38] font-bold uppercase">Pawnly</span>
                </div>
                <span className="text-gray-300 text-xs italic opacity-50 absolute bottom-2">ลายเซ็นผู้รับจำนำ</span>
              </div>
              <div className="text-[10px] text-gray-500">ลงชื่อ ผู้รับจำนำ</div>
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
          onClick={handleDownloadImage}
          disabled={saving}
          className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-3 flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          <Download className="w-5 h-5" />
          <span className="text-base font-bold">{saving ? 'กำลังบันทึก...' : 'บันทึกรูปภาพ'}</span>
        </button>

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
