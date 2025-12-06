import { LiffProvider } from '@/lib/liff/liff-provider';

export default function EKYCInvestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use investor LIFF ID (same as register-invest)
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_REGISTER || '2008641671-O4zZnvW9';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
