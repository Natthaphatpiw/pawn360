import { LiffProvider } from '@/lib/liff/liff-provider';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ส่งคืนสินค้า',
};

export default function DropPointReturnsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Drop Point returns LIFF
  // Endpoint: https://pawnly.io/drop-point-returns
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_RETURN || '2008651088-fsjSpdo9';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
