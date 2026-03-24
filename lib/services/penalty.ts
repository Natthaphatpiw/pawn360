const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const PENALTY_PER_DAY = 100;
export const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export interface PenaltyRequirement {
  required: boolean;
  daysOverdue: number;
  penaltyAmount: number;
  today: Date;
  contractStartDate: Date;
  contractEndDate: Date;
  paidThroughDate: Date | null;
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
  Math.max(0, daysOverdue) * PENALTY_PER_DAY
);

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
  penaltyAmount: requirement.penaltyAmount,
  paidThroughDate: requirement.paidThroughDate?.toISOString() ?? null,
});

export const getPenaltyRequirement = async (supabase: any, contract: any): Promise<PenaltyRequirement> => {
  const today = normalizeDate(new Date());
  const contractStartDate = normalizeDate(contract.contract_start_date);
  const contractEndDate = normalizeDate(contract.contract_end_date);
  const daysOverdue = calculateOverdueDays(contractEndDate, today);
  const penaltyAmount = calculatePenaltyAmount(daysOverdue);

  if (daysOverdue <= 0) {
    return {
      required: false,
      daysOverdue,
      penaltyAmount,
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

  const isPaid = paidThroughDate
    ? paidThroughDate.getTime() >= today.getTime()
    : false;

  return {
    required: !isPaid,
    daysOverdue,
    penaltyAmount,
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
      days_overdue: requirement.daysOverdue,
      penalty_amount: requirement.penaltyAmount,
      status: 'PENDING',
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select()
    .single();

  if (createError) {
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
  const paidThroughDate = toDateString(requirement.today);
  const { data: updated, error: updateError } = await supabase
    .from('penalty_payments')
    .update({
      status: 'VERIFIED',
      penalty_amount: requirement.penaltyAmount,
      days_overdue: requirement.daysOverdue,
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
