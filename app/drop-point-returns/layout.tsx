import { LiffProvider } from '@/lib/liff/liff-provider';

export const dynamic = 'force-dynamic';

export default function DropPointReturnsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Drop Point returns LIFF
  // Endpoint: https://pawn360.vercel.app/drop-point-returns
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_RETURN || '2008651088-fsjSpdo9';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
