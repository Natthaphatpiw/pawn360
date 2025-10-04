import { LiffProvider } from '@/lib/liff/liff-provider';

export default function StoreVerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_STORE || '2008216710-de1ovYZL';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
