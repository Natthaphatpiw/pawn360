import { supabaseAdmin } from '@/lib/supabase/client';

export type InvestorTier = 'SILVER' | 'GOLD' | 'PLATINUM';

export const INVESTOR_TIER_THRESHOLDS = {
  GOLD: 400_000,
  PLATINUM: 1_000_000,
};

export const INVESTOR_TIER_RATES: Record<InvestorTier, number> = {
  SILVER: 0.015,
  GOLD: 0.0153,
  PLATINUM: 0.016,
};

export function resolveInvestorTier(totalActivePrincipal: number): InvestorTier {
  if (totalActivePrincipal >= INVESTOR_TIER_THRESHOLDS.PLATINUM) return 'PLATINUM';
  if (totalActivePrincipal >= INVESTOR_TIER_THRESHOLDS.GOLD) return 'GOLD';
  return 'SILVER';
}

export function getInvestorRateForTier(tier?: string | null): number {
  if (tier === 'GOLD') return INVESTOR_TIER_RATES.GOLD;
  if (tier === 'PLATINUM') return INVESTOR_TIER_RATES.PLATINUM;
  return INVESTOR_TIER_RATES.SILVER;
}

export function getInvestorRateForContract(contract?: { investor_rate?: number | null; investor_tier?: string | null }) {
  if (contract?.investor_rate && Number.isFinite(contract.investor_rate)) {
    return Number(contract.investor_rate);
  }
  return getInvestorRateForTier(contract?.investor_tier ?? null);
}

export async function refreshInvestorTierAndTotals(investorId: string) {
  const supabase = supabaseAdmin();

  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('loan_principal_amount, contract_status')
    .eq('investor_id', investorId);

  if (error) throw error;

  const activeStatuses = new Set(['ACTIVE', 'CONFIRMED', 'EXTENDED']);
  const totalActivePrincipal = (contracts || []).reduce((sum, contract) => {
    if (!activeStatuses.has(contract.contract_status)) return sum;
    const value = Number(contract.loan_principal_amount || 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const tier = resolveInvestorTier(totalActivePrincipal);

  await supabase
    .from('investors')
    .update({
      total_active_principal: totalActivePrincipal,
      investor_tier: tier,
      updated_at: new Date().toISOString(),
    })
    .eq('investor_id', investorId);

  return { totalActivePrincipal, tier, rate: getInvestorRateForTier(tier) };
}
