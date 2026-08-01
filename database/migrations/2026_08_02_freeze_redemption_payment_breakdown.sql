-- Freeze the payment breakdown quoted to the pawner on a redemption request.
--
-- WHY
-- ---
-- redemption_requests stored only principal_amount, interest_amount,
-- delivery_fee and total_amount. The late-charge components (flat penalty and
-- 3%/month overdue interest) were folded into total_amount at creation but
-- never persisted, so the payment-proof screen had nothing to itemise:
--   * the overdue-interest line rendered only when > 0, so it never appeared;
--   * base + fee did not add up to total, which reads as an unexplained
--     increase between the quote screen and the upload screen.
--
-- The detail endpoint compensated by recomputing the penalty live, which is
-- worse for a money figure: the flat penalty steps every 30 days and the
-- overdue interest accrues monthly, so the amount a pawner was asked to pay
-- could change after they had already been quoted it.
--
-- Persisting the quote makes the figure immutable for the life of the request.
-- Existing rows keep working: the API derives their split from the frozen
-- total via getFrozenLateChargeBreakdown().

BEGIN;

ALTER TABLE public.redemption_requests
  ADD COLUMN IF NOT EXISTS base_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS penalty_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS overdue_interest_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS penalty_days_overdue INTEGER,
  ADD COLUMN IF NOT EXISTS penalty_months INTEGER;

ALTER TABLE public.redemption_requests
  DROP CONSTRAINT IF EXISTS redemption_requests_breakdown_nonnegative;
ALTER TABLE public.redemption_requests
  ADD CONSTRAINT redemption_requests_breakdown_nonnegative
  CHECK (
    (base_amount IS NULL OR base_amount >= 0)
    AND (penalty_amount IS NULL OR penalty_amount >= 0)
    AND (overdue_interest_amount IS NULL OR overdue_interest_amount >= 0)
    AND (penalty_days_overdue IS NULL OR penalty_days_overdue >= 0)
    AND (penalty_months IS NULL OR penalty_months >= 0)
  );

COMMENT ON COLUMN public.redemption_requests.base_amount IS
  'Principal + accrued interest + delivery fee quoted at request time, excluding late charges.';
COMMENT ON COLUMN public.redemption_requests.penalty_amount IS
  'Flat overdue penalty frozen at request time. Never recompute for display.';
COMMENT ON COLUMN public.redemption_requests.overdue_interest_amount IS
  'Overdue interest (3%/month) frozen at request time. Never recompute for display.';
COMMENT ON COLUMN public.redemption_requests.penalty_months IS
  'Chargeable overdue months at request time, shown as "ดอกเบี้ยเลท 3%/เดือน x N เดือน".';

COMMIT;
