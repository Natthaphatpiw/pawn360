import { LiffProvider } from '@/lib/liff/liff-provider';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'จุดรับฝาก',
};

export default function DropPointLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Drop Point list/detail LIFF
  // Endpoint: https://pawnly.io/drop-point
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_LIST || '2008651088-6wNs8Yrr';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
