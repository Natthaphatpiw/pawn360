import { LiffProvider } from '@/lib/liff/liff-provider';

export const dynamic = 'force-dynamic';

export default function DropPointLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Drop Point list/detail LIFF
  // Endpoint: https://pawn360.vercel.app/drop-point
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_LIST || '2008651088-6wNs8Yrr';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
