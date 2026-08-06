'use client';

/**
 * The itemised amount shown on every pawner payment-proof screen.
 *
 * All three transaction types (ต่อดอก / ลดต้น / ไถ่ถอน) render this same
 * component so the figures cannot drift between screens. The rule it enforces
 * is that the rows must visibly add up to the total: when a late charge is part
 * of the total it is always shown, even at zero once the contract is overdue,
 * so the pawner never sees a total that is larger than the lines above it.
 */

export interface PaymentBreakdownSource {
  total_amount?: number | string | null;
  base_amount?: number | string | null;
  penalty_amount?: number | string | null;
  overdue_interest_amount?: number | string | null;
  payment_breakdown?: {
    baseAmount?: number | string | null;
    penaltyAmount?: number | string | null;
    overdueInterestAmount?: number | string | null;
    totalAmount?: number | string | null;
    daysOverdue?: number | string | null;
    penaltyMonths?: number | string | null;
  } | null;
}

const toNumber = (...values: Array<number | string | null | undefined>): number => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const money = (value: number) => value.toLocaleString('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function getPaymentBreakdown(
  source: PaymentBreakdownSource | null | undefined,
  baseFallback?: number | string | null,
) {
  const breakdown = source?.payment_breakdown ?? null;
  const baseAmount = toNumber(source?.base_amount, breakdown?.baseAmount, baseFallback);
  const penaltyAmount = toNumber(source?.penalty_amount, breakdown?.penaltyAmount);
  const overdueInterestAmount = toNumber(
    source?.overdue_interest_amount,
    breakdown?.overdueInterestAmount,
  );
  const totalAmount = toNumber(source?.total_amount, breakdown?.totalAmount);
  const penaltyMonths = toNumber(breakdown?.penaltyMonths);
  const daysOverdue = toNumber(breakdown?.daysOverdue);
  const lateChargeTotal = Math.round((penaltyAmount + overdueInterestAmount) * 100) / 100;
  // A total that exceeds the lines above it is what the pawner reads as an
  // unexplained increase, so surface any residual instead of hiding it.
  const unexplained = Math.round((totalAmount - baseAmount - lateChargeTotal) * 100) / 100;

  return {
    baseAmount,
    penaltyAmount,
    overdueInterestAmount,
    totalAmount,
    penaltyMonths,
    daysOverdue,
    lateChargeTotal,
    hasLateCharge: lateChargeTotal > 0 || daysOverdue > 0,
    unexplained: Math.abs(unexplained) >= 0.01 ? unexplained : 0,
  };
}

export default function PaymentBreakdown({
  source,
  baseLabel,
  baseFallback,
  totalLabel = 'ยอดที่ต้องชำระ',
  footer,
}: {
  source: PaymentBreakdownSource | null | undefined;
  baseLabel: string;
  baseFallback?: number | string | null;
  totalLabel?: string;
  footer?: React.ReactNode;
}) {
  const b = getPaymentBreakdown(source, baseFallback);

  return (
    <div className="w-full max-w-sm bg-background rounded-xl p-4 mb-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-foreground-subtle text-sm">{baseLabel}:</span>
        <span className="font-medium text-foreground">{money(b.baseAmount)} บาท</span>
      </div>

      {b.hasLateCharge && (
        <>
          <div className="flex justify-between items-center mb-2">
            <span className="text-foreground-subtle text-sm">ค่าปรับเกินกำหนด:</span>
            <span className="font-medium text-primary">{money(b.penaltyAmount)} บาท</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-foreground-subtle text-sm">
              ดอกเบี้ยเลท (3%/เดือน{b.penaltyMonths > 0 ? ` x ${b.penaltyMonths} เดือน` : ''}):
            </span>
            <span className="font-medium text-primary">{money(b.overdueInterestAmount)} บาท</span>
          </div>
          {b.daysOverdue > 0 && (
            <p className="mb-2 text-xs text-foreground-subtle">
              เกินกำหนดแล้ว {b.daysOverdue} วัน คิดค่าปรับวันละ 100 บาท และดอกเบี้ยเลท 3%/เดือน
            </p>
          )}
        </>
      )}

      {b.unexplained !== 0 && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-foreground-subtle text-sm">รายการปรับปรุงอื่น:</span>
          <span className="font-medium text-foreground">{money(b.unexplained)} บาท</span>
        </div>
      )}

      <div className="flex justify-between items-center border-t border-primary-border pt-2">
        <span className="text-foreground-subtle text-sm">{totalLabel}:</span>
        <span className="font-bold text-primary text-lg">{money(b.totalAmount)} บาท</span>
      </div>

      {footer}
    </div>
  );
}
