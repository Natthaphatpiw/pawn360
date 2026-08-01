// Shared time constants.
export const MS_PER_DAY = 1000 * 60 * 60 * 24;

const atLocalMidnight = (value: Date | string) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Days left on a contract's own term, for display.
 *
 * A renewal starts when the previous term ends, so a contract created today can
 * have a start date days or weeks in the future (see the contract-action
 * confirm-received flow). Counting `end - today` in that window adds the unused
 * tail of the previous term to the new one - a 30-day renewal taken with 9 days
 * left reads as 39. Capping at the contract's own duration makes the number
 * restart at the full term and then count down to zero exactly on the due date,
 * without changing any stored date.
 *
 * Overdue contracts keep their negative value so callers can still classify
 * "ครบกำหนด" / "เกินกำหนด" from the same number.
 */
export function getContractRemainingDays(contract: {
  contract_end_date: Date | string;
  contract_start_date?: Date | string | null;
  contract_duration_days?: number | string | null;
}): number {
  const today = atLocalMidnight(new Date());
  const endDate = atLocalMidnight(contract.contract_end_date);
  const elapsedBased = Math.ceil((endDate.getTime() - today.getTime()) / MS_PER_DAY);

  const declaredDuration = Number(contract.contract_duration_days || 0);
  const derivedDuration = contract.contract_start_date
    ? Math.ceil(
      (endDate.getTime() - atLocalMidnight(contract.contract_start_date).getTime()) / MS_PER_DAY,
    )
    : 0;
  const durationDays = declaredDuration > 0
    ? declaredDuration
    : (derivedDuration > 0 ? derivedDuration : 0);

  if (durationDays <= 0) return elapsedBased;
  return Math.min(durationDays, elapsedBased);
}
