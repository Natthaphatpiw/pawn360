import { LiffProvider } from '@/lib/liff/liff-provider';

export default function OfferDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use investor offer-detail LIFF ID
  // IMPORTANT: Create LIFF app in INVESTOR channel (2008641309) with endpoint https://pawn360.vercel.app/offer-detail
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_OFFER_DETAIL || 'CREATE_NEW_LIFF_APP';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
