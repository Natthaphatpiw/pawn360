import { LiffProvider } from '@/lib/liff/liff-provider';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ลงทะเบียน',
};

export const dynamic = 'force-dynamic';

export default function RegisterDropPointLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Drop Point LINE Login LIFF ID
  // Channel ID = 2008651088, LIFF ID = 2008651088-Ajw69zLb
  // Endpoint: https://pawnly.io/register-droppoint
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT || '2008651088-Ajw69zLb';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
