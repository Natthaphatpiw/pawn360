import { redirect } from 'next/navigation';

export default async function LegacyIncreasePrincipalPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const { contractId } = await params;
  redirect(`/contracts/${encodeURIComponent(contractId)}/principal-increase`);
}
