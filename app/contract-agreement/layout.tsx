import { LiffProvider } from '@/lib/liff/liff-provider';

export default function ContractAgreementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use dedicated LIFF ID for contract agreement
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_CONTRACT_AGREEMENT || '2008216710-5YORGA1N';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
