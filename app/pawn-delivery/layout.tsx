import { LiffProvider } from '@/lib/liff/liff-provider';

export default function PawnDeliveryLayout({ children }: { children: React.ReactNode }) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_PAWNER_DELIVERY || '2008216710-690r5uXQ';
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
