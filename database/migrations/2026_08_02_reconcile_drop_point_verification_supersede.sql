-- Reconcile the historical duplicate Drop Point verification that blocks
-- 2026_08_01_harden_transaction_integrity.sql (preflight query 4).
--
-- RUN THIS BEFORE re-running the transaction-integrity migration.
--
-- Incident summary
-- ----------------
-- Contract  : bb380689-47c5-42e4-94ef-10abb1d84a80 (CTR-20260602-MMABYD)
-- Drop point: 86a9b6b6-b1c7-4c1d-b36d-20d418179395
-- Operator  : Uc70620a98c60cb8056a06aaf78e06414
-- Date      : 2026-06-14
--
-- Two verification rows were written 14 seconds apart by the same operator, at
-- the same drop point, for the same item, referencing the same photograph:
--
--   18:41:01.421  969e3ca8-...  mdm_lock_status = true   -> APPROVED
--   18:41:15.452  23798788-...  mdm_lock_status = false  -> REJECTED
--
-- The only field that differs is the MDM-lock check, which is consistent with
-- the operator correcting a mis-ticked checkbox and resubmitting. The contract
-- itself agrees with the second submission and nothing downstream followed the
-- approval path:
--
--   contracts.contract_status       = TERMINATED
--   contracts.item_delivery_status  = RETURNED
--   contracts.updated_at            = 2026-06-14T18:41:15.752904  (matches REJECTED)
--   redemption_requests             = none for this contract
--   drop_point_bag_assignments      = none for this contract
--
-- Decision: 23798788-... (REJECTED) is the canonical verification. 969e3ca8-...
-- is a superseded first submission.
--
-- This migration does NOT delete it. Both rows remain queryable evidence; the
-- superseded one is marked, dated, and linked to the record that replaced it,
-- per the duplicate-resolution runbook in the transaction-integrity migration
-- ("never delete evidence to make this pass"). The uniqueness guarantee is
-- preserved by making the index partial on non-superseded rows.
--
-- The current API can no longer produce this state: app/api/drop-points/verify
-- returns 409 on a conflicting result and only inserts when no verification
-- exists for the contract. This is a pre-guard historical artefact.
--
-- Safe to re-run: every statement is idempotent and guarded.

BEGIN;

ALTER TABLE public.drop_point_verifications
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by UUID,
  ADD COLUMN IF NOT EXISTS supersede_reason TEXT;

COMMENT ON COLUMN public.drop_point_verifications.superseded_at IS
  'Set only by an approved reconciliation. A superseded row is retained evidence and is excluded from the one-verification-per-contract uniqueness rule.';
COMMENT ON COLUMN public.drop_point_verifications.superseded_by IS
  'The verification_id that replaced this row.';
COMMENT ON COLUMN public.drop_point_verifications.supersede_reason IS
  'Human-readable justification recorded at reconciliation time.';

ALTER TABLE public.drop_point_verifications
  DROP CONSTRAINT IF EXISTS drop_point_verifications_supersede_complete;
ALTER TABLE public.drop_point_verifications
  ADD CONSTRAINT drop_point_verifications_supersede_complete
  CHECK (
    (superseded_at IS NULL AND superseded_by IS NULL AND supersede_reason IS NULL)
    OR (superseded_at IS NOT NULL AND superseded_by IS NOT NULL AND supersede_reason IS NOT NULL)
  );

-- A row can never supersede itself.
ALTER TABLE public.drop_point_verifications
  DROP CONSTRAINT IF EXISTS drop_point_verifications_supersede_not_self;
ALTER TABLE public.drop_point_verifications
  ADD CONSTRAINT drop_point_verifications_supersede_not_self
  CHECK (superseded_by IS NULL OR superseded_by <> verification_id);

-- The specific, documented reconciliation. Every predicate must still hold, so
-- this is a no-op if the data has changed since the incident was reviewed.
UPDATE public.drop_point_verifications AS superseded
SET
  superseded_at = NOW(),
  superseded_by = '23798788-c9e3-4016-aa9a-9abd3a993550',
  supersede_reason =
    'Operator resubmitted 14s later with mdm_lock_status corrected to false; '
    || 'the REJECTED record 23798788-c9e3-4016-aa9a-9abd3a993550 matches the '
    || 'contract outcome (TERMINATED / RETURNED). Evidence retained, not deleted.'
WHERE superseded.verification_id = '969e3ca8-b6e3-4e94-abd3-2fbe434c996e'
  AND superseded.contract_id = 'bb380689-47c5-42e4-94ef-10abb1d84a80'
  AND superseded.verification_result = 'APPROVED'
  AND superseded.superseded_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.drop_point_verifications AS canonical
    WHERE canonical.verification_id = '23798788-c9e3-4016-aa9a-9abd3a993550'
      AND canonical.contract_id = superseded.contract_id
      AND canonical.verification_result = 'REJECTED'
      AND canonical.created_at > superseded.created_at
  )
  AND EXISTS (
    SELECT 1
    FROM public.contracts AS c
    WHERE c.contract_id = superseded.contract_id
      AND c.contract_status = 'TERMINATED'
      AND c.item_delivery_status = 'RETURNED'
  );

-- Fail loudly rather than silently leaving the transaction-integrity migration
-- blocked, and catch any duplicate this reconciliation did not anticipate.
DO $verify_reconciliation$
DECLARE
  remaining BIGINT;
  offending TEXT;
BEGIN
  SELECT COUNT(*), COALESCE(STRING_AGG(DISTINCT contract_id::TEXT, ', '), '')
  INTO remaining, offending
  FROM (
    SELECT contract_id
    FROM public.drop_point_verifications
    WHERE superseded_at IS NULL
    GROUP BY contract_id
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF remaining > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = FORMAT(
        'drop-point verification reconciliation incomplete: %s contract(s) still have multiple active records (%s)',
        remaining, offending
      ),
      HINT = 'Review each remaining contract with an authorized finance operator and extend this migration with an explicit, documented supersede for it. Do not delete evidence.';
  END IF;
END;
$verify_reconciliation$;

COMMIT;
