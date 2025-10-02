import { LiffProvider } from '@/lib/liff/liff-provider';

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LiffProvider>{children}</LiffProvider>;
}
