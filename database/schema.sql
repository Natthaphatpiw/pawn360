-- =====================================================
-- P2P Pawn Platform Database Schema (Supabase/PostgreSQL)
-- ระบบตัวกลางจำนำ P2P
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. USERS & AUTHENTICATION TABLES
-- =====================================================

-- Table: pawners (ผู้จำนำ/ลูกค้า)
CREATE TABLE pawners (
  customer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_id VARCHAR(255) UNIQUE NOT NULL,
  firstname VARCHAR(100) NOT NULL,
  lastname VARCHAR(100) NOT NULL,
  customer_signature_id VARCHAR(255),

  -- ข้อมูลติดต่อ
  phone_number VARCHAR(20) NOT NULL,
  national_id VARCHAR(13) UNIQUE,
  email VARCHAR(255),

  -- ข้อมูลที่อยู่
  addr_house_no VARCHAR(50),
  addr_village VARCHAR(100),
  addr_street VARCHAR(100),
  addr_sub_district VARCHAR(100),
  addr_district VARCHAR(100),
  addr_province VARCHAR(100),
  addr_country VARCHAR(50) DEFAULT 'Thailand',
  addr_postcode VARCHAR(10),

  -- KYC (eKYC via UpPass)
  kyc_status VARCHAR(50) DEFAULT 'NOT_VERIFIED' CHECK (kyc_status IN ('NOT_VERIFIED', 'PENDING', 'VERIFIED', 'REJECTED')),
  uppass_slug VARCHAR(255) UNIQUE,
  kyc_verified_at TIMESTAMP,
  kyc_rejection_reason TEXT,
  kyc_data JSONB,

  -- ข้อมูลธนาคาร
  bank_name VARCHAR(100),
  bank_account_no VARCHAR(50),
  bank_account_type VARCHAR(20) CHECK (bank_account_type IN ('SAVINGS', 'CURRENT')),
  bank_account_name VARCHAR(200),

  -- Status & Metadata
  is_active BOOLEAN DEFAULT TRUE,
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_reason TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,

  -- Indexes
  CONSTRAINT valid_phone CHECK (phone_number ~ '^\+?[0-9]{9,15}$')
);

CREATE INDEX idx_pawners_line_id ON pawners(line_id);
CREATE INDEX idx_pawners_phone ON pawners(phone_number);
CREATE INDEX idx_pawners_kyc_status ON pawners(kyc_status);

-- Table: investors (ผู้ลงทุน/ผู้ปล่อยสินเชื่อ)
CREATE TABLE investors (
  investor_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_id VARCHAR(255) UNIQUE NOT NULL,
  firstname VARCHAR(100) NOT NULL,
  lastname VARCHAR(100) NOT NULL,
  investor_signature_id VARCHAR(255),

  -- ข้อมูลติดต่อ
  phone_number VARCHAR(20) NOT NULL,
  national_id VARCHAR(13) UNIQUE,
  email VARCHAR(255),

  -- ข้อมูลที่อยู่
  addr_house_no VARCHAR(50),
  addr_village VARCHAR(100),
  addr_street VARCHAR(100),
  addr_sub_district VARCHAR(100),
  addr_district VARCHAR(100),
  addr_province VARCHAR(100),
  addr_country VARCHAR(50) DEFAULT 'Thailand',
  addr_postcode VARCHAR(10),

  -- KYC (eKYC via UpPass)
  kyc_status VARCHAR(50) DEFAULT 'NOT_VERIFIED' CHECK (kyc_status IN ('NOT_VERIFIED', 'PENDING', 'VERIFIED', 'REJECTED')),
  uppass_slug VARCHAR(255) UNIQUE,
  kyc_verified_at TIMESTAMP,
  kyc_rejection_reason TEXT,
  kyc_data JSONB,

  -- ข้อมูลธนาคาร
  bank_name VARCHAR(100),
  bank_account_no VARCHAR(50),
  bank_account_type VARCHAR(20) CHECK (bank_account_type IN ('SAVINGS', 'CURRENT')),
  bank_account_name VARCHAR(200),

  -- Investor Settings
  auto_invest_enabled BOOLEAN DEFAULT FALSE,
  preferred_loan_types VARCHAR(50)[],
  min_investment_amount DECIMAL(12,2) DEFAULT 1000,
  max_investment_amount DECIMAL(12,2),

  -- Status & Metadata
  is_active BOOLEAN DEFAULT TRUE,
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_reason TEXT,
  investor_tier VARCHAR(20) DEFAULT 'STANDARD' CHECK (investor_tier IN ('STANDARD', 'PREMIUM', 'VIP')),

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,

  CONSTRAINT valid_phone CHECK (phone_number ~ '^\+?[0-9]{9,15}$')
);

CREATE INDEX idx_investors_line_id ON investors(line_id);
CREATE INDEX idx_investors_phone ON investors(phone_number);
CREATE INDEX idx_investors_kyc_status ON investors(kyc_status);

-- Table: drop_points (จุดเก็บสินค้า/Drop Point)
CREATE TABLE drop_points (
  drop_point_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  drop_point_name VARCHAR(255) NOT NULL,
  drop_point_code VARCHAR(20) UNIQUE NOT NULL,

  -- ข้อมูลติดต่อ
  phone_number VARCHAR(20) NOT NULL,
  email VARCHAR(255),

  -- ข้อมูลที่อยู่
  addr_house_no VARCHAR(50),
  addr_village VARCHAR(100),
  addr_street VARCHAR(100),
  addr_sub_district VARCHAR(100),
  addr_district VARCHAR(100),
  addr_province VARCHAR(100),
  addr_country VARCHAR(50) DEFAULT 'Thailand',
  addr_postcode VARCHAR(10),

  -- Location
  google_map_url TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),

  -- Operational Info
  opening_hours JSONB, -- {"monday": "09:00-18:00", ...}
  capacity INTEGER DEFAULT 100,
  current_items_count INTEGER DEFAULT 0,

  -- Manager Info
  manager_name VARCHAR(200),
  manager_phone VARCHAR(20),
  manager_line_id VARCHAR(255),

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_accepting_items BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_drop_points_province ON drop_points(addr_province);
CREATE INDEX idx_drop_points_active ON drop_points(is_active);

-- Table: admin_users (ผู้ดูแลระบบ)
CREATE TABLE admin_users (
  admin_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,

  firstname VARCHAR(100),
  lastname VARCHAR(100),
  phone_number VARCHAR(20),

  role VARCHAR(50) NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'SUPPORT')),
  permissions JSONB,

  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_admin_users_email ON admin_users(email);

-- =====================================================
-- 2. WALLET & FINANCIAL TABLES
-- =====================================================

-- Table: wallets (กระเป๋าเงินของ Investor)
CREATE TABLE wallets (
  wallet_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  investor_id UUID NOT NULL REFERENCES investors(investor_id) ON DELETE CASCADE,

  -- Balance Information
  available_balance DECIMAL(12,2) DEFAULT 0 CHECK (available_balance >= 0),
  committed_balance DECIMAL(12,2) DEFAULT 0 CHECK (committed_balance >= 0),
  total_balance DECIMAL(12,2) GENERATED ALWAYS AS (available_balance + committed_balance) STORED,

  -- Limits
  maximum_commitment DECIMAL(12,2),

  -- Statistics
  total_invested DECIMAL(12,2) DEFAULT 0,
  total_earned DECIMAL(12,2) DEFAULT 0,
  total_withdrawn DECIMAL(12,2) DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(investor_id)
);

CREATE INDEX idx_wallets_investor_id ON wallets(investor_id);

-- Table: wallet_transactions (ประวัติธุรกรรมกระเป๋าเงิน)
CREATE TABLE wallet_transactions (
  transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(wallet_id) ON DELETE CASCADE,

  transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN (
    'DEPOSIT', 'WITHDRAWAL', 'COMMITMENT', 'COMMITMENT_RELEASE',
    'INVESTMENT', 'REPAYMENT', 'INTEREST_EARNED', 'FEE', 'REFUND'
  )),

  amount DECIMAL(12,2) NOT NULL,
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,

  reference_type VARCHAR(50), -- 'CONTRACT', 'PAYMENT', 'MANUAL'
  reference_id UUID,

  description TEXT,
  metadata JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_type ON wallet_transactions(transaction_type);
CREATE INDEX idx_wallet_transactions_created_at ON wallet_transactions(created_at DESC);

-- =====================================================
-- 3. ITEMS & PRODUCTS TABLES
-- =====================================================

-- Table: items (สินค้าที่นำมาจำนำ)
CREATE TABLE items (
  item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES pawners(customer_id) ON DELETE CASCADE,

  -- Item Basic Info
  item_type VARCHAR(50) NOT NULL CHECK (item_type IN (
    'โทรศัพท์มือถือ', 'อุปกรณ์เสริมโทรศัพท์', 'กล้อง', 'Apple', 'โน้ตบุค'
  )),
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(255) NOT NULL,

  -- Item Details (Dynamic based on type)
  capacity VARCHAR(50),
  serial_number VARCHAR(255),

  -- Laptop specific
  cpu VARCHAR(100),
  ram VARCHAR(50),
  storage VARCHAR(50),
  gpu VARCHAR(100),

  -- Condition & Valuation
  item_condition INTEGER CHECK (item_condition >= 0 AND item_condition <= 100),
  ai_condition_score DECIMAL(5,2), -- From AI analysis
  ai_condition_reason TEXT,

  estimated_value DECIMAL(12,2) NOT NULL,
  ai_confidence DECIMAL(5,4),

  -- Description
  accessories TEXT,
  defects TEXT,
  notes TEXT,

  -- Images
  image_urls TEXT[] NOT NULL,

  -- Status
  item_status VARCHAR(50) DEFAULT 'PENDING' CHECK (item_status IN (
    'PENDING', 'APPROVED', 'REJECTED', 'IN_CONTRACT', 'RETURNED', 'LIQUIDATED'
  )),

  -- Drop Point
  drop_point_id UUID REFERENCES drop_points(drop_point_id),
  received_at_drop_point TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_items_customer_id ON items(customer_id);
CREATE INDEX idx_items_status ON items(item_status);
CREATE INDEX idx_items_type ON items(item_type);
CREATE INDEX idx_items_drop_point ON items(drop_point_id);

-- Table: item_lenses (เลนส์สำหรับกล้อง)
CREATE TABLE item_lenses (
  lens_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,

  lens_model VARCHAR(255) NOT NULL,
  lens_serial_number VARCHAR(255),
  lens_condition INTEGER CHECK (lens_condition >= 0 AND lens_condition <= 100),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_item_lenses_item_id ON item_lenses(item_id);

-- Table: item_valuations (ประวัติการประเมินราคา)
CREATE TABLE item_valuations (
  valuation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,

  valuation_type VARCHAR(50) NOT NULL CHECK (valuation_type IN ('AI_INITIAL', 'MANUAL_REVIEW', 'DROP_POINT_VERIFY')),
  valuated_by VARCHAR(50), -- 'AI', admin_id, drop_point_id

  estimated_value DECIMAL(12,2) NOT NULL,
  condition_score INTEGER,
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_item_valuations_item_id ON item_valuations(item_id);

-- =====================================================
-- 4. LOAN REQUESTS & OFFERS
-- =====================================================

-- Table: loan_requests (คำขอจำนำจากลูกค้า)
CREATE TABLE loan_requests (
  request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES pawners(customer_id) ON DELETE CASCADE,

  requested_amount DECIMAL(12,2) NOT NULL,
  requested_duration_days INTEGER NOT NULL,

  drop_point_id UUID REFERENCES drop_points(drop_point_id),
  delivery_method VARCHAR(50) CHECK (delivery_method IN ('WALK_IN', 'DELIVERY', 'COURIER')),
  delivery_fee DECIMAL(8,2) DEFAULT 0,

  request_status VARCHAR(50) DEFAULT 'PENDING' CHECK (request_status IN (
    'PENDING', 'AWAITING_OFFERS', 'OFFER_ACCEPTED', 'FUNDED', 'REJECTED', 'EXPIRED', 'CANCELLED'
  )),

  expires_at TIMESTAMP, -- 4 hours from creation

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_loan_requests_item_id ON loan_requests(item_id);
CREATE INDEX idx_loan_requests_customer_id ON loan_requests(customer_id);
CREATE INDEX idx_loan_requests_status ON loan_requests(request_status);
CREATE INDEX idx_loan_requests_expires_at ON loan_requests(expires_at);

-- Table: loan_offers (ข้อเสนอจาก Investor)
CREATE TABLE loan_offers (
  offer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES loan_requests(request_id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES investors(investor_id) ON DELETE CASCADE,

  offer_amount DECIMAL(12,2) NOT NULL,
  interest_rate DECIMAL(5,4) NOT NULL, -- เช่น 0.05 = 5%
  duration_days INTEGER NOT NULL,

  offer_status VARCHAR(50) DEFAULT 'PENDING' CHECK (offer_status IN (
    'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'
  )),

  expires_at TIMESTAMP,
  accepted_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_loan_offers_request_id ON loan_offers(request_id);
CREATE INDEX idx_loan_offers_investor_id ON loan_offers(investor_id);
CREATE INDEX idx_loan_offers_status ON loan_offers(offer_status);

-- =====================================================
-- 5. CONTRACTS & AGREEMENTS
-- =====================================================

-- Table: contracts (สัญญาจำนำ)
CREATE TABLE contracts (
  contract_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_number VARCHAR(50) UNIQUE NOT NULL, -- Format: CTR-YYYYMMDD-XXXX

  -- Parties
  customer_id UUID NOT NULL REFERENCES pawners(customer_id),
  investor_id UUID NOT NULL REFERENCES investors(investor_id),
  drop_point_id UUID REFERENCES drop_points(drop_point_id),

  -- Related
  item_id UUID NOT NULL REFERENCES items(item_id),
  loan_request_id UUID REFERENCES loan_requests(request_id),
  loan_offer_id UUID REFERENCES loan_offers(offer_id),

  -- Contract Terms
  contract_start_date TIMESTAMP NOT NULL DEFAULT NOW(),
  contract_end_date TIMESTAMP NOT NULL,
  contract_duration_days INTEGER NOT NULL,

  -- Financial Terms
  loan_principal_amount DECIMAL(12,2) NOT NULL,
  interest_rate DECIMAL(5,4) NOT NULL,
  interest_amount DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL, -- principal + interest

  platform_fee_rate DECIMAL(5,4) NOT NULL DEFAULT 0.10, -- 10% of interest
  platform_fee_amount DECIMAL(12,2) NOT NULL,

  -- Payment Status
  amount_paid DECIMAL(12,2) DEFAULT 0,
  interest_paid DECIMAL(12,2) DEFAULT 0,
  principal_paid DECIMAL(12,2) DEFAULT 0,

  -- Contract Status
  contract_status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (contract_status IN (
    'PENDING_SIGNATURE', 'ACTIVE', 'COMPLETED', 'DEFAULTED', 'EXTENDED', 'TERMINATED', 'LIQUIDATED'
  )),

  funding_status VARCHAR(50) DEFAULT 'PENDING' CHECK (funding_status IN (
    'PENDING', 'FUNDED', 'DISBURSED'
  )),

  -- Contract Relationships (สำหรับการต่อสัญญา)
  parent_contract_id UUID REFERENCES contracts(contract_id),
  original_contract_id UUID REFERENCES contracts(contract_id),

  -- Documents
  contract_file_url TEXT,
  signed_contract_url TEXT,

  -- Timestamps
  funded_at TIMESTAMP,
  disbursed_at TIMESTAMP,
  completed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_contracts_customer_id ON contracts(customer_id);
CREATE INDEX idx_contracts_investor_id ON contracts(investor_id);
CREATE INDEX idx_contracts_item_id ON contracts(item_id);
CREATE INDEX idx_contracts_status ON contracts(contract_status);
CREATE INDEX idx_contracts_end_date ON contracts(contract_end_date);
CREATE INDEX idx_contracts_number ON contracts(contract_number);

-- =====================================================
-- 6. PAYMENTS & REPAYMENTS
-- =====================================================

-- Table: payments (การชำระเงิน)
CREATE TABLE payments (
  payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,

  payment_type VARCHAR(50) NOT NULL CHECK (payment_type IN (
    'PRINCIPAL', 'INTEREST', 'FULL_REPAYMENT', 'PARTIAL_REPAYMENT', 'LATE_FEE', 'EXTENSION_FEE'
  )),

  amount DECIMAL(12,2) NOT NULL,
  principal_portion DECIMAL(12,2) DEFAULT 0,
  interest_portion DECIMAL(12,2) DEFAULT 0,
  fee_portion DECIMAL(12,2) DEFAULT 0,

  payment_method VARCHAR(50) CHECK (payment_method IN (
    'BANK_TRANSFER', 'PROMPTPAY', 'CREDIT_CARD', 'CASH', 'WALLET'
  )),

  payment_status VARCHAR(50) DEFAULT 'PENDING' CHECK (payment_status IN (
    'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'
  )),

  -- Payment Details
  transaction_ref VARCHAR(255),
  payment_slip_url TEXT,
  bank_name VARCHAR(100),

  -- Verification
  verified_by UUID REFERENCES admin_users(admin_id),
  verified_at TIMESTAMP,

  payment_date TIMESTAMP DEFAULT NOW(),

  notes TEXT,
  metadata JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payments_contract_id ON payments(contract_id);
CREATE INDEX idx_payments_status ON payments(payment_status);
CREATE INDEX idx_payments_date ON payments(payment_date DESC);

-- Table: repayment_schedules (ตารางการชำระเงิน)
CREATE TABLE repayment_schedules (
  schedule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,

  due_date DATE NOT NULL,
  amount_due DECIMAL(12,2) NOT NULL,
  principal_due DECIMAL(12,2) NOT NULL,
  interest_due DECIMAL(12,2) NOT NULL,

  amount_paid DECIMAL(12,2) DEFAULT 0,

  schedule_status VARCHAR(50) DEFAULT 'PENDING' CHECK (schedule_status IN (
    'PENDING', 'PAID', 'PARTIAL_PAID', 'OVERDUE', 'WAIVED'
  )),

  paid_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_repayment_schedules_contract_id ON repayment_schedules(contract_id);
CREATE INDEX idx_repayment_schedules_due_date ON repayment_schedules(due_date);
CREATE INDEX idx_repayment_schedules_status ON repayment_schedules(schedule_status);

-- =====================================================
-- 7. PLATFORM REVENUE & ANALYTICS
-- =====================================================

-- Table: platform_revenue (รายได้แพลตฟอร์ม)
CREATE TABLE platform_revenue (
  revenue_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES contracts(contract_id),

  revenue_type VARCHAR(50) NOT NULL CHECK (revenue_type IN (
    'INTEREST_FEE', 'LATE_FEE', 'EXTENSION_FEE', 'LIQUIDATION_FEE', 'SERVICE_FEE'
  )),

  amount DECIMAL(12,2) NOT NULL,

  description TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_platform_revenue_contract_id ON platform_revenue(contract_id);
CREATE INDEX idx_platform_revenue_type ON platform_revenue(revenue_type);
CREATE INDEX idx_platform_revenue_created_at ON platform_revenue(created_at DESC);

-- =====================================================
-- 8. NOTIFICATIONS & LOGS
-- =====================================================

-- Table: notifications (การแจ้งเตือน)
CREATE TABLE notifications (
  notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('PAWNER', 'INVESTOR', 'ADMIN')),
  recipient_id UUID NOT NULL,

  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,

  related_entity_type VARCHAR(50), -- 'CONTRACT', 'PAYMENT', 'ITEM', etc.
  related_entity_id UUID,

  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,

  sent_via VARCHAR(20)[] DEFAULT ARRAY['IN_APP'], -- 'IN_APP', 'LINE', 'EMAIL', 'SMS'

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_type, recipient_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- Table: activity_logs (บันทึกกิจกรรม)
CREATE TABLE activity_logs (
  log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('PAWNER', 'INVESTOR', 'ADMIN', 'SYSTEM')),
  actor_id UUID,

  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,

  description TEXT,
  metadata JSONB,

  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_actor ON activity_logs(actor_type, actor_id);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- =====================================================
-- 9. TRIGGERS FOR AUTO-UPDATE
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_pawners_updated_at BEFORE UPDATE ON pawners FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_investors_updated_at BEFORE UPDATE ON investors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_drop_points_updated_at BEFORE UPDATE ON drop_points FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loan_requests_updated_at BEFORE UPDATE ON loan_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loan_offers_updated_at BEFORE UPDATE ON loan_offers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 10. VIEWS FOR COMMON QUERIES
-- =====================================================

-- View: Active Contracts Summary
CREATE VIEW v_active_contracts AS
SELECT
  c.contract_id,
  c.contract_number,
  c.customer_id,
  CONCAT(p.firstname, ' ', p.lastname) as customer_name,
  c.investor_id,
  CONCAT(i.firstname, ' ', i.lastname) as investor_name,
  c.loan_principal_amount,
  c.total_amount,
  c.amount_paid,
  (c.total_amount - c.amount_paid) as remaining_amount,
  c.contract_start_date,
  c.contract_end_date,
  c.contract_status,
  CASE
    WHEN c.contract_end_date < NOW() AND c.contract_status = 'ACTIVE' THEN 'OVERDUE'
    WHEN c.contract_end_date <= NOW() + INTERVAL '7 days' THEN 'DUE_SOON'
    ELSE 'NORMAL'
  END as payment_status_flag
FROM contracts c
JOIN pawners p ON c.customer_id = p.customer_id
JOIN investors i ON c.investor_id = i.investor_id
WHERE c.contract_status IN ('ACTIVE', 'PENDING_SIGNATURE');

-- View: Investor Portfolio
CREATE VIEW v_investor_portfolio AS
SELECT
  i.investor_id,
  CONCAT(i.firstname, ' ', i.lastname) as investor_name,
  w.available_balance,
  w.committed_balance,
  w.total_balance,
  COUNT(DISTINCT c.contract_id) as active_contracts,
  SUM(c.loan_principal_amount) as total_principal_invested,
  SUM(c.amount_paid) as total_repayments_received,
  SUM(CASE WHEN c.contract_status = 'COMPLETED' THEN c.interest_amount ELSE 0 END) as total_interest_earned
FROM investors i
LEFT JOIN wallets w ON i.investor_id = w.investor_id
LEFT JOIN contracts c ON i.investor_id = c.investor_id
WHERE i.is_active = TRUE
GROUP BY i.investor_id, i.firstname, i.lastname, w.available_balance, w.committed_balance, w.total_balance;

-- =====================================================
-- 11. SAMPLE DATA (Optional for testing)
-- =====================================================

-- Insert sample drop points
-- INSERT INTO drop_points (drop_point_name, drop_point_code, phone_number, addr_province, addr_district, google_map_url)
-- VALUES
--   ('สาขา สยามสแควร์', 'DP-SIAM', '02-111-1111', 'กรุงเทพมหานคร', 'ปทุมวัน', 'https://maps.google.com/?q=Siam+Square'),
--   ('สาขา เซ็นทรัล ลาดพร้าว', 'DP-LADPRAO', '02-222-2222', 'กรุงเทพมหานคร', 'จตุจักร', 'https://maps.google.com/?q=Central+Plaza+Ladprao'),
--   ('สาขา ปิ่นเกล้า', 'DP-PINKLAO', '02-333-3333', 'กรุงเทพมหานคร', 'บางกอกน้อย', 'https://maps.google.com/?q=Central+Pinklao');

-- =====================================================
-- END OF SCHEMA
-- =====================================================
