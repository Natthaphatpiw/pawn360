import { LiffProvider } from '@/lib/liff/liff-provider';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'อนุมัติคำขอเพิ่มเงินต้น',
  description: 'ดูรายละเอียดและอนุมัติคำขอเพิ่มเงินต้น',
};

// LIFF ID = 2008641671-ejsAmBXx
const liffId = process.env.NEXT_PUBLIC_LIFF_ID_INVEST_PRINCIPAL_INCREASE || '2008641671-ejsAmBXx';

export default function InvestorPrincipalIncreaseRequestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
