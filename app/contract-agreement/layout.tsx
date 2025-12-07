import { LiffProvider } from '@/lib/liff/liff-provider';

export default function ContractAgreementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use pawn LIFF ID as contract-agreement is part of pawn flow
  // TODO: Create dedicated LIFF ID for contract-agreement in LINE Developers Console
  const liffId =
    process.env.NEXT_PUBLIC_LIFF_ID_CONTRACT_AGREEMENT ||
    process.env.NEXT_PUBLIC_LIFF_ID_PAWN ||
    '2008216710-54P86MRY';

  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
