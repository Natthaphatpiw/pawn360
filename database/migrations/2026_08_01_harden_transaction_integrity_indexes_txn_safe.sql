-- Transaction-safe variant of the index section of
-- 2026_08_01_harden_transaction_integrity.sql
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The Supabase SQL editor wraps a submission in a transaction block, and
-- PostgreSQL refuses CREATE INDEX CONCURRENTLY inside one (SQLSTATE 25001).
-- CONCURRENTLY exists to avoid blocking writes while an index is built on a
-- large table; it is not required for correctness. The affected tables are
-- small (single digits to low hundreds of rows), so a plain CREATE INDEX
-- completes in well under a second and its brief write lock is immaterial.
--
-- PREREQUISITE
-- ------------
-- Run 2026_08_01_harden_transaction_integrity.sql first and let its preflight
-- blocks pass. Those blocks are the real safety gate: they refuse to add any
-- uniqueness rule while historical duplicates exist. This file deliberately
-- contains NO preflight of its own, so it must never be run on its own before
-- that file has been accepted.
--
-- If the table volumes ever grow large enough that a write lock matters, use
-- the original file with a client that supports non-transactional migrations
-- (psql, or a runner configured for autocommit) instead of this one.
--
-- Every statement is IF NOT EXISTS, so this file is safe to re-run and safe to
-- run after a partially successful attempt.

-- One penalty ledger per contract and calendar penalty date.
CREATE UNIQUE INDEX IF NOT EXISTS ux_penalty_payments_contract_date
  ON public.penalty_payments (contract_id, penalty_date);

-- One in-flight redemption state machine per contract. Terminal records remain
-- unlimited so historical COMPLETED/CANCELLED/REJECTED rows are preserved.
CREATE UNIQUE INDEX IF NOT EXISTS ux_redemption_requests_one_active_contract
  ON public.redemption_requests (contract_id)
  WHERE request_status IN (
    'PENDING', 'SLIP_UPLOADED', 'AMOUNT_VERIFIED', 'AMOUNT_MISMATCH',
    'PREPARING_ITEM', 'IN_TRANSIT', 'DELIVERED', 'PAWNER_CONFIRMED',
    'INVESTOR_CONFIRMED'
  );

-- The application stores content hashes as sha256:<64 lowercase hex chars>.
-- A partial unique index leaves legacy bank/provider reference formats intact.
CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_slip_fingerprint
  ON public.payments (transaction_ref)
  WHERE transaction_ref LIKE 'sha256:%';

-- A contract receives one immutable final Drop Point inspection record. Rows
-- superseded by an approved, documented reconciliation stay in the table as
-- evidence and are excluded from the uniqueness rule.
CREATE UNIQUE INDEX IF NOT EXISTS ux_drop_point_verifications_contract
  ON public.drop_point_verifications (contract_id)
  WHERE superseded_at IS NULL;

-- Bag identifiers are normalized exactly like the API (trim + uppercase), so
-- two concurrent branches cannot assign the same physical bag to two contracts.
CREATE UNIQUE INDEX IF NOT EXISTS ux_drop_point_bag_assignments_normalized_bag
  ON public.drop_point_bag_assignments (UPPER(BTRIM(bag_number)));

-- JSONB containment (`@>`, emitted by Supabase `.contains`) backs the global
-- replay check across penalty, delivery, and redemption evidence ledgers.
CREATE INDEX IF NOT EXISTS idx_penalty_payments_evidence_gin
  ON public.penalty_payments
  USING GIN (slip_verification_details jsonb_path_ops)
  WHERE slip_verification_details IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pawn_delivery_evidence_gin
  ON public.pawn_delivery_requests
  USING GIN (slip_verification_details jsonb_path_ops)
  WHERE slip_verification_details IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_slip_verifications_evidence_gin
  ON public.slip_verifications
  USING GIN (ai_response jsonb_path_ops)
  WHERE ai_response IS NOT NULL;

-- Cross-table uniqueness cannot be expressed as a PostgreSQL index. Runtime
-- callers additionally hold the shared Redis `payment-evidence:<sha256>` lock,
-- then query all four ledgers before invoking SlipOK/LLM verification.
