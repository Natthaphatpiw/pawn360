import { redirect } from 'next/navigation';

export default async function LegacyContractPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const [{ contractId }, query] = await Promise.all([params, searchParams]);
  const safeId = encodeURIComponent(contractId);
  const destination = query.action === 'reduce'
    ? `/contracts/${safeId}/principal-reduction`
    : query.action === 'redeem'
      ? `/contracts/${safeId}/redeem`
      : `/contracts/${safeId}/interest-payment`;
  redirect(destination);
}
