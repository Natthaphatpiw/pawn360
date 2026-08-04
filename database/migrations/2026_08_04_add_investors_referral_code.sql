-- Add investors.referral_code.
--
-- /api/investors/register has always inserted a top-level `referral_code`, but
-- no schema in this repo ever declared the column. PostgREST rejects the whole
-- insert with "column referral_code does not exist", which surfaced as
-- POST /api/investors/register 500 - so investor signup could never complete,
-- for anyone, at the final eKYC step.
--
-- Storing it as a real column rather than inside the investment_preferences
-- JSONB (where the registration UI already reads it from as a fallback)
-- because a referral programme needs to be queried and reported on by code,
-- and an index on a JSONB path is a worse tool for that.
--
-- Nullable: most investors arrive without a referral.

ALTER TABLE public.investors
  ADD COLUMN IF NOT EXISTS referral_code varchar(64);

CREATE INDEX IF NOT EXISTS idx_investors_referral_code
  ON public.investors (referral_code)
  WHERE referral_code IS NOT NULL;

COMMENT ON COLUMN public.investors.referral_code IS
  'Referral / partner code captured at registration (step 1 of the investor signup). Nullable - most investors have none.';
