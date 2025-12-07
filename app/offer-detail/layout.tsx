import { LiffProvider } from '@/lib/liff/liff-provider';

export default function OfferDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TODO: Create separate LIFF app for investors using LINE_CHANNEL_ID_INVEST=2008641309
  // For now, using the same LIFF ID as pawners
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '2008216710-54P86MRY';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
