BEGIN;

-- Server-issued estimate proof retained with drafts/items so a browser cannot
-- replace AI/manual prices or condition scores before creating a loan request.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS estimate_job_id UUID,
  ADD COLUMN IF NOT EXISTS estimate_attestation TEXT;

ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_estimate_attestation_length;
ALTER TABLE public.items
  ADD CONSTRAINT items_estimate_attestation_length
  CHECK (estimate_attestation IS NULL OR char_length(estimate_attestation) <= 4096);

CREATE INDEX IF NOT EXISTS idx_items_estimate_job_id
  ON public.items(estimate_job_id)
  WHERE estimate_job_id IS NOT NULL;

-- A completed estimate/manual-review reference can fund at most one loan
-- request. This is the durable idempotency boundary behind the Redis mutex.
ALTER TABLE public.loan_requests
  ADD COLUMN IF NOT EXISTS estimate_reference_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_requests_estimate_reference_unique
  ON public.loan_requests(estimate_reference_id)
  WHERE estimate_reference_id IS NOT NULL;

-- Historical pricing evidence never needs a direct LINE identifier.
UPDATE public.price_observations
SET line_id = NULL
WHERE origin = 'estimate_result'
  AND line_id IS NOT NULL;

COMMENT ON COLUMN public.items.estimate_attestation IS
  'HMAC-signed, time-limited server proof binding owner, item fingerprint, condition, confidence and estimated price.';
COMMENT ON COLUMN public.loan_requests.estimate_reference_id IS
  'Unique AI estimate job or manual estimate request used to prevent duplicate/tampered loan creation.';

COMMIT;
