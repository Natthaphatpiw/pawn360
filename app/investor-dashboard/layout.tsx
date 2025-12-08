import { LiffProvider } from '@/lib/liff/liff-provider';

export const dynamic = 'force-dynamic';

export default function InvestorDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Investor Dashboard LIFF ID
  // LIFF ID = 2008641671-wYKNjPkL
  // Endpoint: https://pawn360.vercel.app/investor-dashboard
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_DASHBOARD || '2008641671-wYKNjPkL';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
