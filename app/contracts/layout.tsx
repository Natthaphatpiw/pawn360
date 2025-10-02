import { LiffProvider } from '@/lib/liff/liff-provider';

export default function ContractsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LiffProvider>{children}</LiffProvider>;
}
