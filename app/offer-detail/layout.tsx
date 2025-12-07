import { LiffProvider } from '@/lib/liff/liff-provider';

export default function OfferDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use investor offer-detail LIFF ID
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_OFFER_DETAIL || '2008641671-O4zZnvW9';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
