-- Transaction integrity and payment-evidence replay indexes.
--
-- IMPORTANT
-- ---------
-- This migration is intentionally non-destructive. It NEVER deletes, merges,
-- cancels, or rewrites financial records. The preflight blocks raise SQLSTATE
-- 23505 when historical duplicates exist, before any index is created.
--
-- Run with autocommit enabled. CREATE INDEX CONCURRENTLY cannot run inside an
-- explicit transaction (including a migration runner that wraps the file in
-- BEGIN/COMMIT), and will fail with SQLSTATE 25001.
--
-- KNOWN LIMITATION: the Supabase SQL editor wraps a submission in a transaction,
-- so this file cannot be pasted there as-is. Either run it through psql / a
-- runner configured for non-transactional migrations, or run the preflight
-- section here and then apply
-- 2026_08_01_harden_transaction_integrity_indexes_txn_safe.sql, which creates
-- the same indexes without CONCURRENTLY. That variant is safe at the current
-- table volumes; keep using this file where a write lock would matter.
--
-- Manual preflight / investigation queries
-- ------------------------------------------
-- 1. Duplicate daily penalty ledgers:
-- SELECT contract_id, penalty_date, COUNT(*) AS row_count,
--        ARRAY_AGG(penalty_id ORDER BY created_at, penalty_id) AS penalty_ids
-- FROM public.penalty_payments
-- GROUP BY contract_id, penalty_date
-- HAVING COUNT(*) > 1;
--
-- 2. More than one active redemption workflow for a contract:
-- SELECT contract_id, COUNT(*) AS row_count,
--        ARRAY_AGG(redemption_id ORDER BY created_at, redemption_id) AS redemption_ids
-- FROM public.redemption_requests
-- WHERE request_status IN (
--   'PENDING', 'SLIP_UPLOADED', 'AMOUNT_VERIFIED', 'AMOUNT_MISMATCH',
--   'PREPARING_ITEM', 'IN_TRANSIT', 'DELIVERED', 'PAWNER_CONFIRMED',
--   'INVESTOR_CONFIRMED'
-- )
-- GROUP BY contract_id
-- HAVING COUNT(*) > 1;
--
-- 3. Reused SHA-256 evidence references in the payments ledger:
-- SELECT transaction_ref, COUNT(*) AS row_count,
--        ARRAY_AGG(payment_id ORDER BY created_at, payment_id) AS payment_ids
-- FROM public.payments
-- WHERE transaction_ref LIKE 'sha256:%'
-- GROUP BY transaction_ref
-- HAVING COUNT(*) > 1;
--
-- 4. Multiple final Drop Point verifications for one contract:
-- SELECT contract_id, COUNT(*) AS row_count,
--        ARRAY_AGG(verification_id ORDER BY created_at, verification_id) AS verification_ids
-- FROM public.drop_point_verifications
-- GROUP BY contract_id
-- HAVING COUNT(*) > 1;
--
-- 5. A return bag identifier assigned to multiple contracts:
-- SELECT UPPER(BTRIM(bag_number)) AS normalized_bag_number,
--        COUNT(DISTINCT contract_id) AS contract_count,
--        ARRAY_AGG(assignment_id ORDER BY assigned_at, assignment_id) AS assignment_ids
-- FROM public.drop_point_bag_assignments
-- GROUP BY UPPER(BTRIM(bag_number))
-- HAVING COUNT(DISTINCT contract_id) > 1;
--
-- Duplicate-resolution runbook
-- ----------------------------
-- A. Stop the affected workflow(s), retain every row, and compare the bank
--    transaction, contract state, LINE audit trail, and provider verification.
-- B. Have an authorized finance operator decide the canonical record. Never
--    choose solely by created_at and never delete evidence to make this pass.
-- C. Reconcile duplicates through an approved, auditable corrective migration
--    (for example, mark the superseded workflow CANCELLED/FAILED only when that
--    accurately reflects the real-world transaction). Preserve identifiers and
--    document the decision in the incident/change record.
-- D. Re-run all three preflight queries. Continue only when each returns zero
--    rows, then re-run this migration.

-- Supersede marker for Drop Point verifications. Declared here (idempotently)
-- because the uniqueness rule below is defined in terms of it; the reconciling
-- migration 2026_08_02_reconcile_drop_point_verification_supersede.sql adds the
-- integrity constraints and the documented data decisions. Either file may run
-- first.
ALTER TABLE public.drop_point_verifications
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by UUID,
  ADD COLUMN IF NOT EXISTS supersede_reason TEXT;

DO $preflight_penalty$
DECLARE
  duplicate_groups BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_groups
  FROM (
    SELECT contract_id, penalty_date
    FROM public.penalty_payments
    GROUP BY contract_id, penalty_date
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = FORMAT(
        'transaction-integrity preflight failed: %s duplicate penalty contract/date group(s)',
        duplicate_groups
      ),
      HINT = 'Run preflight query 1 and follow the duplicate-resolution runbook; this migration will not auto-dedupe financial records.';
  END IF;
END;
$preflight_penalty$;

DO $preflight_redemption$
DECLARE
  duplicate_groups BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_groups
  FROM (
    SELECT contract_id
    FROM public.redemption_requests
    WHERE request_status IN (
      'PENDING', 'SLIP_UPLOADED', 'AMOUNT_VERIFIED', 'AMOUNT_MISMATCH',
      'PREPARING_ITEM', 'IN_TRANSIT', 'DELIVERED', 'PAWNER_CONFIRMED',
      'INVESTOR_CONFIRMED'
    )
    GROUP BY contract_id
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = FORMAT(
        'transaction-integrity preflight failed: %s contract(s) have multiple active redemption workflows',
        duplicate_groups
      ),
      HINT = 'Run preflight query 2 and follow the duplicate-resolution runbook; do not cancel a workflow without reconciling the real transaction.';
  END IF;
END;
$preflight_redemption$;

DO $preflight_payment_evidence$
DECLARE
  duplicate_groups BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_groups
  FROM (
    SELECT transaction_ref
    FROM public.payments
    WHERE transaction_ref LIKE 'sha256:%'
    GROUP BY transaction_ref
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = FORMAT(
        'transaction-integrity preflight failed: %s reused SHA-256 payment evidence reference(s)',
        duplicate_groups
      ),
      HINT = 'Run preflight query 3 and follow the duplicate-resolution runbook; preserve every slip and provider-verification record.';
  END IF;
END;
$preflight_payment_evidence$;

DO $preflight_drop_point_verification$
DECLARE
  duplicate_groups BIGINT;
BEGIN
  -- Superseded rows are retained evidence from an approved reconciliation and
  -- are excluded here and from the unique index below.
  SELECT COUNT(*)
  INTO duplicate_groups
  FROM (
    SELECT contract_id
    FROM public.drop_point_verifications
    WHERE superseded_at IS NULL
    GROUP BY contract_id
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = FORMAT(
        'transaction-integrity preflight failed: %s contract(s) have multiple Drop Point verification records',
        duplicate_groups
      ),
      HINT = 'Run preflight query 4, then reconcile with a documented supersede migration (see 2026_08_02_reconcile_drop_point_verification_supersede.sql) before adding uniqueness; do not delete evidence without an approved incident record.';
  END IF;
END;
$preflight_drop_point_verification$;

DO $preflight_return_bag$
DECLARE
  duplicate_groups BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_groups
  FROM (
    SELECT UPPER(BTRIM(bag_number))
    FROM public.drop_point_bag_assignments
    GROUP BY UPPER(BTRIM(bag_number))
    HAVING COUNT(DISTINCT contract_id) > 1
  ) AS duplicates;

  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = FORMAT(
        'transaction-integrity preflight failed: %s return bag identifier(s) are assigned to multiple contracts',
        duplicate_groups
      ),
      HINT = 'Run preflight query 5 and physically reconcile each bag with its contract before changing any assignment.';
  END IF;
END;
$preflight_return_bag$;

-- One penalty ledger per contract and calendar penalty date.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_penalty_payments_contract_date
  ON public.penalty_payments (contract_id, penalty_date);

-- One in-flight redemption state machine per contract. Terminal records remain
-- unlimited so historical COMPLETED/CANCELLED/REJECTED rows are preserved.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_redemption_requests_one_active_contract
  ON public.redemption_requests (contract_id)
  WHERE request_status IN (
    'PENDING', 'SLIP_UPLOADED', 'AMOUNT_VERIFIED', 'AMOUNT_MISMATCH',
    'PREPARING_ITEM', 'IN_TRANSIT', 'DELIVERED', 'PAWNER_CONFIRMED',
    'INVESTOR_CONFIRMED'
  );

-- The application stores content hashes as sha256:<64 lowercase hex chars>.
-- A partial unique index leaves legacy bank/provider reference formats intact.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_payments_slip_fingerprint
  ON public.payments (transaction_ref)
  WHERE transaction_ref LIKE 'sha256:%';

-- A contract receives one immutable final Drop Point inspection record. Rows
-- superseded by an approved, documented reconciliation stay in the table as
-- evidence and are excluded from the uniqueness rule.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_drop_point_verifications_contract
  ON public.drop_point_verifications (contract_id)
  WHERE superseded_at IS NULL;

-- Bag identifiers are normalized exactly like the API (trim + uppercase), so
-- two concurrent branches cannot assign the same physical bag to two contracts.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_drop_point_bag_assignments_normalized_bag
  ON public.drop_point_bag_assignments (UPPER(BTRIM(bag_number)));

-- JSONB containment (`@>`, emitted by Supabase `.contains`) backs the global
-- replay check across penalty, delivery, and redemption evidence ledgers.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_penalty_payments_evidence_gin
  ON public.penalty_payments
  USING GIN (slip_verification_details jsonb_path_ops)
  WHERE slip_verification_details IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pawn_delivery_evidence_gin
  ON public.pawn_delivery_requests
  USING GIN (slip_verification_details jsonb_path_ops)
  WHERE slip_verification_details IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_slip_verifications_evidence_gin
  ON public.slip_verifications
  USING GIN (ai_response jsonb_path_ops)
  WHERE ai_response IS NOT NULL;

-- Cross-table uniqueness cannot be expressed as a PostgreSQL index. Runtime
-- callers additionally hold the shared Redis `payment-evidence:<sha256>` lock,
-- then query all four ledgers before invoking SlipOK/LLM verification.
