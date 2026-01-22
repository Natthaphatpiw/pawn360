import { Sarabun } from 'next/font/google';
import type { Metadata } from 'next';

const sarabun = Sarabun({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'รายละเอียด',
};

export default function ContractInfoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`${sarabun.className}`}>{children}</div>;
}
