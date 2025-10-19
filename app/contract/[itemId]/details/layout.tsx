import { LiffProvider } from '@/lib/liff/liff-provider';
import { Sarabun } from 'next/font/google';

const sarabun = Sarabun({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export default function ContractDetailsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = '2008216710-gn6BwQjo';
  return <LiffProvider liffId={liffId}><div className={`${sarabun.className}`}>{children}</div></LiffProvider>;
}
