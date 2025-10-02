import { LiffProvider } from '@/lib/liff/liff-provider';

export default function PawnNewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LiffProvider>{children}</LiffProvider>;
}
