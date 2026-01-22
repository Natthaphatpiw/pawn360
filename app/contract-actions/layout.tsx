import { LiffProvider } from '@/lib/liff/liff-provider';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ทำรายการ',
};

export default function ContractActionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_CONTRACTS || '2008216710-WJXR6xOM';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
