-- =====================================================
-- Migration: Add Redemption Feature for Pawner
-- Feature: ไถ่ถอน, ต่อดอกเบี้ย, ลดเงินต้น, เพิ่มเงินต้น
-- =====================================================

-- 1. Create redemption_requests table (คำขอไถ่ถอน/ต่อดอก/ลดต้น/เพิ่มต้น)
CREATE TABLE IF NOT EXISTS redemption_requests (
  redemption_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,

  -- Request Type
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN (
    'FULL_REDEMPTION',      -- ไถ่ถอนเต็มจำนวน
    'INTEREST_PAYMENT',     -- ต่อดอกเบี้ย (จ่ายแค่ดอก)
    'PRINCIPAL_REDUCTION',  -- ลดเงินต้น
    'PRINCIPAL_INCREASE'    -- เพิ่มเงินต้น (ขอกู้เพิ่ม)
  )),

  -- Amount Details
  principal_amount DECIMAL(12,2) NOT NULL,      -- เงินต้นที่ต้องจ่าย
  interest_amount DECIMAL(12,2) NOT NULL,       -- ดอกเบี้ยที่ต้องจ่าย
  delivery_fee DECIMAL(12,2) DEFAULT 0,         -- ค่าจัดส่ง (ถ้ามี)
  total_amount DECIMAL(12,2) NOT NULL,          -- ยอดรวมทั้งหมด

  -- For PRINCIPAL_REDUCTION/INCREASE
  reduction_amount DECIMAL(12,2),               -- จำนวนที่ขอลด
  increase_amount DECIMAL(12,2),                -- จำนวนที่ขอเพิ่ม

  -- Delivery Options
  delivery_method VARCHAR(50) CHECK (delivery_method IN (
    'SELF_PICKUP',          -- รับของเอง
    'SELF_ARRANGE',         -- เรียกขนส่งเอง
    'PLATFORM_ARRANGE'      -- ให้ Platform เรียกขนส่งให้
  )),

  -- Delivery Address (for SELF_ARRANGE or PLATFORM_ARRANGE)
  delivery_address_full TEXT,
  delivery_addr_house_no VARCHAR(50),
  delivery_addr_village VARCHAR(100),
  delivery_addr_street VARCHAR(100),
  delivery_addr_sub_district VARCHAR(100),
  delivery_addr_district VARCHAR(100),
  delivery_addr_province VARCHAR(100),
  delivery_addr_postcode VARCHAR(10),
  delivery_contact_phone VARCHAR(20),
  delivery_notes TEXT,

  -- Payment Slip
  payment_slip_url TEXT,
  payment_slip_uploaded_at TIMESTAMPTZ,

  -- Request Status
  request_status VARCHAR(50) DEFAULT 'PENDING' CHECK (request_status IN (
    'PENDING',              -- รอการอัพโหลดสลิป
    'SLIP_UPLOADED',        -- อัพโหลดสลิปแล้ว รอ Drop Point ตรวจสอบ
    'AMOUNT_VERIFIED',      -- Drop Point ยืนยันยอดถูกต้อง
    'AMOUNT_MISMATCH',      -- ยอดไม่ตรง
    'PREPARING_ITEM',       -- กำลังเตรียมของ
    'IN_TRANSIT',           -- กำลังจัดส่ง
    'DELIVERED',            -- ส่งของแล้ว
    'PAWNER_CONFIRMED',     -- Pawner ยืนยันรับของแล้ว
    'INVESTOR_CONFIRMED',   -- Investor ยืนยันได้รับเงินแล้ว
    'COMPLETED',            -- เสร็จสิ้น
    'CANCELLED',            -- ยกเลิก
    'REJECTED'              -- ถูกปฏิเสธ
  )),

  -- Verification by Drop Point
  verified_by_drop_point_id UUID REFERENCES drop_points(drop_point_id),
  verified_by_line_id VARCHAR(255),
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,

  -- Amount Mismatch Details
  actual_amount_received DECIMAL(12,2),
  amount_difference DECIMAL(12,2),
  mismatch_type VARCHAR(20) CHECK (mismatch_type IN ('OVERPAID', 'UNDERPAID')),
  mismatch_resolved BOOLEAN DEFAULT FALSE,
  mismatch_resolved_at TIMESTAMPTZ,

  -- Tracking
  tracking_number VARCHAR(100),
  courier_name VARCHAR(100),

  -- Confirmations
  pawner_confirmed_at TIMESTAMPTZ,
  investor_confirmed_at TIMESTAMPTZ,

  -- Investor Earnings (calculated on completion)
  investor_interest_earned DECIMAL(12,2),
  platform_fee_deducted DECIMAL(12,2),
  investor_net_profit DECIMAL(12,2),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_redemption_requests_contract_id ON redemption_requests(contract_id);
CREATE INDEX IF NOT EXISTS idx_redemption_requests_status ON redemption_requests(request_status);
CREATE INDEX IF NOT EXISTS idx_redemption_requests_type ON redemption_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_redemption_requests_created_at ON redemption_requests(created_at DESC);

-- 2. Add payment_status column to contracts if not exists
-- (This was already added in previous migration, but let's ensure it exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'payment_status') THEN
    ALTER TABLE contracts ADD COLUMN payment_status VARCHAR(50);
  END IF;
END $$;

-- 3. Add redemption_status to contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS redemption_status VARCHAR(50) CHECK (redemption_status IN (
  'NONE', 'PENDING', 'IN_PROGRESS', 'COMPLETED'
));

-- 4. Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_redemption_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_redemption_requests_updated_at ON redemption_requests;
CREATE TRIGGER trigger_redemption_requests_updated_at
BEFORE UPDATE ON redemption_requests
FOR EACH ROW EXECUTE FUNCTION update_redemption_requests_updated_at();

-- 5. Add PromptPay info to investors (if not exists)
ALTER TABLE investors ADD COLUMN IF NOT EXISTS promptpay_number VARCHAR(20);
ALTER TABLE investors ADD COLUMN IF NOT EXISTS promptpay_name VARCHAR(200);

-- 6. Add verified payment columns to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_by_investor_id UUID REFERENCES investors(investor_id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS redemption_id UUID REFERENCES redemption_requests(redemption_id);

-- 7. Create index for redemption_id in payments
CREATE INDEX IF NOT EXISTS idx_payments_redemption_id ON payments(redemption_id);

COMMENT ON TABLE redemption_requests IS 'ตารางเก็บคำขอไถ่ถอน ต่อดอกเบี้ย ลดเงินต้น และเพิ่มเงินต้น';
