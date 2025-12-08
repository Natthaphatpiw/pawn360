import { LiffProvider } from '@/lib/liff/liff-provider';

export const dynamic = 'force-dynamic';

export default function InvestorPaymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Investor Payment LIFF ID
  // LIFF ID = 2008641671-MPKmDQ1y
  // Endpoint: https://pawn360.vercel.app/investor-payment
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_PAYMENT || '2008641671-MPKmDQ1y';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
