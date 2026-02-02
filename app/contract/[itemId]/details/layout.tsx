import { LiffProvider } from '@/lib/liff/liff-provider';
import { Noto_Sans_Thai } from 'next/font/google';
import type { Metadata } from 'next';

const sarabun = Noto_Sans_Thai({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'รายละเอียด',
};

export default function ContractDetailsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = '2008216710-gn6BwQjo';
  return <LiffProvider liffId={liffId}><div className={`${sarabun.className}`}>{children}</div></LiffProvider>;
}
