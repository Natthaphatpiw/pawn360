import { LiffProvider } from '@/lib/liff/liff-provider';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default function DropPointDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_DASHBOARD
    || process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_LIST
    || '2008651088-6wNs8Yrr';

  return (
    <LiffProvider liffId={liffId}>
      <div className="theme-liff theme-droppoint page-droppoint min-h-screen bg-background-white">{children}</div>
    </LiffProvider>
  );
}
