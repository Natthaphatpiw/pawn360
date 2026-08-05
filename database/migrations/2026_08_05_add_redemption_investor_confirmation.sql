-- Record HOW a redemption's investor payout was confirmed, not just when.
--
-- redemption_requests.investor_confirmed_at already exists but nothing ever set
-- it: there was no way for an investor to confirm, so the closing step of every
-- redemption was unreachable.
--
-- WHY A SOURCE COLUMN AND NOT JUST THE TIMESTAMP
-- An investor will not reliably open the app to press a button, so blocking the
-- redemption on their action would strand every one of them. The payout is
-- therefore auto-confirmed after a quiet period. But "nobody objected within N
-- days" is a much weaker statement than "the investor said they received it",
-- and a reconciliation cannot tell them apart from a timestamp alone. This
-- column keeps the distinction:
--
--   HUMAN    the investor pressed "ได้รับเงินแล้ว"
--   AUTO     the quiet period elapsed with no response
--   DISPUTED the investor pressed "ยังไม่ได้รับเงิน" - needs an operator
--
-- DISPUTED deliberately still sets no confirmation timestamp: it is an open
-- problem, not a closed one.

ALTER TABLE public.redemption_requests
  ADD COLUMN IF NOT EXISTS investor_confirmation_source varchar(16);

ALTER TABLE public.redemption_requests
  ADD COLUMN IF NOT EXISTS investor_disputed_at timestamptz;

ALTER TABLE public.redemption_requests
  ADD COLUMN IF NOT EXISTS investor_dispute_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'redemption_investor_confirmation_source_check'
  ) THEN
    ALTER TABLE public.redemption_requests
      ADD CONSTRAINT redemption_investor_confirmation_source_check
      CHECK (investor_confirmation_source IS NULL
             OR investor_confirmation_source IN ('HUMAN', 'AUTO', 'DISPUTED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_redemption_awaiting_investor_confirm
  ON public.redemption_requests (pawner_confirmed_at)
  WHERE investor_confirmed_at IS NULL AND investor_disputed_at IS NULL;

COMMENT ON COLUMN public.redemption_requests.investor_confirmation_source IS
  'HUMAN = investor confirmed receipt; AUTO = quiet period elapsed with no response; DISPUTED = investor reported the money never arrived. AUTO is materially weaker evidence than HUMAN and must not be treated as an assertion by the investor.';
