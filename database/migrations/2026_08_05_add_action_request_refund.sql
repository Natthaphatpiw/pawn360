-- Record the company's refund obligation when an investor rejects a
-- principal-increase request the pawner has already paid for.
--
-- WHY
-- ---
-- PENDING_INVESTOR_APPROVAL is reachable only from contract-actions/verify-slip
-- on a MATCHED slip, so every investor rejection rejects a request that was
-- already paid. This is not an edge case, it is the only case.
--
-- The rejection handler touches no contract row: contract_start_date,
-- contract_end_date and current_principal_amount are unchanged, so the pawner's
-- next action recomputes the identical accrued interest, the identical
-- full-term platform fee and the identical cumulative late charges. Keeping the
-- money was therefore never "collecting interest owed" - it was collecting it
-- twice, while the pawner received nothing: no increase, no renewal, no reset
-- clock. The full amount collected is refunded.
--
-- WHY NOT A request_status VALUE
-- request_status describes the request, which really is finished and rejected.
-- The refund describes what the company owes afterwards - orthogonal state.
-- Folding it in would either put a refund-pending request into
-- ACTIVE_REQUEST_STATUSES, locking the pawner out of every other contract
-- action until a human finishes a bank transfer, or force a new branch through
-- getResumeStep, by-pawner, the investor list and every status ladder in the UI.
--
-- There is no outbound payment rail in this system. These columns record an
-- obligation and the evidence a human settled it. Nothing here moves money.

BEGIN;

ALTER TABLE public.contract_action_requests
  ADD COLUMN IF NOT EXISTS refund_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_reference VARCHAR(64),
  ADD COLUMN IF NOT EXISTS refund_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_bank_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS refund_bank_account_no VARCHAR(50),
  ADD COLUMN IF NOT EXISTS refund_bank_account_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS refund_slip_url TEXT,
  ADD COLUMN IF NOT EXISTS refund_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_paid_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS refund_cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_cancel_reason TEXT;

ALTER TABLE public.contract_action_requests
  DROP CONSTRAINT IF EXISTS contract_action_requests_refund_status_check;
ALTER TABLE public.contract_action_requests
  ADD CONSTRAINT contract_action_requests_refund_status_check CHECK (
    refund_status IS NULL
    OR refund_status::text IN ('NOT_REQUIRED', 'PENDING', 'PAID', 'CANCELLED')
  );

ALTER TABLE public.contract_action_requests
  DROP CONSTRAINT IF EXISTS contract_action_requests_refund_amount_nonnegative;
ALTER TABLE public.contract_action_requests
  ADD CONSTRAINT contract_action_requests_refund_amount_nonnegative
  CHECK (refund_amount IS NULL OR refund_amount >= 0);

-- A refund marked PAID must carry its evidence. Enforced in the database
-- because the money-out record is the only proof the obligation was met.
ALTER TABLE public.contract_action_requests
  DROP CONSTRAINT IF EXISTS contract_action_requests_refund_paid_evidence;
ALTER TABLE public.contract_action_requests
  ADD CONSTRAINT contract_action_requests_refund_paid_evidence CHECK (
    refund_status IS DISTINCT FROM 'PAID'
    OR (refund_slip_url IS NOT NULL AND refund_paid_at IS NOT NULL AND refund_amount IS NOT NULL)
  );

-- The operator queue: outstanding obligations, oldest first.
CREATE INDEX IF NOT EXISTS idx_contract_action_requests_refund_pending
  ON public.contract_action_requests (refund_due_at)
  WHERE refund_status = 'PENDING';

-- One refund per request. The reference is derived from request_id, so a
-- retried rejection cannot mint a second payout record.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_action_requests_refund_reference
  ON public.contract_action_requests (refund_reference)
  WHERE refund_reference IS NOT NULL;

COMMENT ON COLUMN public.contract_action_requests.refund_status IS
  'Company obligation to return money already collected. Orthogonal to request_status, which stays INVESTOR_REJECTED. NULL = row predates refunds.';
COMMENT ON COLUMN public.contract_action_requests.refund_amount IS
  'Exactly what verify-slip collected: total_amount when > 0, else interest_for_period. Never recomputed from a live breakdown.';
COMMENT ON COLUMN public.contract_action_requests.refund_bank_account_no IS
  'Destination frozen at rejection time so a later edit to the pawners row cannot redirect an outstanding refund.';
COMMENT ON COLUMN public.contract_action_requests.refund_slip_url IS
  'Operator-uploaded proof of the outbound bank transfer. There is no automated payout rail; a human sends the money.';

-- contract_action_logs.action_type is a closed CHECK. Without these values the
-- refund audit rows are silently rejected on insert.
ALTER TABLE public.contract_action_logs
  DROP CONSTRAINT IF EXISTS contract_action_logs_action_type_check;
ALTER TABLE public.contract_action_logs
  ADD CONSTRAINT contract_action_logs_action_type_check CHECK (
    action_type::text IN (
      'CONTRACT_CREATED', 'CONTRACT_SIGNED', 'CONTRACT_ACTIVATED', 'CONTRACT_COMPLETED',
      'FULL_REDEMPTION', 'INTEREST_PAYMENT', 'PRINCIPAL_REDUCTION', 'PRINCIPAL_INCREASE',
      'SLIP_UPLOADED', 'SLIP_VERIFIED', 'SLIP_REJECTED', 'PAYMENT_CONFIRMED',
      'PAYMENT_FAILED', 'INVESTOR_APPROVED', 'INVESTOR_REJECTED', 'CONTRACT_EXTENDED',
      'CONTRACT_UPDATED', 'NOTIFICATION_SENT', 'ERROR_OCCURRED',
      'REFUND_DUE', 'REFUND_PAID', 'REFUND_CANCELLED'
    )
  );

-- Backfill the liability that already exists. Every rejected request whose slip
-- verified MATCHED took money that was never returned.
--
-- Run the SELECT form of this first and hand the list to finance - these are
-- real, already-owed refunds, not test data:
--   SELECT request_id, contract_id, total_amount, interest_for_period
--     FROM public.contract_action_requests
--    WHERE request_status = 'INVESTOR_REJECTED' AND refund_status IS NULL
--      AND slip_verification_result = 'MATCHED' AND slip_url IS NOT NULL;
UPDATE public.contract_action_requests
SET
  refund_status = 'PENDING',
  refund_amount = ROUND(COALESCE(NULLIF(total_amount, 0), interest_for_period, 0)::numeric, 2),
  refund_reason = 'นักลงทุนปฏิเสธคำขอเพิ่มเงินต้นหลังชำระเงินแล้ว',
  refund_reference = 'RFD-' || UPPER(LEFT(REPLACE(request_id::text, '-', ''), 20)),
  refund_due_at = COALESCE(investor_rejected_at, updated_at, NOW()),
  refund_bank_name = pawner_bank_name,
  refund_bank_account_no = pawner_bank_account_no,
  refund_bank_account_name = pawner_bank_account_name
WHERE request_status = 'INVESTOR_REJECTED'
  AND refund_status IS NULL
  AND slip_verification_result = 'MATCHED'
  AND slip_url IS NOT NULL
  AND COALESCE(NULLIF(total_amount, 0), interest_for_period, 0) > 0;

-- Rejected requests that never took money are closed matters, marked so the
-- operator queue does not have to re-derive that per row.
UPDATE public.contract_action_requests
SET refund_status = 'NOT_REQUIRED'
WHERE request_status = 'INVESTOR_REJECTED'
  AND refund_status IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
