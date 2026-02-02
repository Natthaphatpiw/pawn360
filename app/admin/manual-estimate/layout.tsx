import { LiffProvider } from '@/lib/liff/liff-provider';
import { Noto_Sans_Thai } from 'next/font/google';
import type { Metadata } from 'next';

const sarabun = Noto_Sans_Thai({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Manual Estimate',
};

export default function ManualEstimateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_ADMIN_ESTIMATE || '2008954664-Wan1WlHX';
  return <LiffProvider liffId={liffId}><div className={`${sarabun.className}`}>{children}</div></LiffProvider>;
}
