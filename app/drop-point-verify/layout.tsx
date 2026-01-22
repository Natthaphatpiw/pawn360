import { LiffProvider } from '@/lib/liff/liff-provider';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ตรวจสอบสินค้า',
};

export default function DropPointVerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Drop Point Verification LIFF ID
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_VERIFY || '2008651088-m9yMlA7Q';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
