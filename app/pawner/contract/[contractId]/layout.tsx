import { LiffProvider } from '@/lib/liff/liff-provider';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'รายละเอียด',
};

export default function PawnerContractDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use dedicated LIFF ID for pawner contract details
  // TODO: Create new LIFF ID in LINE Developers Console for pawner contract pages
  // For now, use contracts LIFF ID as fallback
  const liffId =
    process.env.NEXT_PUBLIC_LIFF_ID_PAWNER_CONTRACT ||
    process.env.NEXT_PUBLIC_LIFF_ID_CONTRACTS ||
    '2008216710-WJXR6xOM';

  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
