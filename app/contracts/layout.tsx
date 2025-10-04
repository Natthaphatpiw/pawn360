import { LiffProvider } from '@/lib/liff/liff-provider';

export default function ContractsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_CONTRACTS || '2008216710-WJXR6xOM';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
