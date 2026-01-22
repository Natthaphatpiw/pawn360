import { LiffProvider } from '@/lib/liff/liff-provider';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'รายการบันทึก',
};

export default function SavedItemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '2008216710-54P86MRY';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
