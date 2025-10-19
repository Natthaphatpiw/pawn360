import { LiffProvider } from '@/lib/liff/liff-provider';
import { Sarabun } from 'next/font/google';

const sarabun = Sarabun({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export default function StoreContractLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_STORE || '2008216710-de1ovYZL';
  return <LiffProvider liffId={liffId}><div className={`${sarabun.className}`}>{children}</div></LiffProvider>;
}
