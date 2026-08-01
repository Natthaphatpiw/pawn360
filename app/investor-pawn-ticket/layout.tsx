import type { Metadata } from 'next';
import { LiffProvider } from '@/lib/liff/liff-provider';

export const metadata: Metadata = { title: 'สัญญา Asset Funding' };

export default function InvestorPawnTicketLayout({ children }: { children: React.ReactNode }) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_DASHBOARD || '2008641671-wYKNjPkL';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
