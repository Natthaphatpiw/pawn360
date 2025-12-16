-- =====================================================
-- Migration: 2024_12_15 Update Schema
-- - Add ekyc_url to pawners and investors
-- - Update bank_account_type constraint
-- - Add line_id to items for draft support
-- =====================================================

-- =====================================================
-- 1. FIX bank_account_type CHECK CONSTRAINT
-- Error: violates check constraint "pawners_bank_account_type_check"
-- Solution: Update invalid data first, then update constraint
-- =====================================================

-- Step 1: Update any invalid bank_account_type values to NULL in pawners
UPDATE pawners
SET bank_account_type = NULL
WHERE bank_account_type IS NOT NULL
  AND bank_account_type NOT IN (
    'บัญชีออมทรัพย์',
    'บัญชีเงินฝากประจำ',
    'บัญชีกระแสรายวัน',
    'บัญชีเงินตราต่างประเทศ'
  );

-- Step 2: Update any invalid bank_account_type values to NULL in investors
UPDATE investors
SET bank_account_type = NULL
WHERE bank_account_type IS NOT NULL
  AND bank_account_type NOT IN (
    'บัญชีออมทรัพย์',
    'บัญชีเงินฝากประจำ',
    'บัญชีกระแสรายวัน',
    'บัญชีเงินตราต่างประเทศ'
  );

-- Step 3: Drop existing constraints
ALTER TABLE pawners DROP CONSTRAINT IF EXISTS pawners_bank_account_type_check;
ALTER TABLE investors DROP CONSTRAINT IF EXISTS investors_bank_account_type_check;

-- Step 4: Add updated constraints with more options
ALTER TABLE pawners ADD CONSTRAINT pawners_bank_account_type_check
  CHECK (bank_account_type IS NULL OR bank_account_type IN (
    'บัญชีออมทรัพย์',
    'บัญชีเงินฝากประจำ',
    'บัญชีกระแสรายวัน',
    'บัญชีเงินตราต่างประเทศ',
    'พร้อมเพย์'
  ));

ALTER TABLE investors ADD CONSTRAINT investors_bank_account_type_check
  CHECK (bank_account_type IS NULL OR bank_account_type IN (
    'บัญชีออมทรัพย์',
    'บัญชีเงินฝากประจำ',
    'บัญชีกระแสรายวัน',
    'บัญชีเงินตราต่างประเทศ',
    'พร้อมเพย์'
  ));

-- =====================================================
-- 2. ADD ekyc_url COLUMN FOR REUSABLE EKYC URL
-- =====================================================

-- Add ekyc_url to pawners
ALTER TABLE pawners ADD COLUMN IF NOT EXISTS ekyc_url TEXT;

-- Add ekyc_url to investors
ALTER TABLE investors ADD COLUMN IF NOT EXISTS ekyc_url TEXT;

-- =====================================================
-- 3. UPDATE items TABLE FOR DRAFT SUPPORT
-- Allow items to be saved before user registration
-- =====================================================

-- Make customer_id nullable for draft items
ALTER TABLE items ALTER COLUMN customer_id DROP NOT NULL;

-- Add line_id column for tracking draft items by LINE user
ALTER TABLE items ADD COLUMN IF NOT EXISTS line_id VARCHAR(255);

-- Add item_status 'DRAFT' to the constraint
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_item_status_check;
ALTER TABLE items ADD CONSTRAINT items_item_status_check
  CHECK (item_status IN (
    'DRAFT',      -- Draft saved but not submitted
    'PENDING',    -- Waiting for approval
    'APPROVED',   -- Approved by system
    'REJECTED',   -- Rejected
    'IN_CONTRACT', -- Currently in a contract
    'RETURNED',   -- Returned to customer
    'LIQUIDATED'  -- Sold/Liquidated
  ));

-- Create index for line_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_items_line_id ON items(line_id);

-- =====================================================
-- 4. CREATE investor_market_offers VIEW (OPTIONAL)
-- For cleaner market offers query
-- =====================================================

-- Drop view if exists
DROP VIEW IF EXISTS v_market_offers;

-- Create view for market offers
CREATE OR REPLACE VIEW v_market_offers AS
SELECT
  c.contract_id,
  c.contract_number,
  c.loan_principal_amount,
  c.interest_rate,
  c.interest_amount,
  c.contract_duration_days,
  c.contract_status,
  c.funding_status,
  c.created_at,
  i.item_id,
  i.item_type,
  i.brand,
  i.model,
  i.capacity,
  i.item_condition,
  i.estimated_value,
  i.image_urls,
  p.customer_id,
  p.firstname as pawner_firstname,
  p.lastname as pawner_lastname
FROM contracts c
JOIN items i ON c.item_id = i.item_id
JOIN pawners p ON c.customer_id = p.customer_id
WHERE c.funding_status = 'SEEKING_FUNDING'
  AND c.contract_status IN ('PENDING_SIGNATURE', 'CONFIRMED')
  AND c.investor_id IS NULL
ORDER BY c.created_at DESC;

-- =====================================================
-- 5. ADD signature_url TO pawners
-- Store pawner signature image URL
-- =====================================================

-- Add signature_url to pawners (for pawner signature on pawn ticket)
ALTER TABLE pawners ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- Note: contract_file_url already exists in contracts table for storing pawn ticket image

-- =====================================================
-- 6. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON COLUMN pawners.ekyc_url IS 'UpPass eKYC URL for user to complete verification';
COMMENT ON COLUMN investors.ekyc_url IS 'UpPass eKYC URL for user to complete verification';
COMMENT ON COLUMN items.line_id IS 'LINE user ID for draft items before registration';
COMMENT ON COLUMN contracts.contract_file_url IS 'AWS S3 URL of generated pawn ticket image (auto-generated when status=CONFIRMED)';
COMMENT ON COLUMN pawners.signature_url IS 'URL of pawner signature image';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
