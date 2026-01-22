import { LiffProvider } from '@/lib/liff/liff-provider';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'รายละเอียด',
};

export const dynamic = 'force-dynamic';

export default function OfferDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Investor offer-detail LIFF ID
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_OFFER_DETAIL || '2008641671-K7EWDk81';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
