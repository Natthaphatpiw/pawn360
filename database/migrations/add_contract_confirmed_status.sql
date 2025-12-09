-- =====================================================
-- Migration: Add CONFIRMED status to contracts table
-- To distinguish fully completed contracts from active ones
-- =====================================================

-- Drop existing constraint if exists
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_contract_status_check;

-- Add new constraint with CONFIRMED status
ALTER TABLE contracts ADD CONSTRAINT contracts_contract_status_check CHECK (
  contract_status IN (
    'PENDING_SIGNATURE',
    'ACTIVE',
    'CONFIRMED',
    'COMPLETED',
    'DEFAULTED',
    'EXTENDED',
    'TERMINATED',
    'LIQUIDATED'
  )
);

-- Update existing ACTIVE contracts that have payment_confirmed_at to CONFIRMED
-- This will mark contracts that have already completed the full flow
UPDATE contracts
SET contract_status = 'CONFIRMED'
WHERE contract_status = 'ACTIVE'
  AND payment_confirmed_at IS NOT NULL;

-- Add comment to table
COMMENT ON COLUMN contracts.contract_status IS 'Contract status: PENDING_SIGNATURE->ACTIVE->CONFIRMED->COMPLETED/DEFAULTED/EXTENDED/TERMINATED/LIQUIDATED';
