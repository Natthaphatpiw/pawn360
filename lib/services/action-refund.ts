/**
 * Refunds owed to a pawner when a paid contract-action request is rejected.
 *
 * The only case today is เพิ่มเงินต้น: the pawner pays interest + platform fee
 * to the company account, and only then does the investor see the request. An
 * investor rejection leaves the contract row completely untouched - same
 * start date, same end date, same principal - so the next action recomputes and
 * bills the identical interest, the identical full-term fee and the identical
 * late charges. Keeping any of it would be charging for those days twice while
 * the pawner received nothing.
 *
 * The refund is recorded as an obligation, not executed. There is no outbound
 * payment rail in this system; every money-out event is a human bank transfer
 * evidenced by an uploaded slip. Every user-facing string must therefore say a
 * person will transfer the money, never that the system already has.
 */

/** Business days quoted to the pawner, and shown in the UI. One source. */
export const REFUND_SLA_BUSINESS_DAYS = 3;

export const REFUND_REJECTED_INCREASE_REASON =
  'นักลงทุนปฏิเสธคำขอเพิ่มเงินต้นหลังชำระเงินแล้ว';

export const SUPPORT_PHONE = '0626092941';

export type RefundStatus = 'NOT_REQUIRED' | 'PENDING' | 'PAID' | 'CANCELLED';

/**
 * Derived from request_id so a retried rejection cannot mint a second payout
 * record - the unique index on refund_reference rejects the duplicate. Must
 * stay byte-identical to the backfill expression in
 * 2026_08_05_add_action_request_refund.sql.
 */
export const buildRefundReference = (requestId: string) => (
  `RFD-${requestId.replace(/-/g, '').slice(0, 20).toUpperCase()}`
);

export const roundRefund = (value: number) => Math.round(value * 100) / 100;

/**
 * What verify-slip actually collected, using its own expression
 * (`total_amount > 0 ? total_amount : interest_for_period`) so refunded equals
 * collected by construction, including for legacy rows where total_amount is
 * null.
 */
export const collectedAmountFor = (actionRequest: {
  total_amount?: number | string | null;
  interest_for_period?: number | string | null;
}) => roundRefund(
  Number(actionRequest.total_amount || 0) || Number(actionRequest.interest_for_period || 0),
);

/**
 * Whether money actually arrived. Tested on the SLIP rather than the request
 * status: the slip is the evidence, and it stays correct if another paid status
 * is ever added upstream.
 */
export const wasPaidByPawner = (actionRequest: {
  slip_verification_result?: string | null;
  slip_url?: string | null;
  total_amount?: number | string | null;
  interest_for_period?: number | string | null;
}) => (
  actionRequest.slip_verification_result === 'MATCHED'
  && !!actionRequest.slip_url
  && collectedAmountFor(actionRequest) > 0
);

/** Last four digits only - a full account number never belongs on a screen. */
export const maskAccountNo = (accountNo?: string | null) => {
  const digits = String(accountNo || '').replace(/\D/g, '');
  if (!digits) return '';
  return `•••${digits.slice(-4)}`;
};

export const formatRefundDestination = (params: {
  bankName?: string | null;
  accountNo?: string | null;
}) => {
  const masked = maskAccountNo(params.accountNo);
  if (!params.bankName && !masked) return '';
  return [params.bankName, masked].filter(Boolean).join(' ');
};
