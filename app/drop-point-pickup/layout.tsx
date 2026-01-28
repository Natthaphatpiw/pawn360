import { LiffProvider } from '@/lib/liff/liff-provider';

export default function DropPointPickupLayout({ children }: { children: React.ReactNode }) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_PICKUP || '2008651088-cx00A4cZ';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
