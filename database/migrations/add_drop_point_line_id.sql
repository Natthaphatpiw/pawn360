-- =====================================================
-- Migration: Add CONFIRMED status to contracts table
-- To distinguish fully completed contracts from active ones
-- =====================================================

-- Add CONFIRMED status to contract_status check constraint
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_contract_status_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_contract_status_check CHECK (
  contract_status IN (
    'PENDING_SIGNATURE', 'ACTIVE', 'CONFIRMED', 'COMPLETED',
    'DEFAULTED', 'EXTENDED', 'TERMINATED', 'LIQUIDATED'
  )
);

-- =====================================================
-- Migration: Add line_id column to drop_points table
-- For LINE OA integration with Drop Points
-- =====================================================

-- Add line_id column to drop_points table
ALTER TABLE drop_points
ADD COLUMN IF NOT EXISTS line_id VARCHAR(255) UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_drop_points_line_id ON drop_points(line_id);

-- Add verification related columns for item verification by drop points
ALTER TABLE items
ADD COLUMN IF NOT EXISTS verified_by_drop_point BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS drop_point_verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS drop_point_verification_notes TEXT,
ADD COLUMN IF NOT EXISTS drop_point_photos TEXT[], -- Photos taken by drop point
ADD COLUMN IF NOT EXISTS drop_point_condition_score INTEGER CHECK (drop_point_condition_score >= 0 AND drop_point_condition_score <= 100);

-- Add payment slip tracking to payments table
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS payer_type VARCHAR(20) CHECK (payer_type IN ('INVESTOR', 'PAWNER')),
ADD COLUMN IF NOT EXISTS payer_id UUID,
ADD COLUMN IF NOT EXISTS confirmed_by_recipient BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS confirmation_deadline TIMESTAMP;

-- Add item delivery status to contracts
ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS item_delivery_status VARCHAR(50) DEFAULT 'PENDING' CHECK (item_delivery_status IN (
  'PENDING', 'PAWNER_CONFIRMED', 'IN_TRANSIT', 'RECEIVED_AT_DROP_POINT', 'VERIFIED', 'RETURNED'
)),
ADD COLUMN IF NOT EXISTS item_received_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS item_verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS payment_slip_url TEXT,
ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMP;

-- Create table for drop point verifications
CREATE TABLE IF NOT EXISTS drop_point_verifications (
  verification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,
  drop_point_id UUID NOT NULL REFERENCES drop_points(drop_point_id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,

  -- Verification checklist
  brand_correct BOOLEAN,
  model_correct BOOLEAN,
  capacity_correct BOOLEAN,
  color_match BOOLEAN,
  functionality_ok BOOLEAN,
  mdm_lock_status BOOLEAN, -- true = no MDM lock (correct), false = has MDM lock

  -- Condition assessment
  condition_score INTEGER CHECK (condition_score >= 0 AND condition_score <= 100),

  -- Photos taken by drop point
  verification_photos TEXT[],

  -- Notes
  notes TEXT,

  -- Result
  verification_result VARCHAR(20) CHECK (verification_result IN ('APPROVED', 'REJECTED', 'PENDING')),
  rejection_reason TEXT,

  -- Verified by
  verified_by_line_id VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drop_point_verifications_contract_id ON drop_point_verifications(contract_id);
CREATE INDEX IF NOT EXISTS idx_drop_point_verifications_drop_point_id ON drop_point_verifications(drop_point_id);

-- Create trigger for updated_at (drop if exists first)
DROP TRIGGER IF EXISTS update_drop_point_verifications_updated_at ON drop_point_verifications;
CREATE TRIGGER update_drop_point_verifications_updated_at
BEFORE UPDATE ON drop_point_verifications
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
