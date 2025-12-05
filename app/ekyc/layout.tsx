import { LiffProvider } from '@/lib/liff/liff-provider';

export default function EKYCWaitingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_REGISTER || '2008216710-BEZ5XNyd';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
