import { LiffProvider } from '@/lib/liff/liff-provider';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ชำระค่าปรับ',
};

export default function PenaltyPaymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_PENALTY_PAYMENT || '2008216710-Z54fuL3s';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
