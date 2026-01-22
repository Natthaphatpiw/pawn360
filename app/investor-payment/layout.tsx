import { LiffProvider } from '@/lib/liff/liff-provider';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ชำระเงิน',
};

export default function InvestorPaymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Investor Payment LIFF ID
  // LIFF ID = 2008641671-MPKmDQ1y
  // Endpoint: https://pawnly.io/investor-payment
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_PAYMENT || '2008641671-MPKmDQ1y';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
