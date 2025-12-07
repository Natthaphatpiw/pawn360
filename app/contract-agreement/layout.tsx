import { LiffProvider } from '@/lib/liff/liff-provider';

export default function ContractAgreementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use dedicated LIFF ID for contract agreement
  // TODO: Create new LIFF ID in LINE Developers Console for contract-agreement
  // For now, use contracts LIFF ID as it has proper profile access
  const liffId =
    process.env.NEXT_PUBLIC_LIFF_ID_CONTRACT_AGREEMENT ||
    process.env.NEXT_PUBLIC_LIFF_ID_CONTRACTS ||
    '2008216710-WJXR6xOM';

  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
