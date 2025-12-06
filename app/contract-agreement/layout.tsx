import { LiffProvider } from '@/lib/liff/liff-provider';

export default function ContractAgreementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use pawner LIFF ID (same as register)
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_REGISTER || '2008216710-BEZ5XNyd';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
