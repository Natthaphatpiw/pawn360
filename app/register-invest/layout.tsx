import { LiffProvider } from '@/lib/liff/liff-provider';

export default function RegisterInvestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use investor LIFF ID
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_REGISTER || '2008641671-O4zZnvW9';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
