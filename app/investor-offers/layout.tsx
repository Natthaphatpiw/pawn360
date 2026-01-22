'use client';

import { LiffProvider } from '@/lib/liff/liff-provider';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ข้อเสนอ',
};

export default function InvestorOffersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use the investor offers LIFF ID
  const investorOffersLiffId = process.env.NEXT_PUBLIC_LIFF_ID_INVESTOR_OFFERS || '2008641671-nPVX9OM2';

  return (
    <LiffProvider liffId={investorOffersLiffId}>
      {children}
    </LiffProvider>
  );
}
