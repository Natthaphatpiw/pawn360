import { LiffProvider } from '@/lib/liff/liff-provider';

export const dynamic = 'force-dynamic';

export default function DropPointHistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Drop Point history LIFF
  // Endpoint: https://pawn360.vercel.app/drop-point-history
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_HISTORY || '2008651088-97dWJEQB';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
