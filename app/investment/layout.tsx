import { LiffProvider } from '@/lib/liff/liff-provider';

export default function InvestmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_INVESTMENT || '2008641671-qYiQM88b';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
