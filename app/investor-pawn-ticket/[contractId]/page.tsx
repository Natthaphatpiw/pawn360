'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Home, SearchX } from 'lucide-react';
import axios from 'axios';
import { getMockPawnTicket, isInvestorPreviewMode } from '@/lib/mock-investment';

export default function InvestorPawnTicketPage() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.contractId as string;
  const previewMode = isInvestorPreviewMode();

  const [loading, setLoading] = useState(true);
  const [ticketData, setTicketData] = useState<any>(null);

  useEffect(() => {
    if (contractId) {
      fetchTicketData();
    }
  }, [contractId, previewMode]);

  const fetchTicketData = async () => {
    try {
      setLoading(true);
      if (previewMode) {
        setTicketData(getMockPawnTicket(contractId));
        return;
      }

      const response = await axios.get(`/api/contracts/pawn-ticket/${contractId}?viewer=investor`);
      setTicketData(response.data.ticketData);
    } catch (error) {
      console.error('Error fetching ticket data:', error);
      setTicketData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGoHome = () => {
    router.push('/investor-dashboard');
  };

  if (loading) {
    return (
      <div className="page-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (!ticketData) {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background px-4 py-6">
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <div className="w-full max-w-sm rounded-xl border border-s2-border bg-s2-soft px-6 py-8 text-center shadow-soft">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-error-border bg-error-soft text-error">
              <SearchX className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-foreground">ไม่พบข้อมูลสัญญาสินเชื่อ</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground-subtle">
              กรุณาตรวจสอบรหัสสัญญาอีกครั้ง หรือกลับไปยังหน้ารายการสัญญา
            </p>
            <button
              type="button"
              onClick={handleGoHome}
              className="btn-transition mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-s2 bg-s2-soft px-5 py-3 text-sm font-medium text-s2"
            >
              กลับหน้าหลัก
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-liff theme-investor min-h-screen bg-background px-4 py-6 pb-20">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center">
        <div className="mb-5 rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
            <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-s2/40">
              Pawn Ticket
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-s2">
              สัญญาสินเชื่ออิเล็กทรอนิกส์
            </div>
            <p className="mt-2 text-xs text-foreground-subtle">แสดงรายละเอียดสัญญา ทรัพย์สินค้ำประกัน และยอดเงินตามข้อมูลในระบบ</p>
          </div>
        </div>

        <div className="relative w-full overflow-hidden rounded-lg bg-background-white shadow-strong">
          <div className="h-2 bg-s2"></div>

          <div className="p-6">
            <div className="mb-6 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-s2-border/30 bg-s2-soft text-xl font-bold text-s2">
                  P
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground">{ticketData.shopName}</div>
                  <div className="text-xs text-foreground-subtle">{ticketData.branch}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="mb-1 inline-block rounded-full bg-s2 px-3 py-1 text-xs font-bold text-s2-fg">
                  สัญญาสินเชื่อ
                </div>
                <div className="text-xs text-foreground-subtle">Loan Contract</div>
              </div>
            </div>

            <div className="mb-4 flex justify-between rounded-md border border-s2 bg-s2-soft p-3">
              <div>
                <div className="text-xs text-foreground-subtle">เล่มที่ (Book No.)</div>
                <div className="font-bold text-foreground-muted">{ticketData.bookNo}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-foreground-subtle">เลขที่ (No.)</div>
                <div className="font-bold text-s2">{ticketData.ticketNo}</div>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1 text-xs text-foreground-subtle">วันที่ทำรายการ</div>
                <div className="border-b border-line-soft pb-1 text-sm font-medium text-foreground">
                  {ticketData.date}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs text-foreground-subtle">วันครบกำหนดไถ่ถอน</div>
                <div className="border-b border-line-soft pb-1 text-sm font-medium text-foreground">
                  {ticketData.dueDate}
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">ข้อมูลผู้ขอสินเชื่อ</h3>
              <div className="text-sm text-foreground-subtle">
                ข้อมูลส่วนบุคคลของผู้ขอสินเชื่อถูกปกปิดตามนโยบายความเป็นส่วนตัว
              </div>
            </div>

            <div className="mb-6">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">ข้อมูลผู้ให้เงินกู้</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-foreground-subtle">ชื่อ-นามสกุล</span>
                  <span className="text-right font-medium text-foreground">{ticketData.investor.name}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-foreground-subtle">เลขบัตรประชาชน</span>
                  <span className="text-right font-medium text-foreground">{ticketData.investor.idCard}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="whitespace-nowrap text-foreground-subtle">ที่อยู่</span>
                  <span className="max-w-[60%] text-right text-xs font-medium leading-relaxed text-foreground">
                    {ticketData.investor.address}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">ทรัพย์สินค้ำประกัน</h3>
              <div className="rounded-md border border-s2 bg-s2-soft p-3">
                {ticketData.items.map((item: any, index: number) => (
                  <div key={index} className="mb-2 last:mb-0">
                    <div className="mb-1 text-sm font-bold text-foreground">{item.seq}. รายการทรัพย์สิน</div>
                    <div className="border-l-2 border-s2 pl-4 text-xs leading-relaxed text-foreground-muted">
                      {item.description}
                      {item.serial && (
                        <div className="mt-1 text-[10px] text-foreground-subtle">{item.serial}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6 rounded-lg border border-s2-border/30 bg-s2-soft p-4">
              <div className="mb-3 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="mb-1 text-xs text-foreground-subtle">เงินต้น</div>
                  <div className="text-xl font-bold text-s2">{ticketData.amount}</div>
                </div>
                <div className="text-center">
                  <div className="mb-1 text-xs text-foreground-subtle">ดอกเบี้ย</div>
                  <div className="text-xl font-bold text-s2">{ticketData.interestAmount}</div>
                </div>
              </div>
              <div className="border-t border-s2-border/30 pt-3 text-center">
                <div className="mb-1 text-xs text-foreground-subtle">รวมยอดชำระคืน</div>
                <div className="text-2xl font-bold text-s2">{ticketData.totalAmount}</div>
                <div className="mt-1 text-sm font-medium text-foreground-muted">{ticketData.amountText}</div>
              </div>
            </div>

            <div className="mb-8 text-[10px] leading-snug text-foreground-subtle text-justify">
              <p>
                * ผู้ขอสินเชื่อตกลงใช้ทรัพย์สินรายการข้างต้นเป็นหลักประกันการชำระหนี้
                โดยยอมเสียดอกเบี้ยในอัตรา {ticketData.interestRate} หากไม่มาไถ่ถอนหรือส่งดอกเบี้ยภายในระยะเวลาที่กำหนด
                ทรัพย์สินจะตกเป็นสิทธิ์ของผู้ให้กู้ทันทีตามกฎหมาย
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-8">
              <div className="text-center">
                <div className="relative mb-2 flex h-16 items-end justify-center border-b border-dashed border-line-soft">
                  <span className="absolute bottom-2 text-xs italic text-foreground-subtle opacity-50">ลายเซ็นผู้ขอสินเชื่อ</span>
                </div>
                <div className="text-[10px] text-foreground-subtle">ลงชื่อ ผู้ขอสินเชื่อ</div>
              </div>
              <div className="text-center">
                <div className="relative mb-2 flex h-16 items-end justify-center border-b border-dashed border-line-soft">
                  <div className="absolute right-2 top-1 flex h-12 w-12 rotate-[-15deg] items-center justify-center rounded-full border-2 border-s2/30 bg-s2/10">
                    <span className="text-[8px] font-bold uppercase text-s2">Pawnly</span>
                  </div>
                  <span className="absolute bottom-2 text-xs italic text-foreground-subtle opacity-50">ลายเซ็นผู้ให้กู้</span>
                </div>
                <div className="text-[10px] text-foreground-subtle">ลงชื่อ ผู้ให้กู้</div>
              </div>
            </div>
          </div>

          <div className="h-1 bg-background-subtle"></div>
          <div className="flex">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="mx-[1px] -mt-1 h-2 flex-1 rounded-full bg-background-white shadow-sm"></div>
            ))}
          </div>
        </div>

        <div className="mt-6 w-full max-w-sm space-y-3">
          <button
            onClick={handleGoHome}
            className="btn-transition flex w-full min-h-12 items-center justify-center gap-2 rounded-full border border-s2 bg-background px-4 py-3 text-s2"
          >
            <Home className="h-5 w-5" />
            <span className="text-base font-medium">กลับหน้าหลัก</span>
          </button>
        </div>
      </div>
    </div>
  );
}
