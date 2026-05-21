import Link from 'next/link';

import { MOCK_CONTRACT_IDS } from '@/lib/mock-investment';

export default function InvestorPawnTicketIndexPage() {
  return (
    <div className="theme-liff theme-investor min-h-screen bg-background px-6 py-6">
      <div className="mx-auto w-full max-w-md rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
        <div className="rounded-lg border border-background-white bg-background-white p-5 shadow-soft">
          <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-s2/70">
            Preview Route
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[0.08em] text-s2">Investor Pawn Ticket</h1>
          <p className="mt-2 text-sm text-foreground-subtle mb-6">
          ใช้หน้า index นี้เพื่อเปิดตัวอย่างสัญญาลงทุนจาก browser ได้ทันที
          </p>
          <Link
            href={`/investor-pawn-ticket/${MOCK_CONTRACT_IDS.active}`}
            className="btn-sheen block w-full rounded-full bg-[image:var(--background-image-grad-investor)] py-3 text-center font-medium text-s2-fg shadow-soft"
          >
            เปิดตั๋วจำนำตัวอย่าง
          </Link>
        </div>
      </div>
    </div>
  );
}
