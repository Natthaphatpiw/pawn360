const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const PENALTY_PER_DAY = 100;

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

export const getPenaltyRequirement = async (supabase: any, contract: any) => {
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
