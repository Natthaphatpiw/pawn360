import { LiffProvider } from '@/lib/liff/liff-provider';

export default function EstimateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_PAWN || '2008216710-54P86MRY';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
