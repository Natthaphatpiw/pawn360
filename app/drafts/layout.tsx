import { LiffProvider } from '@/lib/liff/liff-provider';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'บันทึกชั่วคราว',
};

export default function DraftsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_PAWN || '2008216710-54P86MRY';
  return (
    <LiffProvider liffId={liffId}>
      <div className="theme-liff page-neutral">{children}</div>
    </LiffProvider>
  );
}
