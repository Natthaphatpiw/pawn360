/**
 * The date window for a contract that replaces one being renewed.
 *
 * There were three copies of this - in contract-actions/calculate, /create and
 * /complete - and they all restarted the term from tomorrow regardless of when
 * the old one ended. That quietly ate time the pawner had already paid for:
 * renewing on day 2 of a 30-day contract bought a full month of interest and
 * moved the due date out by ONE day.
 *
 * A renewal continues the borrowing, so the new term begins the day after the
 * old one finishes. Someone renewing late does not get a back-dated term, so
 * the start is whichever of (day after the old end) and (tomorrow) is later.
 *
 * Three copies also meant the quote, the request and the contract could each
 * compute a different due date - the pawner could be shown one date and given
 * another. One implementation removes that class of drift.
 */

const MAX_DURATION_DAYS = 3_650;

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export interface RenewedContractWindow {
  contractStartDate: Date;
  contractEndDate: Date;
}

export function getRenewedContractWindow(
  durationDays: number,
  previousEndDate?: Date | string | null,
): RenewedContractWindow {
  const normalizedDuration = Math.max(1, Math.min(Math.round(durationDays), MAX_DURATION_DAYS));

  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  ));

  const previous = previousEndDate ? new Date(previousEndDate) : null;
  const dayAfterPrevious = previous && Number.isFinite(previous.getTime())
    ? addUtcDays(
      new Date(Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth(), previous.getUTCDate())),
      1,
    )
    : null;

  const contractStartDate = dayAfterPrevious && dayAfterPrevious.getTime() > tomorrow.getTime()
    ? dayAfterPrevious
    : tomorrow;

  return {
    contractStartDate,
    contractEndDate: addUtcDays(contractStartDate, normalizedDuration - 1),
  };
}
