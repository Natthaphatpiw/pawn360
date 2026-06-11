'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Home, SearchX } from 'lucide-react';
import axios from 'axios';
import { getMockContractDetail, getMockContractsEnabled } from '@/lib/mock-contracts';

const formatThaiDate = (dateString?: string) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear() + 543;
  return `${day}/${month}/${year}`;
};

const buildMockPawnTicketData = (contract: any) => {
  const principal = Number(contract.loan_principal_amount || 0);
  const interestAmount = Number(contract.interest_amount || 0);
  const totalAmount = Number(contract.total_amount || principal + interestAmount);
  const itemName = contract.item
    ? [contract.item.brand, contract.item.model, contract.item.capacity].filter(Boolean).join(' ')
    : 'รายการทรัพย์สิน';

  return {
    shopName: 'Astly',
    branch: contract.drop_point?.drop_point_name || 'สำนักงานใหญ่',
    ticketNo: contract.contract_number || contract.contract_id.substring(0, 6).toUpperCase(),
    bookNo: contract.contract_id.substring(0, 2).toUpperCase(),
    date: formatThaiDate(contract.contract_start_date),
    dueDate: formatThaiDate(contract.contract_end_date),
    pawner: {
      name: `${contract.customer?.firstname || ''} ${contract.customer?.lastname || ''}`.trim(),
      idCard: contract.customer?.national_id || '-',
      address: [
        contract.drop_point?.addr_house_no,
        contract.drop_point?.addr_street,
        contract.drop_point?.addr_sub_district,
        contract.drop_point?.addr_district,
        contract.drop_point?.addr_province,
        contract.drop_point?.addr_postcode,
      ].filter(Boolean).join(' ') || '-',
      signatureUrl: null,
    },
    items: contract.item ? [
      {
        seq: 1,
        description: itemName,
        serial: contract.item.serial_number ? `S/N: ${contract.item.serial_number}` : '',
      },
    ] : [],
    amount: principal.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
    interestAmountInterest: interestAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
    interestAmountFee: '0.00',
    interestAmount: interestAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
    totalAmount: totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
    amountText: `${totalAmount.toLocaleString('th-TH')} บาท`,
    interestRate: `${((contract.interest_rate || 0) * 100).toFixed(2)}% ต่อเดือน`,
    contractDuration: contract.contract_duration_days || 0,
  };
};

export default function PawnTicketPage() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.contractId as string;
  const mockMode = getMockContractsEnabled();

  const [loading, setLoading] = useState(true);
  const [ticketData, setTicketData] = useState<any>(null);

  useEffect(() => {
    if (contractId) {
      fetchTicketData();
    }
  }, [contractId, mockMode]);

  const fetchTicketData = async () => {
    try {
      setLoading(true);
      if (mockMode) {
        const contract = await getMockContractDetail(contractId);
        setTicketData(contract ? buildMockPawnTicketData(contract) : null);
        return;
      }

      const response = await axios.get(`/api/contracts/pawn-ticket/${contractId}?viewer=pawner`);
      setTicketData(response.data.ticketData);
    } catch (error) {
      console.error('Error fetching ticket data:', error);
      setTicketData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGoHome = () => {
    router.push('/contracts');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (!ticketData) {
    return (
      <div className="theme-liff min-h-screen bg-background px-4 py-6">
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <div className="w-full max-w-sm rounded-xl border border-primary-border bg-primary-soft px-6 py-8 text-center shadow-soft">
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
              className="btn-transition mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-primary bg-primary-soft px-5 py-3 text-sm font-medium text-primary"
            >
              กลับหน้าหลัก
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-liff min-h-screen bg-background px-4 py-6 pb-20">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center">

        {/* Pawn Ticket Header */}
        <div className="mb-5 rounded-xl border border-primary-border bg-primary-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
            <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/40">
              Pawn Ticket
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-primary">
              สัญญาสินเชื่ออิเล็กทรอนิกส์
            </div>
            <p className="mt-2 text-xs text-foreground-subtle">แสดงรายละเอียดสัญญา ทรัพย์สินค้ำประกัน และยอดเงินตามข้อมูลในระบบ</p>
          </div>
        </div>

        <div className="relative w-full overflow-hidden rounded-lg bg-background-white shadow-strong">
          <div className="h-2 bg-primary"></div>

          <div className="p-6">
            <div className="mb-6 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-primary-border/30 bg-primary-soft text-xl font-bold text-primary">
                  A
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground">{ticketData.shopName}</div>
                  <div className="text-xs text-foreground-subtle">{ticketData.branch}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="mb-1 inline-block rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-fg">
                  สัญญาสินเชื่อ
                </div>
                <div className="text-xs text-foreground-subtle">Loan Contract</div>
              </div>
            </div>

            <div className="mb-4 flex justify-between rounded-md border border-primary bg-primary-soft p-3">
              <div>
                <div className="text-xs text-foreground-subtle">เล่มที่ (Book No.)</div>
                <div className="font-bold text-foreground-muted">{ticketData.bookNo}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-foreground-subtle">เลขที่ (No.)</div>
                <div className="font-bold text-primary">{ticketData.ticketNo}</div>
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
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-foreground-subtle">ชื่อ-นามสกุล</span>
                  <span className="text-right font-medium text-foreground">{ticketData.pawner.name}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-foreground-subtle">เลขบัตรประชาชน</span>
                  <span className="text-right font-medium text-foreground">{ticketData.pawner.idCard}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="whitespace-nowrap text-foreground-subtle">ที่อยู่</span>
                  <span className="max-w-[60%] text-right text-xs font-medium leading-relaxed text-foreground">
                    {ticketData.pawner.address}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">ข้อมูลผู้ให้เงินกู้</h3>
              <div className="text-sm text-foreground-subtle">
                ข้อมูลส่วนบุคคลของผู้ให้เงินกู้ถูกปกปิดตามนโยบายความเป็นส่วนตัว
              </div>
            </div>

            <div className="mb-6">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">ทรัพย์สินค้ำประกัน</h3>
              <div className="rounded-md border border-primary bg-primary-soft p-3">
                {ticketData.items.map((item: any, index: number) => (
                  <div key={index} className="mb-2 last:mb-0">
                    <div className="mb-1 text-sm font-bold text-foreground">{item.seq}. รายการทรัพย์สิน</div>
                    <div className="border-l-2 border-primary pl-4 text-xs leading-relaxed text-foreground-muted">
                      {item.description}
                      {item.serial && (
                        <div className="mt-1 text-[10px] text-foreground-subtle">{item.serial}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6 rounded-lg border border-primary-border/30 bg-primary-soft p-4">
              <div className="mb-3 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="mb-1 text-xs text-foreground-subtle">เงินต้น</div>
                  <div className="text-xl font-bold text-primary">{ticketData.amount}</div>
                </div>
                <div className="text-center">
                  <div className="mb-1 text-xs text-foreground-subtle">ดอกเบี้ย</div>
                  <div className="text-xl font-bold text-primary">{ticketData.interestAmountInterest || ticketData.interestAmount}</div>
                  {ticketData.interestAmountFee && (
                    <div className="text-[10px] text-foreground-subtle">ค่าธรรมเนียม {ticketData.interestAmountFee}</div>
                  )}
                </div>
              </div>
              <div className="border-t border-primary-border/30 pt-3 text-center">
                <div className="mb-1 text-xs text-foreground-subtle">รวมยอดชำระคืน</div>
                <div className="text-2xl font-bold text-primary">{ticketData.totalAmount}</div>
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
                  {ticketData.pawner.signatureUrl ? (
                    <img
                      src={ticketData.pawner.signatureUrl}
                      alt="Pawner Signature"
                      className="absolute bottom-2 max-h-12 max-w-full object-contain"
                    />
                  ) : (
                    <span className="absolute bottom-2 text-xs italic text-foreground-subtle opacity-50">ลายเซ็นผู้ขอสินเชื่อ</span>
                  )}
                </div>
                <div className="text-[10px] text-foreground-subtle">ลงชื่อ ผู้ขอสินเชื่อ</div>
              </div>
              <div className="text-center">
                <div className="relative mb-2 flex h-16 items-end justify-center border-b border-dashed border-line-soft">
                  <div className="absolute right-2 top-1 flex h-12 w-12 rotate-[-15deg] items-center justify-center rounded-full border-2 border-primary/30 bg-primary/10">
                    <span className="text-[8px] font-bold uppercase text-primary">Astly</span>
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
            className="btn-transition flex w-full min-h-12 items-center justify-center gap-2 rounded-full border border-primary bg-background px-4 py-4 text-primary"
          >
            <Home className="h-5 w-5" />
            <span className="text-base font-medium">กลับหน้าหลัก</span>
          </button>
        </div>
      </div>
    </div>
  );
}
