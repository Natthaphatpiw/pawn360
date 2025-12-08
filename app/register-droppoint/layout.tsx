import { LiffProvider } from '@/lib/liff/liff-provider';

export const dynamic = 'force-dynamic';

export default function RegisterDropPointLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Drop Point LINE Login LIFF ID
  // Channel ID = 2008651088, LIFF ID = 2008651088-Ajw69zLb
  // Endpoint: https://pawn360.vercel.app/register-droppoint
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT || '2008651088-Ajw69zLb';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
