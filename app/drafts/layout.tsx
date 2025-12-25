import { LiffProvider } from '@/lib/liff/liff-provider';
import { Sarabun } from 'next/font/google';

const sarabun = Sarabun({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export default function DraftsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_PAWN || '2008216710-54P86MRY';
  return <LiffProvider liffId={liffId}><div className={`${sarabun.className}`}>{children}</div></LiffProvider>;
}
