import { LiffProvider } from '@/lib/liff/liff-provider';

export default function ContractAgreementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use same LIFF ID as estimate page to maintain LIFF context
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_PAWN || '2008216710-54P86MRY';

  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
