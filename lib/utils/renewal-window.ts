/**
 * The date window for a contract that replaces one being renewed.
 *
 * A renewal resets the clock from the day the pawner pays. They settle the
 * interest for the days actually used - 3 Aug to 10 Aug if they renew on the
 * 10th - and the replacement contract then runs its own full term from that
 * day. Unused days from the old term are not carried over, because they were
 * never paid for.
 *
 *   old term   3 Aug -> 2 Sep, renewed on 10 Aug
 *   interest   3 Aug -> 10 Aug (the days used)
 *   new term   10 Aug -> 9 Sep (a full term from the payment date)
 *
 * This deliberately matches how a first contract is dated in
 * /api/contracts/create - start today at UTC midnight, end start + duration
 * days - so an original and a renewed contract of the same length are the same
 * length. Renewal previously started from TOMORROW and ended a day short, which
 * made every renewed term differ from an original one by a day at each end.
 *
 * There were three copies of this logic (calculate, create, complete). Three
 * copies means the quote, the request and the resulting contract can each
 * produce a different due date, so the pawner can be shown one and given
 * another. One implementation removes that.
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

/**
 * @param durationDays term length of the replacement contract
 * @param _previousEndDate accepted for call-site symmetry and ignored: the new
 *        term starts from the payment date, not from where the old one ended.
 */
export function getRenewedContractWindow(
  durationDays: number,
  _previousEndDate?: Date | string | null,
): RenewedContractWindow {
  const normalizedDuration = Math.max(1, Math.min(Math.round(durationDays), MAX_DURATION_DAYS));

  const now = new Date();
  const contractStartDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));

  return {
    contractStartDate,
    contractEndDate: addUtcDays(contractStartDate, normalizedDuration),
  };
}
