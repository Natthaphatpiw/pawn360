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
-- 11. MOCK DATA INSERTS
-- =====================================================

-- Insert mock drop points
INSERT INTO drop_points (drop_point_id, drop_point_name, drop_point_code, phone_number, email,
                        addr_house_no, addr_street, addr_sub_district, addr_district, addr_province, addr_country, addr_postcode,
                        google_map_url, latitude, longitude, opening_hours, capacity, current_items_count,
                        manager_name, manager_phone, manager_line_id, is_active, is_accepting_items)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'สาขา สยามสแควร์', 'DP-SIAM', '021111111', 'siam@pawnline.com',
   '123', 'พระรามที่ 1', 'ปทุมวัน', 'ปทุมวัน', 'กรุงเทพมหานคร', 'Thailand', '10330',
   'https://maps.google.com/?q=Siam+Square', 13.7456, 100.5346,
   '{"monday": "09:00-21:00", "tuesday": "09:00-21:00", "wednesday": "09:00-21:00", "thursday": "09:00-21:00", "friday": "09:00-21:00", "saturday": "09:00-20:00", "sunday": "10:00-20:00"}',
   200, 45, 'นายสมชาย จิตดี', '0811111111', 'U1234567890abcdef', TRUE, TRUE),

  ('550e8400-e29b-41d4-a716-446655440002', 'สาขา เซ็นทรัล ลาดพร้าว', 'DP-LADPRAO', '022222222', 'ladprao@pawnline.com',
   '456', 'พหลโยธิน', 'จตุจักร', 'จตุจักร', 'กรุงเทพมหานคร', 'Thailand', '10900',
   'https://maps.google.com/?q=Central+Plaza+Ladprao', 13.8196, 100.5592,
   '{"monday": "10:00-22:00", "tuesday": "10:00-22:00", "wednesday": "10:00-22:00", "thursday": "10:00-22:00", "friday": "10:00-22:00", "saturday": "10:00-21:00", "sunday": "11:00-21:00"}',
   150, 28, 'นางสาวสมหญิง ใจดี', '0812222222', 'U1234567890abcdef222', TRUE, TRUE),

  ('550e8400-e29b-41d4-a716-446655440003', 'สาขา ปิ่นเกล้า', 'DP-PINKLAO', '023333333', 'pinklao@pawnline.com',
   '789', 'อ่อนนุช', 'บางกอกน้อย', 'บางกอกน้อย', 'กรุงเทพมหานคร', 'Thailand', '10700',
   'https://maps.google.com/?q=Central+Pinklao', 13.7597, 100.4771,
   '{"monday": "09:00-20:00", "tuesday": "09:00-20:00", "wednesday": "09:00-20:00", "thursday": "09:00-20:00", "friday": "09:00-20:00", "saturday": "09:00-19:00", "sunday": "10:00-19:00"}',
   100, 12, 'นายวัชรพล สดใส', '0813333333', 'U1234567890abcdef333', TRUE, TRUE);

-- Insert mock admin users
INSERT INTO admin_users (admin_id, username, email, password_hash, firstname, lastname, phone_number, role, permissions, is_active)
VALUES
  ('660e8400-e29b-41d4-a716-446655440001', 'superadmin', 'superadmin@pawnline.com', '$2b$10$dummy.hash.for.mock.data', 'อดุลย์', 'แอดมิน', '0810000001', 'SUPER_ADMIN', '{"all": true}', TRUE),
  ('660e8400-e29b-41d4-a716-446655440002', 'admin1', 'admin1@pawnline.com', '$2b$10$dummy.hash.for.mock.data', 'สมชาย', 'ดูแล', '0810000002', 'ADMIN', '{"users": true, "contracts": true, "reports": true}', TRUE),
  ('660e8400-e29b-41d4-a716-446655440003', 'support1', 'support1@pawnline.com', '$2b$10$dummy.hash.for.mock.data', 'สมหญิง', 'ช่วยเหลือ', '0810000003', 'SUPPORT', '{"support": true}', TRUE);

-- Insert mock pawners (customers)
INSERT INTO pawners (customer_id, line_id, firstname, lastname, customer_signature_id, phone_number, national_id, email,
                    addr_house_no, addr_street, addr_sub_district, addr_district, addr_province, addr_country, addr_postcode,
                    kyc_status, uppass_slug, kyc_verified_at, bank_name, bank_account_no, bank_account_type, bank_account_name,
                    is_active, is_blocked, created_at, updated_at)
VALUES
  ('770e8400-e29b-41d4-a716-446655440001', 'pawner001', 'วิชัย', 'พานิชย์', 'sig_001', '0811111111', '1234567890123', 'wichai@email.com',
   '15/5', 'สุขุมวิท', 'คลองเตย', 'คลองเตย', 'กรุงเทพมหานคร', 'Thailand', '10110',
   'VERIFIED', 'uppass_001', NOW() - INTERVAL '30 days', 'กสิกรไทย', '1234567890', 'SAVINGS', 'วิชัย พานิชย์',
   TRUE, FALSE, NOW() - INTERVAL '60 days', NOW() - INTERVAL '5 days'),

  ('770e8400-e29b-41d4-a716-446655440002', 'pawner002', 'นรินทร์', 'สุวรรณ', 'sig_002', '0812222222', '2345678901234', 'narinth@email.com',
   '42', 'สาทร', 'สาทร', 'สาทร', 'กรุงเทพมหานคร', 'Thailand', '10120',
   'VERIFIED', 'uppass_002', NOW() - INTERVAL '45 days', 'ไทยพาณิชย์', '2345678901', 'SAVINGS', 'นรินทร์ สุวรรณ',
   TRUE, FALSE, NOW() - INTERVAL '90 days', NOW() - INTERVAL '10 days'),

  ('770e8400-e29b-41d4-a716-446655440003', 'pawner003', 'ปรียาภรณ์', 'นาคสุข', 'sig_003', '0813333333', '3456789012345', 'priyapon@email.com',
   '88/1', 'เพชรบุรี', 'ทุ่งพญาไท', 'ราชเทวี', 'กรุงเทพมหานคร', 'Thailand', '10400',
   'VERIFIED', 'uppass_003', NOW() - INTERVAL '20 days', 'กรุงศรีอยุธยา', '3456789012', 'CURRENT', 'ปรียาภรณ์ นาคสุข',
   TRUE, FALSE, NOW() - INTERVAL '45 days', NOW() - INTERVAL '2 days'),

  ('770e8400-e29b-41d4-a716-446655440004', 'pawner004', 'ธนพล', 'รัตนชัย', 'sig_004', '0814444444', '4567890123456', 'thanapon@email.com',
   '25', 'ลาดพร้าว', 'ลาดพร้าว', 'ลาดพร้าว', 'กรุงเทพมหานคร', 'Thailand', '10230',
   'PENDING', 'uppass_004', NULL, 'กรุงไทย', '4567890123', 'SAVINGS', 'ธนพล รัตนชัย',
   TRUE, FALSE, NOW() - INTERVAL '15 days', NOW() - INTERVAL '1 day'),

  ('770e8400-e29b-41d4-a716-446655440005', 'pawner005', 'สุนิสา', 'จันทรา', 'sig_005', '0815555555', '5678901234567', 'sunisa@email.com',
   '67', 'พหลโยธิน', 'พญาไท', 'พญาไท', 'กรุงเทพมหานคร', 'Thailand', '10400',
   'VERIFIED', 'uppass_005', NOW() - INTERVAL '60 days', 'ธนชาติ', '5678901234', 'SAVINGS', 'สุนิสา จันทรา',
   TRUE, FALSE, NOW() - INTERVAL '120 days', NOW() - INTERVAL '15 days');

-- Insert mock investors
INSERT INTO investors (investor_id, line_id, firstname, lastname, investor_signature_id, phone_number, national_id, email,
                      addr_house_no, addr_street, addr_sub_district, addr_district, addr_province, addr_country, addr_postcode,
                      kyc_status, uppass_slug, kyc_verified_at, bank_name, bank_account_no, bank_account_type, bank_account_name,
                      auto_invest_enabled, preferred_loan_types, min_investment_amount, max_investment_amount,
                      is_active, is_blocked, investor_tier, created_at, updated_at)
VALUES
  ('880e8400-e29b-41d4-a716-446655440001', 'investor001', 'ภาคภูมิ', 'วงศ์สวัสดิ์', 'inv_sig_001', '0821111111', '1111111111111', 'pakpoom@email.com',
   '100', 'สีลม', 'สีลม', 'บางรัก', 'กรุงเทพมหานคร', 'Thailand', '10500',
   'VERIFIED', 'inv_uppass_001', NOW() - INTERVAL '90 days', 'กสิกรไทย', '1111111111', 'CURRENT', 'ภาคภูมิ วงศ์สวัสดิ์',
   TRUE, ARRAY['โทรศัพท์มือถือ', 'โน้ตบุค'], 5000.00, 500000.00,
   TRUE, FALSE, 'VIP', NOW() - INTERVAL '180 days', NOW() - INTERVAL '30 days'),

  ('880e8400-e29b-41d4-a716-446655440002', 'investor002', 'วรัญญา', 'ชัยวัฒน์', 'inv_sig_002', '0822222222', '2222222222222', 'woranya@email.com',
   '250', 'สุขุมวิท', 'คลองเตย', 'คลองเตย', 'กรุงเทพมหานคร', 'Thailand', '10110',
   'VERIFIED', 'inv_uppass_002', NOW() - INTERVAL '60 days', 'ไทยพาณิชย์', '2222222222', 'SAVINGS', 'วรัญญา ชัยวัฒน์',
   TRUE, ARRAY['โทรศัพท์มือถือ', 'กล้อง', 'Apple'], 10000.00, 200000.00,
   TRUE, FALSE, 'PREMIUM', NOW() - INTERVAL '120 days', NOW() - INTERVAL '15 days'),

  ('880e8400-e29b-41d4-a716-446655440003', 'investor003', 'ประเสริฐ', 'ธนากร', 'inv_sig_003', '0823333333', '3333333333333', 'praset@email.com',
   '75', 'อารีย์', 'พญาไท', 'พญาไท', 'กรุงเทพมหานคร', 'Thailand', '10400',
   'VERIFIED', 'inv_uppass_003', NOW() - INTERVAL '120 days', 'กรุงศรีอยุธยา', '3333333333', 'CURRENT', 'ประเสริฐ ธนากร',
   FALSE, ARRAY['อุปกรณ์เสริมโทรศัพท์'], 2000.00, 100000.00,
   TRUE, FALSE, 'STANDARD', NOW() - INTERVAL '200 days', NOW() - INTERVAL '45 days'),

  ('880e8400-e29b-41d4-a716-446655440004', 'investor004', 'นันทนา', 'พิพัฒน์', 'inv_sig_004', '0824444444', '4444444444444', 'nuntana@email.com',
   '150', 'พระรามที่ 4', 'ปทุมวัน', 'ปทุมวัน', 'กรุงเทพมหานคร', 'Thailand', '10330',
   'VERIFIED', 'inv_uppass_004', NOW() - INTERVAL '30 days', 'กรุงไทย', '4444444444', 'SAVINGS', 'นันทนา พิพัฒน์',
   TRUE, ARRAY['โทรศัพท์มือถือ', 'โน้ตบุค', 'Apple'], 15000.00, 300000.00,
   TRUE, FALSE, 'PREMIUM', NOW() - INTERVAL '90 days', NOW() - INTERVAL '7 days');

-- Insert mock wallets for investors
INSERT INTO wallets (wallet_id, investor_id, available_balance, committed_balance, maximum_commitment, total_invested, total_earned, total_withdrawn, is_active, created_at, updated_at)
VALUES
  ('990e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 150000.00, 50000.00, 200000.00, 450000.00, 22500.00, 150000.00, TRUE, NOW() - INTERVAL '180 days', NOW() - INTERVAL '1 day'),
  ('990e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440002', 300000.00, 75000.00, 500000.00, 280000.00, 14000.00, 80000.00, TRUE, NOW() - INTERVAL '120 days', NOW() - INTERVAL '2 days'),
  ('990e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440003', 50000.00, 15000.00, 100000.00, 80000.00, 3200.00, 20000.00, TRUE, NOW() - INTERVAL '200 days', NOW() - INTERVAL '5 days'),
  ('990e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440004', 200000.00, 30000.00, 300000.00, 150000.00, 7500.00, 50000.00, TRUE, NOW() - INTERVAL '90 days', NOW() - INTERVAL '3 days');

-- Insert mock items
INSERT INTO items (item_id, customer_id, item_type, brand, model, capacity, serial_number, cpu, ram, storage, gpu,
                  item_condition, ai_condition_score, ai_condition_reason, estimated_value, ai_confidence,
                  accessories, defects, notes, image_urls, item_status, drop_point_id, received_at_drop_point, created_at, updated_at)
VALUES
  ('aa0e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440001', 'โทรศัพท์มือถือ', 'Apple', 'iPhone 14 Pro', '256GB', 'F2L123456789', NULL, NULL, NULL, NULL,
   95, 94.5, 'สภาพดีเยี่ยม ไม่มีรอยขีดข่วน', 32000.00, 0.92,
   'กล่อง เคส กระจกนิรภัย', 'ไม่มี', 'ใช้งานน้อย ซื้อใหม่ปีที่แล้ว', ARRAY['https://example.com/item1_1.jpg', 'https://example.com/item1_2.jpg'],
   'APPROVED', '550e8400-e29b-41d4-a716-446655440001', NOW() - INTERVAL '7 days', NOW() - INTERVAL '10 days', NOW() - INTERVAL '2 days'),

  ('aa0e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440002', 'โน้ตบุค', 'Apple', 'MacBook Pro M2', '512GB', 'F3M987654321', 'Apple M2', '16GB', '512GB SSD', 'Integrated',
   88, 87.2, 'สภาพดี มีรอยขีดเล็กน้อย', 55000.00, 0.89,
   'ชาร์จเจอร์ กล่อง', 'รอยขีดที่ฝา', 'ใช้ทำงานประจำ', ARRAY['https://example.com/item2_1.jpg', 'https://example.com/item2_2.jpg'],
   'APPROVED', '550e8400-e29b-41d4-a716-446655440002', NOW() - INTERVAL '5 days', NOW() - INTERVAL '8 days', NOW() - INTERVAL '1 day'),

  ('aa0e8400-e29b-41d4-a716-446655440003', '770e8400-e29b-41d4-a716-446655440003', 'กล้อง', 'Canon', 'EOS R5', NULL, 'C5R123456789', NULL, NULL, NULL, NULL,
   92, 91.8, 'สภาพดีเยี่ยม', 120000.00, 0.94,
   'เลนส์ 2 ตัว ชาร์จเจอร์ แบตเตอรี่', 'ไม่มี', 'ใช้ถ่ายงานแต่งงาน', ARRAY['https://example.com/item3_1.jpg', 'https://example.com/item3_2.jpg', 'https://example.com/item3_3.jpg'],
   'APPROVED', '550e8400-e29b-41d4-a716-446655440001', NOW() - INTERVAL '3 days', NOW() - INTERVAL '6 days', NOW() - INTERVAL '1 day'),

  ('aa0e8400-e29b-41d4-a716-446655440004', '770e8400-e29b-41d4-a716-446655440004', 'โทรศัพท์มือถือ', 'Samsung', 'Galaxy S23 Ultra', '256GB', 'G2S456789012', NULL, NULL, NULL, NULL,
   85, 84.3, 'สภาพดี มีรอยขีดที่กรอบ', 28000.00, 0.87,
   'กล่อง ชาร์จเร็ว S Pen', 'รอยขีดที่กรอบ', 'ใช้งานปกติ', ARRAY['https://example.com/item4_1.jpg', 'https://example.com/item4_2.jpg'],
   'PENDING', NULL, NULL, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),

  ('aa0e8400-e29b-41d4-a716-446655440005', '770e8400-e29b-41d4-a716-446655440005', 'อุปกรณ์เสริมโทรศัพท์', 'Apple', 'AirPods Pro (2nd Gen)', NULL, 'AP2P789012345', NULL, NULL, NULL, NULL,
   90, 89.7, 'สภาพดีเยี่ยม', 8500.00, 0.91,
   'เคสหูฟัง กล่อง', 'ไม่มี', 'หูฟังไร้สายชั้นนำ', ARRAY['https://example.com/item5_1.jpg'],
   'APPROVED', '550e8400-e29b-41d4-a716-446655440003', NOW() - INTERVAL '4 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '1 day');

-- Insert mock item lenses (for camera)
INSERT INTO item_lenses (lens_id, item_id, lens_model, lens_serial_number, lens_condition, created_at)
VALUES
  ('bb0e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440003', 'Canon RF 24-70mm f/2.8L IS USM', 'RF2470F28123456', 95, NOW() - INTERVAL '6 days'),
  ('bb0e8400-e29b-41d4-a716-446655440002', 'aa0e8400-e29b-41d4-a716-446655440003', 'Canon RF 70-200mm f/2.8L IS USM', 'RF70200F28789012', 90, NOW() - INTERVAL '6 days');

-- Insert mock item valuations
INSERT INTO item_valuations (valuation_id, item_id, valuation_type, valuated_by, estimated_value, condition_score, notes, created_at)
VALUES
  ('cc0e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440001', 'AI_INITIAL', 'AI', 32000.00, 95, 'AI valuation based on market data', NOW() - INTERVAL '10 days'),
  ('cc0e8400-e29b-41d4-a716-446655440002', 'aa0e8400-e29b-41d4-a716-446655440002', 'AI_INITIAL', 'AI', 55000.00, 88, 'AI valuation based on market data', NOW() - INTERVAL '8 days'),
  ('cc0e8400-e29b-41d4-a716-446655440003', 'aa0e8400-e29b-41d4-a716-446655440003', 'AI_INITIAL', 'AI', 120000.00, 92, 'AI valuation based on market data', NOW() - INTERVAL '6 days'),
  ('cc0e8400-e29b-41d4-a716-446655440004', 'aa0e8400-e29b-41d4-a716-446655440003', 'DROP_POINT_VERIFY', '550e8400-e29b-41d4-a716-446655440001', 118000.00, 90, 'Verified at drop point - condition confirmed', NOW() - INTERVAL '5 days');

-- Insert mock loan requests
INSERT INTO loan_requests (request_id, item_id, customer_id, requested_amount, requested_duration_days, drop_point_id, delivery_method, delivery_fee, request_status, expires_at, created_at, updated_at)
VALUES
  ('dd0e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440001', 25000.00, 90, '550e8400-e29b-41d4-a716-446655440001', 'WALK_IN', 0.00, 'OFFER_ACCEPTED', NOW() - INTERVAL '6 days', NOW() - INTERVAL '10 days', NOW() - INTERVAL '6 days'),
  ('dd0e8400-e29b-41d4-a716-446655440002', 'aa0e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440002', 40000.00, 120, '550e8400-e29b-41d4-a716-446655440002', 'DELIVERY', 150.00, 'OFFER_ACCEPTED', NOW() - INTERVAL '4 days', NOW() - INTERVAL '8 days', NOW() - INTERVAL '4 days'),
  ('dd0e8400-e29b-41d4-a716-446655440003', 'aa0e8400-e29b-41d4-a716-446655440003', '770e8400-e29b-41d4-a716-446655440003', 80000.00, 180, '550e8400-e29b-41d4-a716-446655440001', 'COURIER', 200.00, 'AWAITING_OFFERS', NOW() + INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),
  ('dd0e8400-e29b-41d4-a716-446655440004', 'aa0e8400-e29b-41d4-a716-446655440005', '770e8400-e29b-41d4-a716-446655440005', 6500.00, 60, '550e8400-e29b-41d4-a716-446655440003', 'WALK_IN', 0.00, 'PENDING', NOW() + INTERVAL '4 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day');

-- Insert mock loan offers
INSERT INTO loan_offers (offer_id, request_id, investor_id, offer_amount, interest_rate, duration_days, offer_status, expires_at, accepted_at, created_at, updated_at)
VALUES
  ('ee0e8400-e29b-41d4-a716-446655440001', 'dd0e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 25000.00, 0.025, 90, 'ACCEPTED', NOW() - INTERVAL '5 days', NOW() - INTERVAL '6 days', NOW() - INTERVAL '9 days', NOW() - INTERVAL '6 days'),
  ('ee0e8400-e29b-41d4-a716-446655440002', 'dd0e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440002', 24000.00, 0.028, 90, 'REJECTED', NOW() - INTERVAL '5 days', NULL, NOW() - INTERVAL '8 days', NOW() - INTERVAL '6 days'),
  ('ee0e8400-e29b-41d4-a716-446655440003', 'dd0e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', 40000.00, 0.022, 120, 'ACCEPTED', NOW() - INTERVAL '3 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '4 days'),
  ('ee0e8400-e29b-41d4-a716-446655440004', 'dd0e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440004', 75000.00, 0.020, 180, 'PENDING', NOW() + INTERVAL '1 day', NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  ('ee0e8400-e29b-41d4-a716-446655440005', 'dd0e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440002', 78000.00, 0.021, 180, 'PENDING', NOW() + INTERVAL '1 day', NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day');

-- Insert mock contracts
INSERT INTO contracts (contract_id, contract_number, customer_id, investor_id, drop_point_id, item_id, loan_request_id, loan_offer_id,
                      contract_start_date, contract_end_date, contract_duration_days,
                      loan_principal_amount, interest_rate, interest_amount, total_amount, platform_fee_rate, platform_fee_amount,
                      amount_paid, interest_paid, principal_paid, contract_status, funding_status,
                      funded_at, disbursed_at, created_at, updated_at)
VALUES
  ('ff0e8400-e29b-41d4-a716-446655440001', 'CTR-20241201-0001', '770e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440001', 'dd0e8400-e29b-41d4-a716-446655440001', 'ee0e8400-e29b-41d4-a716-446655440001',
   NOW() - INTERVAL '60 days', NOW() - INTERVAL '30 days' + INTERVAL '90 days', 90,
   25000.00, 0.025, 625.00, 25625.00, 0.10, 62.50,
   25625.00, 625.00, 25000.00, 'COMPLETED', 'DISBURSED',
   NOW() - INTERVAL '59 days', NOW() - INTERVAL '58 days', NOW() - INTERVAL '60 days', NOW() - INTERVAL '30 days'),

  ('ff0e8400-e29b-41d4-a716-446655440002', 'CTR-20241201-0002', '770e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 'aa0e8400-e29b-41d4-a716-446655440002', 'dd0e8400-e29b-41d4-a716-446655440002', 'ee0e8400-e29b-41d4-a716-446655440003',
   NOW() - INTERVAL '45 days', NOW() + INTERVAL '75 days', 120,
   40000.00, 0.022, 880.00, 40880.00, 0.10, 88.00,
   20440.00, 440.00, 20000.00, 'ACTIVE', 'DISBURSED',
   NOW() - INTERVAL '44 days', NOW() - INTERVAL '43 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '2 days'),

  ('ff0e8400-e29b-41d4-a716-446655440003', 'CTR-20241201-0003', '770e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440003', NULL, NULL,
   NOW() - INTERVAL '30 days', NOW() + INTERVAL '150 days', 180,
   75000.00, 0.020, 1500.00, 76500.00, 0.10, 150.00,
   0.00, 0.00, 0.00, 'PENDING_SIGNATURE', 'PENDING',
   NULL, NULL, NOW() - INTERVAL '30 days', NOW() - INTERVAL '1 day');

-- Insert mock payments
INSERT INTO payments (payment_id, contract_id, payment_type, amount, principal_portion, interest_portion, fee_portion, payment_method, payment_status, transaction_ref, verified_by, verified_at, payment_date, notes, created_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655440010', 'ff0e8400-e29b-41d4-a716-446655440001', 'FULL_REPAYMENT', 25625.00, 25000.00, 625.00, 0.00, 'BANK_TRANSFER', 'COMPLETED', 'TXN_20241230_001', '660e8400-e29b-41d4-a716-446655440002', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', 'Full repayment on due date', NOW() - INTERVAL '30 days'),
  ('550e8400-e29b-41d4-a716-446655440011', 'ff0e8400-e29b-41d4-a716-446655440002', 'INTEREST', 440.00, 0.00, 440.00, 0.00, 'PROMPTPAY', 'COMPLETED', 'TXN_20241215_002', '660e8400-e29b-41d4-a716-446655440002', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days', 'Monthly interest payment', NOW() - INTERVAL '15 days'),
  ('550e8400-e29b-41d4-a716-446655440012', 'ff0e8400-e29b-41d4-a716-446655440002', 'PRINCIPAL', 10000.00, 10000.00, 0.00, 0.00, 'BANK_TRANSFER', 'COMPLETED', 'TXN_20241201_003', '660e8400-e29b-41d4-a716-446655440002', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', 'Partial principal repayment', NOW() - INTERVAL '1 day');

-- Insert mock repayment schedules
INSERT INTO repayment_schedules (schedule_id, contract_id, due_date, amount_due, principal_due, interest_due, amount_paid, schedule_status, paid_at, created_at)
VALUES
  ('660e8400-e29b-41d4-a716-446655440010', 'ff0e8400-e29b-41d4-a716-446655440001', NOW() - INTERVAL '30 days', 25625.00, 25000.00, 625.00, 25625.00, 'PAID', NOW() - INTERVAL '30 days', NOW() - INTERVAL '60 days'),
  ('660e8400-e29b-41d4-a716-446655440011', 'ff0e8400-e29b-41d4-a716-446655440002', NOW() + INTERVAL '15 days', 1360.00, 3333.33, 26.67, 0.00, 'PENDING', NULL, NOW() - INTERVAL '45 days'),
  ('660e8400-e29b-41d4-a716-446655440012', 'ff0e8400-e29b-41d4-a716-446655440002', NOW() + INTERVAL '45 days', 1360.00, 3333.33, 26.67, 0.00, 'PENDING', NULL, NOW() - INTERVAL '45 days'),
  ('660e8400-e29b-41d4-a716-446655440013', 'ff0e8400-e29b-41d4-a716-446655440002', NOW() + INTERVAL '75 days', 1360.00, 3333.33, 26.67, 0.00, 'PENDING', NULL, NOW() - INTERVAL '45 days');

-- Insert mock platform revenue
INSERT INTO platform_revenue (revenue_id, contract_id, revenue_type, amount, description, created_at)
VALUES
  ('770e8400-e29b-41d4-a716-446655440010', 'ff0e8400-e29b-41d4-a716-446655440001', 'INTEREST_FEE', 62.50, 'Platform fee from completed contract interest', NOW() - INTERVAL '30 days'),
  ('770e8400-e29b-41d4-a716-446655440011', 'ff0e8400-e29b-41d4-a716-446655440002', 'INTEREST_FEE', 44.00, 'Platform fee from interest payment', NOW() - INTERVAL '15 days');

-- Insert mock wallet transactions
INSERT INTO wallet_transactions (transaction_id, wallet_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_at)
VALUES
  ('880e8400-e29b-41d4-a716-446655440010', '990e8400-e29b-41d4-a716-446655440001', 'COMMITMENT', 25000.00, 150000.00, 125000.00, 'CONTRACT', 'ff0e8400-e29b-41d4-a716-446655440001', 'Fund commitment for contract CTR-20241201-0001', NOW() - INTERVAL '59 days'),
  ('880e8400-e29b-41d4-a716-446655440011', '990e8400-e29b-41d4-a716-446655440001', 'REPAYMENT', 25625.00, 125000.00, 150625.00, 'PAYMENT', '550e8400-e29b-41d4-a716-446655440010', 'Full repayment received', NOW() - INTERVAL '30 days'),
  ('880e8400-e29b-41d4-a716-446655440012', '990e8400-e29b-41d4-a716-446655440001', 'COMMITMENT_RELEASE', 25000.00, 150625.00, 175625.00, 'CONTRACT', 'ff0e8400-e29b-41d4-a716-446655440001', 'Commitment released after repayment', NOW() - INTERVAL '30 days'),
  ('880e8400-e29b-41d4-a716-446655440013', '990e8400-e29b-41d4-a716-446655440001', 'INTEREST_EARNED', 562.50, 175625.00, 176187.50, 'PAYMENT', '550e8400-e29b-41d4-a716-446655440010', 'Interest earned from contract', NOW() - INTERVAL '30 days');

-- Insert mock notifications
INSERT INTO notifications (notification_id, recipient_type, recipient_id, notification_type, title, message, related_entity_type, related_entity_id, is_read, sent_via, created_at)
VALUES
  ('990e8400-e29b-41d4-a716-446655440010', 'PAWNER', '770e8400-e29b-41d4-a716-446655440001', 'CONTRACT_COMPLETED', 'สัญญาเสร็จสิ้น', 'สัญญาจำนำของคุณได้เสร็จสิ้นแล้ว คุณสามารถมารับสินค้าได้ที่จุดรับฝาก', 'CONTRACT', 'ff0e8400-e29b-41d4-a716-446655440001', TRUE, ARRAY['IN_APP', 'LINE'], NOW() - INTERVAL '30 days'),
  ('990e8400-e29b-41d4-a716-446655440011', 'INVESTOR', '880e8400-e29b-41d4-a716-446655440001', 'PAYMENT_RECEIVED', 'ได้รับการชำระเงิน', 'คุณได้รับการชำระเงินเต็มจำนวนจากสัญญา CTR-20241201-0001', 'PAYMENT', '550e8400-e29b-41d4-a716-446655440010', TRUE, ARRAY['IN_APP', 'LINE'], NOW() - INTERVAL '30 days'),
  ('990e8400-e29b-41d4-a716-446655440012', 'PAWNER', '770e8400-e29b-41d4-a716-446655440002', 'PAYMENT_REMINDER', 'ใกล้ถึงกำหนดชำระ', 'สัญญาจำนำของคุณจะครบกำหนดในอีก 15 วัน กรุณาชำระเงินให้ตรงเวลา', 'CONTRACT', 'ff0e8400-e29b-41d4-a716-446655440002', FALSE, ARRAY['IN_APP', 'LINE'], NOW() - INTERVAL '2 days'),
  ('990e8400-e29b-41d4-a716-446655440013', 'ADMIN', '660e8400-e29b-41d4-a716-446655440001', 'NEW_CONTRACT', 'สัญญาใหม่', 'มีสัญญาจำนำใหม่ที่รอการอนุมัติ CTR-20241201-0003', 'CONTRACT', 'ff0e8400-e29b-41d4-a716-446655440003', TRUE, ARRAY['IN_APP'], NOW() - INTERVAL '30 days');

-- Insert mock activity logs
INSERT INTO activity_logs (log_id, actor_type, actor_id, action, entity_type, entity_id, description, metadata, ip_address, user_agent, created_at)
VALUES
  ('aa0e8400-e29b-41d4-a716-446655440010', 'PAWNER', '770e8400-e29b-41d4-a716-446655440001', 'CREATE_LOAN_REQUEST', 'LOAN_REQUEST', 'dd0e8400-e29b-41d4-a716-446655440001', 'Customer created loan request for iPhone 14 Pro', '{"item_type": "โทรศัพท์มือถือ", "requested_amount": 25000}', '192.168.1.100', 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)', NOW() - INTERVAL '10 days'),
  ('aa0e8400-e29b-41d4-a716-446655440011', 'INVESTOR', '880e8400-e29b-41d4-a716-446655440001', 'CREATE_LOAN_OFFER', 'LOAN_OFFER', 'ee0e8400-e29b-41d4-a716-446655440001', 'Investor submitted loan offer', '{"offer_amount": 25000, "interest_rate": 0.025}', '192.168.1.101', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', NOW() - INTERVAL '9 days'),
  ('aa0e8400-e29b-41d4-a716-446655440012', 'PAWNER', '770e8400-e29b-41d4-a716-446655440001', 'ACCEPT_LOAN_OFFER', 'LOAN_OFFER', 'ee0e8400-e29b-41d4-a716-446655440001', 'Customer accepted loan offer', '{"accepted_amount": 25000}', '192.168.1.100', 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)', NOW() - INTERVAL '6 days'),
  ('aa0e8400-e29b-41d4-a716-446655440013', 'ADMIN', '660e8400-e29b-41d4-a716-446655440002', 'VERIFY_PAYMENT', 'PAYMENT', '550e8400-e29b-41d4-a716-446655440010', 'Admin verified payment transaction', '{"payment_amount": 25625}', '10.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', NOW() - INTERVAL '30 days'),
  ('aa0e8400-e29b-41d4-a716-446655440014', 'SYSTEM', NULL, 'CONTRACT_COMPLETED', 'CONTRACT', 'ff0e8400-e29b-41d4-a716-446655440001', 'Contract automatically marked as completed', '{"completion_reason": "FULL_REPAYMENT"}', NULL, 'SYSTEM', NOW() - INTERVAL '30 days');

-- =====================================================
-- END OF SCHEMA
-- =====================================================
