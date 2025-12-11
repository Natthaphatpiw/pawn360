-- =====================================================
-- Migration: Update Redemption Flow
-- Changes:
-- 1. Add company bank account details
-- 2. Add photo receipt requirement for pawners
-- 3. Add support contact information
-- 4. Update redemption flow status tracking
-- =====================================================

-- 1. Add company bank account table
CREATE TABLE IF NOT EXISTS company_bank_accounts (
  account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name VARCHAR(200) NOT NULL,
  account_number VARCHAR(50) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  promptpay_number VARCHAR(20),
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(account_number, bank_name)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_active ON company_bank_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_default ON company_bank_accounts(is_default);

-- Insert default company bank account
INSERT INTO company_bank_accounts (account_name, account_number, bank_name, promptpay_number, is_active, is_default)
VALUES ('ณัฐภัทร ต้อยจัตุรัส', '0626092941', 'พร้อมเพย์', '0626092941', TRUE, TRUE)
ON CONFLICT (account_number, bank_name) DO NOTHING;

-- 2. Add support contact information table
CREATE TABLE IF NOT EXISTS support_contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_type VARCHAR(50) NOT NULL CHECK (contact_type IN ('PHONE', 'EMAIL', 'LINE')),
  contact_value VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_support_contacts_active ON support_contacts(is_active, priority);

-- Insert support contact
INSERT INTO support_contacts (contact_type, contact_value, display_name, is_active, priority)
VALUES ('PHONE', '0626092941', 'ฝ่ายสนับสนุน', TRUE, 1)
ON CONFLICT DO NOTHING;

-- 3. Add columns to redemption_requests table for photo receipts
ALTER TABLE redemption_requests
ADD COLUMN IF NOT EXISTS pawner_receipt_photos TEXT[],
ADD COLUMN IF NOT EXISTS pawner_receipt_uploaded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pawner_receipt_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS support_contact_used VARCHAR(20);

-- 4. Update redemption status to include photo receipt requirement
-- (The existing status includes 'COMPLETED' which we'll use after photo receipt)

-- 5. Add redemption completion tracking
ALTER TABLE redemption_requests
ADD COLUMN IF NOT EXISTS item_return_confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS final_completion_at TIMESTAMPTZ;

-- 6. Create trigger for updated_at on new tables
CREATE OR REPLACE FUNCTION update_company_bank_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_company_bank_accounts_updated_at ON company_bank_accounts;
CREATE TRIGGER trigger_company_bank_accounts_updated_at
BEFORE UPDATE ON company_bank_accounts
FOR EACH ROW EXECUTE FUNCTION update_company_bank_accounts_updated_at();

CREATE OR REPLACE FUNCTION update_support_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_support_contacts_updated_at ON support_contacts;
CREATE TRIGGER trigger_support_contacts_updated_at
BEFORE UPDATE ON support_contacts
FOR EACH ROW EXECUTE FUNCTION update_support_contacts_updated_at();

-- 7. Update existing redemption_requests to include photo receipt status
-- (This will be handled in the application logic)

COMMENT ON TABLE company_bank_accounts IS 'บัญชีธนาคารของบริษัทสำหรับรับชำระเงินไถ่ถอน';
COMMENT ON TABLE support_contacts IS 'ข้อมูลติดต่อฝ่ายสนับสนุนลูกค้า';

-- =====================================================
-- END OF MIGRATION
-- =====================================================