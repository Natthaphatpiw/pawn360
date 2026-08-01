BEGIN;

-- LLM-selected rows are not trusted merely because they have a valid URL.
-- Only rows whose advertised price/currency was deterministically confirmed
-- against provider evidence may be reused by the historical pricing pool.
ALTER TABLE public.price_observations
  ADD COLUMN IF NOT EXISTS evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS evidence_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS evidence_provider TEXT,
  ADD COLUMN IF NOT EXISTS evidence_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_outlier BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.price_observations
  DROP CONSTRAINT IF EXISTS price_observations_evidence_status_check;
ALTER TABLE public.price_observations
  ADD CONSTRAINT price_observations_evidence_status_check
  CHECK (evidence_status IN (
    'VERIFIED', 'MANUAL_VERIFIED', 'UNVERIFIED', 'QUARANTINED_OUTLIER'
  ));

ALTER TABLE public.price_observations
  DROP CONSTRAINT IF EXISTS price_observations_evidence_fingerprint_check;
ALTER TABLE public.price_observations
  ADD CONSTRAINT price_observations_evidence_fingerprint_check
  CHECK (
    evidence_fingerprint IS NULL
    OR evidence_fingerprint ~ '^[0-9a-f]{64}$'
  );

-- Existing rows remain UNVERIFIED intentionally. They were created before
-- deterministic price/currency proof existed and must not make a pool strong.
DROP INDEX IF EXISTS public.idx_price_obs_verified_family_created;
CREATE INDEX IF NOT EXISTS idx_price_obs_verified_family_created
  ON public.price_observations (family_norm, listing_kind, match_level, created_at DESC)
  WHERE evidence_status IN ('VERIFIED', 'MANUAL_VERIFIED')
    AND match_level IN ('exact', 'family')
    AND is_outlier = FALSE;

COMMENT ON COLUMN public.price_observations.evidence_status IS
  'Trust gate for historical reuse; VERIFIED requires reproducible price/currency and product identity evidence.';
COMMENT ON COLUMN public.price_observations.evidence_fingerprint IS
  'SHA-256 fingerprint of explicit price/currency evidence from the provider result.';
COMMENT ON COLUMN public.price_observations.is_outlier IS
  'True when deterministic robust-price checks quarantine the observation.';

COMMIT;
