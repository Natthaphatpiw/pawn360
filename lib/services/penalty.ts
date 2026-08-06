import { MS_PER_DAY } from '@/lib/utils/time';

const DAYS_PER_PENALTY_MONTH = 30;
const OVERDUE_INTEREST_PER_MONTH = 0.03;

/**
 * Overdue penalty, charged per calendar day late.
 *
 * It had become a flat charge per STARTED 30-day month
 * (`Math.ceil(daysOverdue / 30) * 50`), so a pawner one day late owed a whole
 * month and a pawner 31 days late owed two. Charging by the day removes that
 * cliff and restores the rate the product has been telling pawners all along:
 * the penalty-payment screen already printed "ค่าปรับวันละ 100 บาท" beside a
 * total computed from the 50-a-month ladder, so the two never agreed.
 *
 * Changing this constant changes what pawners owe. The rate is stated in the
 * pre-contract terms they accept (app/estimate/contract-agreement-step.tsx),
 * on every quote screen, and in the overdue LINE reminder - all of which now
 * render it from here rather than repeating a literal.
 */
export const PENALTY_PER_DAY = 100;
export const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export interface PenaltyRequirement {
  /**
   * The flat penalty ladder is unpaid for today. This says NOTHING about the
   * overdue interest, which the penalty slip never collects - read
   * `overdueInterestDue` for that.
   */
  required: boolean;
  daysOverdue: number;
  penaltyAmount: number;
  overdueInterestAmount: number;
  totalLateChargeAmount: number;
  /**
   * What to actually bill, with each component suppressed only if it was
   * genuinely paid.
   *
   * Callers used to write `required ? penaltyAmount : 0` AND
   * `required ? overdueInterestAmount : 0`, which let a pawner escape all the
   * overdue interest by paying the small flat penalty: the standalone penalty
   * slip only ever charges `penalty_amount` (the 50 THB/month ladder), but
   * verifying it sets paid_through_date = today, which flipped `required` to
   * false and zeroed the 3%/month overdue interest along with it. On a contract
   * 61 days overdue at 5,000 principal that is 150 THB paid to avoid 297.58 THB
   * owed - repeatable, because `required` re-arms the next day.
   */
  penaltyDue: number;
  overdueInterestDue: number;
  totalLateChargeDue: number;
  /** Overdue days not yet covered by a verified penalty payment. */
  unpaidDays: number;
  today: Date;
  contractStartDate: Date;
  contractEndDate: Date;
  paidThroughDate: Date | null;
}

export interface FrozenLateChargeBreakdown {
  totalAmount: number;
  penaltyAmount: number;
  overdueInterestAmount: number;
  totalLateChargeAmount: number;
  daysOverdue: number;
  requestDate: Date;
  hasStoredBreakdown: boolean;
}

export const normalizeDate = (value: Date | string) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const toDateString = (value: Date | string) => (
  normalizeDate(value).toISOString().split('T')[0]
);

export const calculateOverdueDays = (contractEndDate: Date | string, today: Date = new Date()) => {
  const endDate = normalizeDate(contractEndDate);
  const currentDate = normalizeDate(today);
  const diffDays = Math.floor((currentDate.getTime() - endDate.getTime()) / MS_PER_DAY);
  return Math.max(0, diffDays);
};

export const calculatePenaltyAmount = (daysOverdue: number) => (
  roundCurrency(Math.max(0, daysOverdue) * PENALTY_PER_DAY)
);

/**
 * Months used to LABEL the overdue interest, which really is charged per
 * started 30-day month ("ดอกเบี้ยเลท 3%/เดือน x N เดือน"). Despite the name it
 * no longer describes the penalty, which is now per day - the name is kept
 * because it is serialized as `penaltyMonths` and stored in
 * redemption_requests.penalty_months.
 */
export const calculatePenaltyMonths = (daysOverdue: number) => (
  Math.max(0, Math.ceil(Math.max(0, daysOverdue) / DAYS_PER_PENALTY_MONTH))
);

export const getFrozenLateChargeBreakdown = (
  actionRequest: any,
  contract: any,
  baseAmount: number,
): FrozenLateChargeBreakdown => {
  const totalAmount = roundCurrency(
    Number(actionRequest?.total_amount || 0) > 0
      ? Number(actionRequest.total_amount)
      : baseAmount
  );
  const totalLateChargeAmount = Math.max(
    0,
    roundCurrency(totalAmount - baseAmount)
  );
  const requestDate = normalizeDate(actionRequest?.created_at || new Date());
  const daysOverdue = calculateOverdueDays(contract.contract_end_date, requestDate);
  const hasStoredBreakdown = actionRequest?.overdue_interest_amount !== null
    && actionRequest?.overdue_interest_amount !== undefined;

  if (hasStoredBreakdown) {
    const overdueInterestAmount = Math.min(
      totalLateChargeAmount,
      Math.max(0, roundCurrency(Number(actionRequest.overdue_interest_amount || 0)))
    );

    return {
      totalAmount,
      penaltyAmount: Math.max(
        0,
        roundCurrency(totalLateChargeAmount - overdueInterestAmount)
      ),
      overdueInterestAmount,
      totalLateChargeAmount,
      daysOverdue,
      requestDate,
      hasStoredBreakdown,
    };
  }

  // Legacy requests predate the overdue-interest snapshot. Preserve their
  // frozen total, derive the flat penalty from the request date, and treat the
  // remainder as overdue interest instead of mislabeling it all as a penalty.
  const penaltyAmount = Math.min(
    totalLateChargeAmount,
    calculatePenaltyAmount(daysOverdue)
  );

  return {
    totalAmount,
    penaltyAmount,
    overdueInterestAmount: Math.max(
      0,
      roundCurrency(totalLateChargeAmount - penaltyAmount)
    ),
    totalLateChargeAmount,
    daysOverdue,
    requestDate,
    hasStoredBreakdown,
  };
};

export const calculateOverdueInterestAmount = (
  principalAmount: number,
  contractEndDate: Date | string,
  today: Date = new Date(),
) => {
  const principal = Math.max(0, Number(principalAmount || 0));
  if (principal <= 0) return 0;

  const overdueStart = normalizeDate(contractEndDate);
  overdueStart.setDate(overdueStart.getDate() + 1);

  const currentDate = normalizeDate(today);
  if (currentDate.getTime() < overdueStart.getTime()) {
    return 0;
  }

  let total = 0;
  const cursor = new Date(overdueStart);
  while (cursor.getTime() <= currentDate.getTime()) {
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    total += (principal * OVERDUE_INTEREST_PER_MONTH) / daysInMonth;
    cursor.setDate(cursor.getDate() + 1);
  }

  return roundCurrency(total);
};

export const buildPenaltyLiffUrl = (contractId?: string) => {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_PENALTY_PAYMENT || '2008216710-Z54fuL3s';
  const url = new URL(`https://liff.line.me/${liffId}`);
  if (contractId) {
    url.searchParams.set('contractId', contractId);
  }
  return url.toString();
};

export const serializePenaltyRequirement = (contract: any, requirement: PenaltyRequirement) => ({
  contractId: contract.contract_id,
  contractNumber: contract.contract_number,
  contractStartDate: requirement.contractStartDate.toISOString(),
  contractEndDate: requirement.contractEndDate.toISOString(),
  today: requirement.today.toISOString(),
  daysOverdue: requirement.daysOverdue,
  // Labels the OVERDUE INTEREST, which is billed per started 30-day month, so
  // the UI can state "3%/เดือน x N เดือน" instead of an unexplained lump sum.
  // The penalty itself is per day - see penaltyPerDay.
  penaltyMonths: calculatePenaltyMonths(requirement.daysOverdue),
  // Sent so screens can show "ค่าปรับวันละ X บาท" from the engine instead of a
  // hard-coded figure. The penalty LIFF printed "100 บาท" for a rate that had
  // not been 100 for some time, right above a total that never matched it.
  penaltyPerDay: roundCurrency(PENALTY_PER_DAY),
  penaltyAmount: requirement.penaltyAmount,
  penaltyDue: requirement.penaltyDue,
  unpaidDays: requirement.unpaidDays,
  overdueInterestAmount: requirement.overdueInterestAmount,
  totalLateChargeAmount: requirement.totalLateChargeAmount,
  paidThroughDate: requirement.paidThroughDate?.toISOString() ?? null,
});

export const getPenaltyRequirement = async (supabase: any, contract: any): Promise<PenaltyRequirement> => {
  const today = normalizeDate(new Date());
  const contractStartDate = normalizeDate(contract.contract_start_date);
  const contractEndDate = normalizeDate(contract.contract_end_date);
  const daysOverdue = calculateOverdueDays(contractEndDate, today);
  const currentPrincipal = Number(contract.current_principal_amount || contract.loan_principal_amount || 0);
  const penaltyAmount = calculatePenaltyAmount(daysOverdue);
  const overdueInterestAmount = calculateOverdueInterestAmount(currentPrincipal, contractEndDate, today);
  const totalLateChargeAmount = roundCurrency(penaltyAmount + overdueInterestAmount);

  if (daysOverdue <= 0) {
    return {
      required: false,
      daysOverdue,
      penaltyAmount,
      overdueInterestAmount,
      totalLateChargeAmount,
      penaltyDue: 0,
      overdueInterestDue: 0,
      totalLateChargeDue: 0,
      unpaidDays: 0,
      today,
      contractStartDate,
      contractEndDate,
      paidThroughDate: null,
    };
  }

  const { data, error } = await supabase
    .from('penalty_payments')
    .select('paid_through_date')
    .eq('contract_id', contract.contract_id)
    .eq('status', 'VERIFIED')
    .order('paid_through_date', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const latest = Array.isArray(data) ? data[0] : null;
  const paidThroughDate = latest?.paid_through_date
    ? normalizeDate(latest.paid_through_date)
    : null;

  // Now that the penalty accrues per day, a payment can settle the days it
  // covered instead of merely muting the whole running total for one day. The
  // old all-or-nothing rule meant a pawner who paid still saw the entire
  // cumulative penalty re-appear the next morning - paying never reduced the
  // debt, it only postponed it by a day.
  const paidDays = paidThroughDate
    ? Math.min(daysOverdue, calculateOverdueDays(contractEndDate, paidThroughDate))
    : 0;
  const unpaidDays = Math.max(0, daysOverdue - paidDays);

  // A verified penalty payment covers the penalty and only the penalty:
  // penalties/verify-slip bills `payment.penalty_amount`, and the ledger writers
  // record only the penalty. The overdue interest is never part of that slip,
  // so it stays due.
  const penaltyDue = roundCurrency(unpaidDays * PENALTY_PER_DAY);
  const overdueInterestDue = overdueInterestAmount;

  return {
    required: unpaidDays > 0,
    daysOverdue,
    penaltyAmount,
    overdueInterestAmount,
    totalLateChargeAmount,
    penaltyDue,
    overdueInterestDue,
    totalLateChargeDue: roundCurrency(penaltyDue + overdueInterestDue),
    unpaidDays,
    today,
    contractStartDate,
    contractEndDate,
    paidThroughDate,
  };
};

export const ensurePenaltyPaymentRecord = async (
  supabase: any,
  contract: any,
  requirement: PenaltyRequirement,
) => {
  if (requirement.daysOverdue <= 0 || !requirement.required) {
    return null;
  }

  const penaltyDate = toDateString(requirement.today);
  const { data: existingPayments, error: existingError } = await supabase
    .from('penalty_payments')
    .select('*')
    .eq('contract_id', contract.contract_id)
    .eq('penalty_date', penaltyDate)
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingError) {
    throw existingError;
  }

  const existing = Array.isArray(existingPayments) ? existingPayments[0] : null;
  if (existing) {
    return existing;
  }

  const nowIso = new Date().toISOString();
  const { data: created, error: createError } = await supabase
    .from('penalty_payments')
    .insert({
      contract_id: contract.contract_id,
      customer_id: contract.customer_id,
      investor_id: contract.investor_id,
      penalty_date: penaltyDate,
      // What is actually being collected: the days not already covered by an
      // earlier verified payment, not the whole running total since the
      // contract ended. Billing the cumulative figure made a pawner who had
      // already paid once pay for those same days again.
      days_overdue: requirement.unpaidDays,
      penalty_amount: requirement.penaltyDue,
      status: 'PENDING',
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select()
    .single();

  if (createError) {
    // The production integrity migration enforces one ledger per
    // (contract_id, penalty_date). A concurrent creator is an idempotent race,
    // not a server failure: read and reuse the winning record.
    if (createError.code === '23505') {
      const { data: racedPayments, error: racedError } = await supabase
        .from('penalty_payments')
        .select('*')
        .eq('contract_id', contract.contract_id)
        .eq('penalty_date', penaltyDate)
        .order('created_at', { ascending: false })
        .limit(1);
      if (racedError) throw racedError;
      const raced = Array.isArray(racedPayments) ? racedPayments[0] : null;
      if (raced) return raced;
    }
    throw createError;
  }

  return created;
};

export const markPenaltyPaymentVerified = async (
  supabase: any,
  contract: any,
  requirement: PenaltyRequirement,
  payload: {
    slipUrl: string;
    detectedAmount?: number | null;
    verificationResult?: string | null;
    verificationDetails?: any;
    attemptCount?: number | null;
  },
) => {
  if (requirement.daysOverdue <= 0 || !requirement.required) {
    return null;
  }

  const record = await ensurePenaltyPaymentRecord(supabase, contract, requirement);
  if (!record?.penalty_id) {
    return null;
  }

  const nowIso = new Date().toISOString();
  // The payment covers the days the QUOTE covered, which is the row's own
  // penalty_date - not whatever day verification happened to complete on.
  // Stamping today would hand the pawner every day between the two for free.
  const paidThroughDate = toDateString(record.penalty_date || requirement.today);
  const { data: updated, error: updateError } = await supabase
    .from('penalty_payments')
    .update({
      status: 'VERIFIED',
      // Keep whatever the PENDING row was created with - that is the figure the
      // pawner was quoted and transferred. Overwriting it with a requirement
      // recomputed at verification time made the ledger disagree with the slip
      // whenever verification landed on a later day than the quote.
      penalty_amount: record.penalty_amount ?? requirement.penaltyDue,
      days_overdue: record.days_overdue ?? requirement.unpaidDays,
      slip_url: payload.slipUrl,
      slip_uploaded_at: nowIso,
      slip_amount_detected: payload.detectedAmount ?? null,
      slip_verification_result: payload.verificationResult ?? 'MATCHED',
      slip_verification_details: payload.verificationDetails ?? null,
      slip_attempt_count: payload.attemptCount ?? record.slip_attempt_count ?? 1,
      verified_at: nowIso,
      paid_through_date: paidThroughDate,
      updated_at: nowIso,
    })
    .eq('penalty_id', record.penalty_id)
    .select()
    .single();

  if (updateError) {
    throw updateError;
  }

  return updated;
};
