-- =====================================================
-- Migration: Add Contract Actions Feature
-- Features: ต่อดอกเบี้ย, ลดเงินต้น, เพิ่มเงินต้น + AI Slip Verification + Logging
-- =====================================================

-- 1. Create contract_action_logs table (บันทึก log ทุก event)
CREATE TABLE IF NOT EXISTS contract_action_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  contract_id UUID REFERENCES contracts(contract_id),
  customer_id UUID REFERENCES pawners(customer_id),
  investor_id UUID REFERENCES investors(investor_id),
  action_request_id UUID, -- Reference to contract_action_requests

  -- Action Details
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN (
    'CONTRACT_CREATED',           -- สร้างสัญญา
    'CONTRACT_SIGNED',            -- เซ็นสัญญา
    'CONTRACT_ACTIVATED',         -- สัญญาเริ่มใช้งาน
    'CONTRACT_COMPLETED',         -- สัญญาเสร็จสิ้น
    'FULL_REDEMPTION',            -- ไถ่ถอนเต็มจำนวน
    'INTEREST_PAYMENT',           -- ต่อดอกเบี้ย
    'PRINCIPAL_REDUCTION',        -- ลดเงินต้น
    'PRINCIPAL_INCREASE',         -- เพิ่มเงินต้น
    'SLIP_UPLOADED',              -- อัพโหลดสลิป
    'SLIP_VERIFIED',              -- AI ตรวจสอบสลิปสำเร็จ
    'SLIP_REJECTED',              -- AI ปฏิเสธสลิป
    'PAYMENT_CONFIRMED',          -- ยืนยันการชำระเงิน
    'PAYMENT_FAILED',             -- การชำระเงินล้มเหลว
    'INVESTOR_APPROVED',          -- นักลงทุนอนุมัติ
    'INVESTOR_REJECTED',          -- นักลงทุนปฏิเสธ
    'CONTRACT_EXTENDED',          -- ขยายสัญญา
    'CONTRACT_UPDATED',           -- อัพเดทสัญญา
    'NOTIFICATION_SENT',          -- ส่งการแจ้งเตือน
    'ERROR_OCCURRED'              -- เกิดข้อผิดพลาด
  )),

  -- Status
  action_status VARCHAR(50) DEFAULT 'COMPLETED' CHECK (action_status IN (
    'INITIATED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
  )),

  -- Financial Details
  amount DECIMAL(12,2),
  principal_before DECIMAL(12,2),
  principal_after DECIMAL(12,2),
  interest_before DECIMAL(12,2),
  interest_after DECIMAL(12,2),
  total_amount DECIMAL(12,2),

  -- Date Changes
  contract_end_date_before DATE,
  contract_end_date_after DATE,

  -- Slip Verification
  slip_url TEXT,
  slip_amount_detected DECIMAL(12,2),
  slip_verification_result VARCHAR(50) CHECK (slip_verification_result IN (
    'MATCHED', 'UNDERPAID', 'OVERPAID', 'UNREADABLE', 'INVALID'
  )),
  slip_verification_details JSONB,

  -- Actor Info
  performed_by VARCHAR(50) CHECK (performed_by IN ('PAWNER', 'INVESTOR', 'DROPPOINT', 'SYSTEM', 'ADMIN')),
  performed_by_line_id VARCHAR(255),
  performed_by_name VARCHAR(200),

  -- Additional Info
  description TEXT,
  metadata JSONB,
  error_message TEXT,

  -- IP and Device Info
  ip_address VARCHAR(50),
  user_agent TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for logs
CREATE INDEX IF NOT EXISTS idx_contract_action_logs_contract_id ON contract_action_logs(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_action_logs_action_type ON contract_action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_contract_action_logs_created_at ON contract_action_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_action_logs_customer_id ON contract_action_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_contract_action_logs_investor_id ON contract_action_logs(investor_id);

-- 2. Create contract_action_requests table (คำขอ action ต่างๆ)
CREATE TABLE IF NOT EXISTS contract_action_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,

  -- Request Type
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN (
    'INTEREST_PAYMENT',           -- ต่อดอกเบี้ย
    'PRINCIPAL_REDUCTION',        -- ลดเงินต้น
    'PRINCIPAL_INCREASE'          -- เพิ่มเงินต้น
  )),

  -- Request Status
  request_status VARCHAR(50) DEFAULT 'PENDING' CHECK (request_status IN (
    'PENDING',                    -- รอดำเนินการ
    'AWAITING_PAYMENT',           -- รอชำระเงิน
    'SLIP_UPLOADED',              -- อัพโหลดสลิปแล้ว
    'SLIP_VERIFIED',              -- AI ตรวจสอบสลิปผ่าน
    'SLIP_REJECTED',              -- AI ปฏิเสธสลิป (รอบแรก)
    'SLIP_REJECTED_FINAL',        -- AI ปฏิเสธสลิป (รอบสอง - โมฆะ)
    'AWAITING_SIGNATURE',         -- รอเซ็นสัญญาใหม่
    'AWAITING_INVESTOR_APPROVAL', -- รอนักลงทุนอนุมัติ (สำหรับเพิ่มเงินต้น)
    'INVESTOR_APPROVED',          -- นักลงทุนอนุมัติแล้ว
    'INVESTOR_REJECTED',          -- นักลงทุนปฏิเสธ
    'AWAITING_INVESTOR_PAYMENT',  -- รอนักลงทุนโอนเงิน (สำหรับเพิ่มเงินต้น)
    'INVESTOR_SLIP_UPLOADED',     -- นักลงทุนอัพโหลดสลิปแล้ว
    'INVESTOR_SLIP_VERIFIED',     -- ตรวจสอบสลิปนักลงทุนผ่าน
    'AWAITING_PAWNER_CONFIRM',    -- รอผู้จำนำยืนยันรับเงิน
    'COMPLETED',                  -- เสร็จสิ้น
    'CANCELLED',                  -- ยกเลิก
    'VOIDED'                      -- เป็นโมฆะ
  )),

  -- Financial Calculations (Before Action)
  principal_before DECIMAL(12,2) NOT NULL,
  interest_rate DECIMAL(5,4) NOT NULL,           -- อัตราดอกเบี้ยต่อเดือน (เช่น 0.03 = 3%)
  daily_interest_rate DECIMAL(8,6),              -- อัตราดอกเบี้ยต่อวัน

  -- Days Calculation
  contract_start_date DATE NOT NULL,
  contract_end_date_before DATE NOT NULL,
  days_in_contract INT NOT NULL,                 -- จำนวนวันของสัญญา
  days_elapsed INT NOT NULL,                     -- จำนวนวันที่ผ่านไป ณ วันที่ทำรายการ
  days_remaining INT NOT NULL,                   -- จำนวนวันที่เหลือ

  -- Interest Calculation
  interest_accrued DECIMAL(12,2) NOT NULL,       -- ดอกเบี้ยสะสมถึงวันที่ทำรายการ

  -- For INTEREST_PAYMENT (ต่อดอกเบี้ย)
  interest_to_pay DECIMAL(12,2),                 -- ดอกเบี้ยที่ต้องจ่าย
  new_end_date DATE,                             -- วันครบกำหนดใหม่

  -- For PRINCIPAL_REDUCTION (ลดเงินต้น)
  reduction_amount DECIMAL(12,2),                -- จำนวนที่ขอลด
  interest_for_period DECIMAL(12,2),             -- ดอกเบี้ยถึงวันที่ลด
  total_to_pay_reduction DECIMAL(12,2),          -- ยอดรวมที่ต้องจ่าย (ลดเงินต้น + ดอกเบี้ย)
  principal_after_reduction DECIMAL(12,2),       -- เงินต้นหลังลด
  new_interest_for_remaining DECIMAL(12,2),      -- ดอกเบี้ยใหม่สำหรับช่วงที่เหลือ

  -- For PRINCIPAL_INCREASE (เพิ่มเงินต้น)
  increase_amount DECIMAL(12,2),                 -- จำนวนที่ขอเพิ่ม
  principal_after_increase DECIMAL(12,2),        -- เงินต้นหลังเพิ่ม
  new_interest_for_remaining_increase DECIMAL(12,2), -- ดอกเบี้ยใหม่สำหรับช่วงที่เหลือ

  -- Total Amount to Pay/Receive
  total_amount DECIMAL(12,2),                    -- ยอดรวมทั้งหมด

  -- Payment Slip (Pawner)
  slip_url TEXT,
  slip_uploaded_at TIMESTAMPTZ,
  slip_amount_detected DECIMAL(12,2),
  slip_verification_result VARCHAR(50),
  slip_verification_details JSONB,
  slip_attempt_count INT DEFAULT 0,              -- จำนวนครั้งที่อัพโหลดสลิป

  -- Investor Payment Slip (for PRINCIPAL_INCREASE)
  investor_slip_url TEXT,
  investor_slip_uploaded_at TIMESTAMPTZ,
  investor_slip_amount_detected DECIMAL(12,2),
  investor_slip_verification_result VARCHAR(50),
  investor_slip_verification_details JSONB,
  investor_slip_attempt_count INT DEFAULT 0,

  -- Signature
  signature_url TEXT,
  signed_at TIMESTAMPTZ,

  -- Investor Approval (for PRINCIPAL_INCREASE)
  investor_approved_at TIMESTAMPTZ,
  investor_rejected_at TIMESTAMPTZ,
  investor_rejection_reason TEXT,

  -- Pawner Confirmation (for PRINCIPAL_INCREASE)
  pawner_confirmed_at TIMESTAMPTZ,
  pawner_rejected_at TIMESTAMPTZ,

  -- Terms Acceptance
  terms_accepted BOOLEAN DEFAULT FALSE,
  terms_accepted_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  void_reason TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_contract_action_requests_contract_id ON contract_action_requests(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_action_requests_type ON contract_action_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_contract_action_requests_status ON contract_action_requests(request_status);
CREATE INDEX IF NOT EXISTS idx_contract_action_requests_created_at ON contract_action_requests(created_at DESC);

-- 3. Add columns to contracts table
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS original_principal_amount DECIMAL(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS current_principal_amount DECIMAL(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS total_interest_paid DECIMAL(12,2) DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS total_principal_reduced DECIMAL(12,2) DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS total_principal_increased DECIMAL(12,2) DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS extension_count INT DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS last_action_date TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS last_action_type VARCHAR(50);

-- 4. Add bank account to pawners (for receiving increased principal)
ALTER TABLE pawners ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);
ALTER TABLE pawners ADD COLUMN IF NOT EXISTS bank_account_no VARCHAR(50);
ALTER TABLE pawners ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(200);
ALTER TABLE pawners ADD COLUMN IF NOT EXISTS promptpay_number VARCHAR(20);

-- 5. Create company_bank_accounts table (บัญชีบริษัท)
CREATE TABLE IF NOT EXISTS company_bank_accounts (
  account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name VARCHAR(100) NOT NULL,
  bank_account_no VARCHAR(50) NOT NULL,
  bank_account_name VARCHAR(200) NOT NULL,
  promptpay_number VARCHAR(20),
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default company bank account
INSERT INTO company_bank_accounts (bank_name, bank_account_no, bank_account_name, promptpay_number, is_active, is_default)
VALUES ('พร้อมเพย์', '0626092941', 'ณัฐภัทร ต้อยจัตุรัส', '0626092941', TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- 6. Create slip_verifications table (ประวัติการตรวจสอบสลิป)
CREATE TABLE IF NOT EXISTS slip_verifications (
  verification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  action_request_id UUID REFERENCES contract_action_requests(request_id),
  redemption_id UUID REFERENCES redemption_requests(redemption_id),

  -- Slip Info
  slip_url TEXT NOT NULL,
  expected_amount DECIMAL(12,2) NOT NULL,

  -- AI Verification Result
  detected_amount DECIMAL(12,2),
  amount_difference DECIMAL(12,2),
  verification_result VARCHAR(50) CHECK (verification_result IN (
    'MATCHED', 'UNDERPAID', 'OVERPAID', 'UNREADABLE', 'INVALID'
  )),
  confidence_score DECIMAL(5,2),

  -- AI Response
  ai_model VARCHAR(50) DEFAULT 'gpt-4o-mini',
  ai_response JSONB,
  ai_raw_response TEXT,

  -- Attempt Info
  attempt_number INT DEFAULT 1,
  verified_by VARCHAR(50) DEFAULT 'AI',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slip_verifications_action_request_id ON slip_verifications(action_request_id);
CREATE INDEX IF NOT EXISTS idx_slip_verifications_redemption_id ON slip_verifications(redemption_id);

-- 7. Create trigger for updated_at on contract_action_requests
CREATE OR REPLACE FUNCTION update_contract_action_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contract_action_requests_updated_at ON contract_action_requests;
CREATE TRIGGER trigger_contract_action_requests_updated_at
BEFORE UPDATE ON contract_action_requests
FOR EACH ROW EXECUTE FUNCTION update_contract_action_requests_updated_at();

-- 8. Update existing contracts to set original_principal_amount
UPDATE contracts
SET original_principal_amount = loan_principal_amount,
    current_principal_amount = loan_principal_amount
WHERE original_principal_amount IS NULL;

-- 9. Create function to log contract actions
CREATE OR REPLACE FUNCTION log_contract_action(
  p_contract_id UUID,
  p_action_type VARCHAR(50),
  p_action_status VARCHAR(50),
  p_performed_by VARCHAR(50),
  p_performed_by_line_id VARCHAR(255),
  p_description TEXT DEFAULT NULL,
  p_amount DECIMAL(12,2) DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
  v_contract RECORD;
BEGIN
  -- Get contract details
  SELECT * INTO v_contract FROM contracts WHERE contract_id = p_contract_id;

  INSERT INTO contract_action_logs (
    contract_id,
    customer_id,
    investor_id,
    action_type,
    action_status,
    amount,
    principal_before,
    performed_by,
    performed_by_line_id,
    description,
    metadata
  ) VALUES (
    p_contract_id,
    v_contract.customer_id,
    v_contract.investor_id,
    p_action_type,
    p_action_status,
    p_amount,
    v_contract.current_principal_amount,
    p_performed_by,
    p_performed_by_line_id,
    p_description,
    p_metadata
  ) RETURNING log_id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE contract_action_logs IS 'ตารางเก็บ log ทุก action ที่เกิดขึ้นกับสัญญา';
COMMENT ON TABLE contract_action_requests IS 'ตารางเก็บคำขอ action ต่างๆ เช่น ต่อดอกเบี้ย ลดเงินต้น เพิ่มเงินต้น';
COMMENT ON TABLE company_bank_accounts IS 'ตารางเก็บข้อมูลบัญชีธนาคารของบริษัท';
COMMENT ON TABLE slip_verifications IS 'ตารางเก็บประวัติการตรวจสอบสลิปด้วย AI';
