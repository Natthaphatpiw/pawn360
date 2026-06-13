import { getMockImageUrls } from '@/lib/mock-pawner';
import { loadMockInvestor } from '@/lib/mock-investor';

export const MOCK_CONTRACT_IDS = {
  offer: 'mock-contract-offer-001',
  pending: 'mock-contract-pending-001',
  active: 'mock-contract-active-001',
  extended: 'mock-contract-extended-001',
  approval: 'mock-contract-approval-001',
  overdue: 'mock-contract-overdue-001',
  unredeemed: 'mock-contract-unredeemed-001',
  completed: 'mock-contract-completed-001',
  terminated: 'mock-contract-terminated-001',
};

export const MOCK_ITEM_ID = 'mock-item-actions-001';
export const MOCK_PRINCIPAL_INCREASE_REQUEST_ID = 'mock-principal-increase-request-001';
export const INVESTOR_PRINCIPAL_INCREASE_APPROVAL_STATUSES = new Set([
  'PENDING_INVESTOR_APPROVAL',
  'AWAITING_INVESTOR_APPROVAL',
]);

export const INVESTOR_PRINCIPAL_INCREASE_UPLOAD_STATUSES = new Set([
  'INVESTOR_APPROVED',
  'AWAITING_INVESTOR_PAYMENT',
  'INVESTOR_SLIP_REJECTED',
]);

const DAY = 24 * 60 * 60 * 1000;

const isoFromNow = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

const formatDate = (date: string) => new Date(date).toLocaleDateString('th-TH');

const MOCK_PAWNER_SIGNATURE_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='120' viewBox='0 0 300 120'%3E%3Crect width='300' height='120' fill='white' fill-opacity='0'/%3E%3Cpath d='M30 78 C55 35 78 102 102 62 S145 48 167 70 S210 92 232 56 S260 48 272 70' fill='none' stroke='%23111827' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E";
const MOCK_INVESTOR_SIGNATURE_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='120' viewBox='0 0 300 120'%3E%3Crect width='300' height='120' fill='white' fill-opacity='0'/%3E%3Cpath d='M24 72 C58 38 78 94 108 58 C132 30 156 94 184 60 C208 35 230 78 274 50' fill='none' stroke='%23111827' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E";

export const isInvestorPreviewMode = () => process.env.NEXT_PUBLIC_LIFF_MOCK === 'true';

export function getMockInvestorContracts() {
  return [
    {
      contract_id: MOCK_CONTRACT_IDS.offer,
      contract_number: 'INV-2026-0501',
      created_at: new Date(Date.now() - (60 * 60 * 1000)).toISOString(),
      updated_at: new Date(Date.now() - (60 * 60 * 1000)).toISOString(),
      contract_status: 'PENDING',
      funding_status: 'PENDING',
      payment_status: 'PENDING',
      item_delivery_status: 'PENDING',
      contract_start_date: isoFromNow(-1),
      contract_end_date: isoFromNow(29),
      contract_duration_days: 30,
      loan_principal_amount: 48500,
      interest_amount: 776,
      interest_rate: 0.016,
      platform_fee_rate: 0.001,
      investor_rate: 0.015,
      platform_fee_amount: 49,
      investor_id: null,
      payment_slip_url: null,
      items: {
        item_type: 'โทรศัพท์มือถือ',
        brand: 'Apple',
        model: 'iPhone 15 Pro Max',
        capacity: '256GB',
        item_condition: 94,
        defects: 'รอยขนแมวเล็กน้อยที่ขอบเครื่อง',
        notes: 'แบตเตอรี่ 92% พร้อมกล่อง',
        image_urls: getMockImageUrls('Apple', 'iPhone 15 Pro Max'),
      },
      pawners: {
        bank_name: 'SCB',
        bank_account_name: 'สุภาวดี ตัวอย่าง',
        bank_account_no: '123-456-7890',
      },
    },
    {
      contract_id: MOCK_CONTRACT_IDS.pending,
      contract_number: 'INV-2026-0502',
      contract_status: 'ACTIVE',
      funding_status: 'FUNDED',
      payment_status: 'PENDING',
      item_delivery_status: 'PAWNER_CONFIRMED',
      funded_at: isoFromNow(-1),
      contract_start_date: isoFromNow(-1),
      contract_end_date: isoFromNow(29),
      contract_duration_days: 30,
      loan_principal_amount: 36000,
      interest_amount: 540,
      interest_rate: 0.016,
      platform_fee_rate: 0.001,
      investor_rate: 0.015,
      platform_fee_amount: 36,
      investor_id: 'mock-investor-00000001',
      payment_slip_url: null,
      items: {
        item_type: 'แท็บเล็ต',
        brand: 'Apple',
        model: 'iPad Air 5',
        capacity: '256GB',
        item_condition: 91,
        defects: 'มีรอยเล็กน้อยบริเวณขอบ',
        notes: 'รอผู้ขอสินเชื่อนำส่ง Drop Point',
        image_urls: getMockImageUrls('Apple', 'iPad Air 5'),
      },
      pawners: {
        bank_name: 'SCB',
        bank_account_name: 'มณีรัตน์ ตัวอย่าง',
        bank_account_no: '222-333-4444',
      },
    },
    {
      contract_id: MOCK_CONTRACT_IDS.active,
      contract_number: 'INV-2026-0418',
      contract_status: 'ACTIVE',
      funding_status: 'DISBURSED',
      payment_status: 'COMPLETED',
      item_delivery_status: 'VERIFIED',
      payment_confirmed_at: isoFromNow(-27),
      contract_start_date: isoFromNow(-28),
      contract_end_date: isoFromNow(12),
      contract_duration_days: 40,
      loan_principal_amount: 72000,
      interest_amount: 4080,
      interest_rate: 0.018,
      platform_fee_rate: 0.002,
      investor_rate: 0.016,
      platform_fee_amount: 144,
      investor_id: 'mock-investor-00000001',
      payment_slip_url: '/assets/astly_logo_primary.png',
      items: {
        item_type: 'โน้ตบุค',
        brand: 'Apple',
        model: 'MacBook Air M2',
        capacity: '512GB',
        item_condition: 89,
        defects: 'มุมฝาบนมีรอยใช้งาน',
        notes: 'มีที่ชาร์จแท้และกระเป๋า',
        image_urls: getMockImageUrls('โน้ตบุค', 'MacBook Air M2'),
      },
      pawners: {
        bank_name: 'KBank',
        bank_account_name: 'กิตติศักดิ์ ตัวอย่าง',
        bank_account_no: '987-654-3210',
      },
    },
    {
      contract_id: MOCK_CONTRACT_IDS.extended,
      contract_number: 'INV-2026-0407',
      contract_status: 'EXTENDED',
      funding_status: 'DISBURSED',
      payment_status: 'COMPLETED',
      item_delivery_status: 'VERIFIED',
      payment_confirmed_at: isoFromNow(-34),
      contract_start_date: isoFromNow(-35),
      contract_end_date: isoFromNow(25),
      contract_duration_days: 60,
      loan_principal_amount: 56000,
      interest_amount: 3360,
      interest_rate: 0.018,
      platform_fee_rate: 0.002,
      investor_rate: 0.016,
      platform_fee_amount: 112,
      investor_id: 'mock-investor-00000001',
      payment_slip_url: '/assets/astly_logo_primary.png',
      items: {
        item_type: 'นาฬิกา',
        brand: 'Apple',
        model: 'Watch Ultra 2',
        capacity: 'Titanium',
        item_condition: 92,
        defects: 'สายมีรอยใช้งานเล็กน้อย',
        notes: 'ต่อสัญญาแล้ว สถานะยังปกติ',
        image_urls: getMockImageUrls('Apple', 'Watch Ultra 2'),
      },
      pawners: {
        bank_name: 'KBank',
        bank_account_name: 'ภควัต ตัวอย่าง',
        bank_account_no: '333-444-5555',
      },
    },
    {
      contract_id: MOCK_CONTRACT_IDS.approval,
      contract_number: 'INV-2026-0401',
      contract_status: 'ACTIVE',
      funding_status: 'DISBURSED',
      payment_status: 'COMPLETED',
      item_delivery_status: 'VERIFIED',
      payment_confirmed_at: isoFromNow(-20),
      contract_start_date: isoFromNow(-21),
      contract_end_date: isoFromNow(9),
      contract_duration_days: 30,
      loan_principal_amount: 64000,
      interest_amount: 3072,
      interest_rate: 0.018,
      platform_fee_rate: 0.002,
      investor_rate: 0.016,
      platform_fee_amount: 128,
      investor_id: 'mock-investor-00000001',
      payment_slip_url: '/assets/astly_logo_primary.png',
      items: {
        item_type: 'โน้ตบุค',
        brand: 'Dell',
        model: 'XPS 13 Plus',
        capacity: '1TB',
        item_condition: 88,
        defects: 'มีรอยที่ฝาหลัง',
        notes: 'มีคำขอเพิ่มเงินต้นรออนุมัติ',
        image_urls: getMockImageUrls('Dell', 'XPS 13 Plus'),
      },
      pawners: {
        bank_name: 'BBL',
        bank_account_name: 'ศศิธร ตัวอย่าง',
        bank_account_no: '444-555-6666',
      },
    },
    {
      contract_id: MOCK_CONTRACT_IDS.overdue,
      contract_number: 'INV-2026-0325',
      contract_status: 'ACTIVE',
      funding_status: 'DISBURSED',
      payment_status: 'COMPLETED',
      item_delivery_status: 'VERIFIED',
      payment_confirmed_at: isoFromNow(-35),
      contract_start_date: isoFromNow(-35),
      contract_end_date: isoFromNow(-2),
      contract_duration_days: 33,
      loan_principal_amount: 42000,
      interest_amount: 2016,
      interest_rate: 0.018,
      platform_fee_rate: 0.002,
      investor_rate: 0.016,
      platform_fee_amount: 84,
      investor_id: 'mock-investor-00000001',
      payment_slip_url: '/assets/astly_logo_primary.png',
      items: {
        item_type: 'โทรศัพท์มือถือ',
        brand: 'Samsung',
        model: 'Galaxy S24 Ultra',
        capacity: '512GB',
        item_condition: 90,
        defects: 'รอยใช้งานตามขอบเครื่อง',
        notes: 'เลยกำหนดไม่เกิน 7 วัน',
        image_urls: getMockImageUrls('Samsung', 'Galaxy S24 Ultra'),
      },
      pawners: {
        bank_name: 'Krungthai',
        bank_account_name: 'ธนกร ตัวอย่าง',
        bank_account_no: '555-666-7777',
      },
    },
    {
      contract_id: MOCK_CONTRACT_IDS.unredeemed,
      contract_number: 'INV-2026-0319',
      contract_status: 'ACTIVE',
      funding_status: 'DISBURSED',
      payment_status: 'COMPLETED',
      item_delivery_status: 'VERIFIED',
      payment_confirmed_at: isoFromNow(-45),
      contract_start_date: isoFromNow(-45),
      contract_end_date: isoFromNow(-8),
      contract_duration_days: 37,
      loan_principal_amount: 81000,
      interest_amount: 3888,
      interest_rate: 0.018,
      platform_fee_rate: 0.002,
      investor_rate: 0.016,
      platform_fee_amount: 162,
      investor_id: 'mock-investor-00000001',
      payment_slip_url: '/assets/astly_logo_primary.png',
      items: {
        item_type: 'กล้อง',
        brand: 'Fujifilm',
        model: 'X-T5',
        capacity: 'Body',
        item_condition: 87,
        defects: 'มีรอยที่ฐานกล้อง',
        notes: 'เลยกำหนดตั้งแต่ 7 วันขึ้นไป',
        image_urls: getMockImageUrls('Fujifilm', 'X-T5'),
      },
      pawners: {
        bank_name: 'TTB',
        bank_account_name: 'กานต์ ตัวอย่าง',
        bank_account_no: '666-777-8888',
      },
    },
    {
      contract_id: MOCK_CONTRACT_IDS.completed,
      contract_number: 'INV-2026-0312',
      contract_status: 'COMPLETED',
      funding_status: 'DISBURSED',
      payment_status: 'COMPLETED',
      item_delivery_status: 'VERIFIED',
      completed_at: isoFromNow(-8),
      payment_confirmed_at: isoFromNow(-38),
      contract_start_date: isoFromNow(-65),
      contract_end_date: isoFromNow(-8),
      contract_duration_days: 57,
      loan_principal_amount: 28000,
      interest_amount: 1596,
      interest_rate: 0.017,
      platform_fee_rate: 0.002,
      investor_rate: 0.015,
      platform_fee_amount: 56,
      investor_id: 'mock-investor-00000001',
      payment_slip_url: '/assets/astly_logo_primary.png',
      items: {
        item_type: 'กล้อง',
        brand: 'Sony',
        model: 'ZV-E10',
        capacity: 'Body + Lens',
        item_condition: 86,
        defects: 'ยางรองมีรอยเล็กน้อย',
        notes: 'พร้อมไมค์และแบตเตอรี่ 2 ก้อน',
        image_urls: getMockImageUrls('กล้อง', 'Sony ZV-E10'),
      },
      pawners: {
        bank_name: 'Krungsri',
        bank_account_name: 'ณัฐวุฒิ ตัวอย่าง',
        bank_account_no: '456-123-7890',
      },
    },
    {
      contract_id: MOCK_CONTRACT_IDS.terminated,
      contract_number: 'INV-2026-0304',
      contract_status: 'TERMINATED',
      funding_status: 'FUNDED',
      payment_status: 'PENDING',
      item_delivery_status: 'RETURNED',
      terminated_at: isoFromNow(-6),
      contract_start_date: isoFromNow(-12),
      contract_end_date: isoFromNow(18),
      contract_duration_days: 30,
      loan_principal_amount: 39500,
      interest_amount: 632,
      interest_rate: 0.016,
      platform_fee_rate: 0.001,
      investor_rate: 0.015,
      platform_fee_amount: 40,
      investor_id: 'mock-investor-00000001',
      payment_slip_url: null,
      items: {
        item_type: 'เครื่องเล่นเกม',
        brand: 'Sony',
        model: 'PlayStation 5',
        capacity: 'Disc Edition',
        item_condition: 72,
        defects: 'Serial ไม่ตรงกับข้อมูลที่แจ้ง',
        notes: 'Drop Point ปฏิเสธสินค้าและยกเลิกสัญญา',
        image_urls: getMockImageUrls('Sony', 'PlayStation 5'),
      },
      pawners: {
        bank_name: 'Krungsri',
        bank_account_name: 'วรพล ตัวอย่าง',
        bank_account_no: '777-888-9999',
      },
    },
  ];
}

export function getMockInvestorPortfolioContracts() {
  return getMockInvestorContracts().filter((contract) => Boolean(contract.investor_id));
}

export function getMockContractById(contractId?: string | null) {
  return getMockInvestorContracts().find((contract) => contract.contract_id === contractId) || null;
}

export function getMockOfferContract() {
  return getMockContractById(MOCK_CONTRACT_IDS.offer);
}

export function getMockInvestorProfile() {
  return loadMockInvestor();
}

export function getMockPawnTicket(contractId?: string | null) {
  const contract = getMockContractById(contractId) || getMockOfferContract();
  const investor = getMockInvestorProfile();
  if (!contract) return null;

  const principal = Number(contract.loan_principal_amount || 0);
  const interest = Number(contract.interest_amount || 0);

  return {
    shopName: 'Pawnly',
    branch: 'Siam Square Branch',
    bookNo: 'B-2605',
    ticketNo: contract.contract_number,
    date: formatDate(contract.contract_start_date),
    dueDate: formatDate(contract.contract_end_date),
    investor: {
      name: `${investor.firstname} ${investor.lastname}`,
      idCard: '1-2345-67890-12-3',
      address: `${investor.addr_house_no || '123'} แขวงคลองตัน เขตวัฒนา กรุงเทพมหานคร ${investor.addr_postcode || '10110'}`,
      bankName: investor.bank_name || 'Bangkok Bank',
      bankAccountNo: investor.bank_account_no || '123-4-56789-0',
      signatureUrl: MOCK_INVESTOR_SIGNATURE_URL,
      signatureInitials: `${investor.firstname?.charAt(0) || 'A'}.${investor.lastname?.charAt(0) || 'I'}.`,
    },
    pawner: {
      signatureUrl: MOCK_PAWNER_SIGNATURE_URL,
    },
    items: [
      {
        seq: 1,
        description: `${contract.items?.brand} ${contract.items?.model} ${contract.items?.capacity || ''}`.trim(),
        serial: 'S/N: MOCK-PREVIEW-001',
      },
    ],
    amount: `${principal.toLocaleString()} บาท`,
    interestAmount: `${interest.toLocaleString()} บาท`,
    totalAmount: `${(principal + interest).toLocaleString()} บาท`,
    amountText: 'รวมเงินต้นและดอกเบี้ยตามสัญญาตัวอย่าง',
    interestRate: `${((contract.interest_rate || 0) * 100).toFixed(2)}%`,
    contractDuration: contract.contract_duration_days,
  };
}

export function getMockItemActionData() {
  return {
    item: {
      _id: MOCK_ITEM_ID,
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      type: 'โทรศัพท์มือถือ',
      serialNo: 'APL-MOCK-15001',
      condition: 94,
      defects: 'รอยขนแมวเล็กน้อย',
      note: 'พร้อมกล่องและสายชาร์จ',
      accessories: 'สายชาร์จ USB-C',
      images: getMockImageUrls('Apple', 'iPhone 15 Pro Max'),
      status: 'DRAFT',
      estimatedValue: 48500,
      desiredAmount: 42000,
      loanDays: 30,
      interestRate: 10,
    },
    stores: [
      { _id: 'mock-store-01', storeName: 'Pawnly Rama 9', interestRate: 10 },
      { _id: 'mock-store-02', storeName: 'Pawnly On Nut', interestRate: 9.5 },
    ],
    customer: {
      _id: 'mock-customer-0001',
      lineId: 'Umock_dev_user_001',
      fullName: 'สมหญิง ทดสอบ',
      phone: '0891234567',
      contractsID: ['mock-contract-active-001'],
      storeId: ['mock-store-01'],
      pawnRequests: ['mock-loan-20260424-001'],
    },
  };
}

export function getMockPrincipalIncreaseRequest(requestId?: string | null) {
  const contract = getMockContractById(MOCK_CONTRACT_IDS.approval);
  const investor = getMockInvestorProfile();
  if (!contract) return null;

  const currentPrincipal = Number(contract.loan_principal_amount || 0);
  const increaseAmount = 15000;
  const principalAfterIncrease = currentPrincipal + increaseAmount;

  return {
    request_id: requestId || MOCK_PRINCIPAL_INCREASE_REQUEST_ID,
    contract_id: contract.contract_id,
    request_status: 'PENDING_INVESTOR_APPROVAL',
    increase_amount: increaseAmount,
    new_principal_amount: principalAfterIncrease,
    principal_after_increase: principalAfterIncrease,
    pawner_bank_name: contract.pawners?.bank_name || 'SCB',
    pawner_bank_account_no: contract.pawners?.bank_account_no || '123-456-7890',
    pawner_bank_account_name: contract.pawners?.bank_account_name || 'สุภาวดี ตัวอย่าง',
    contract: {
      ...contract,
      current_principal_amount: currentPrincipal,
      original_principal_amount: currentPrincipal,
      investors: {
        investor_id: investor.investor_id,
        firstname: investor.firstname,
        lastname: investor.lastname,
      },
    },
  };
}

export function getMockPrincipalIncreaseRequestForContract(contractId?: string | null) {
  if (contractId !== MOCK_CONTRACT_IDS.approval) {
    return null;
  }

  return getMockPrincipalIncreaseRequest();
}

export function getInvestorPrincipalIncreaseStatusMeta(status?: string | null) {
  switch (status) {
    case 'PENDING_INVESTOR_APPROVAL':
    case 'AWAITING_INVESTOR_APPROVAL':
      return {
        label: 'คำขอรออนุมัติ',
        description: 'ผู้ขอสินเชื่อกำลังรอให้คุณอนุมัติการเพิ่มเงินต้น',
      };
    case 'INVESTOR_APPROVED':
    case 'AWAITING_INVESTOR_PAYMENT':
    case 'INVESTOR_SLIP_REJECTED':
      return {
        label: 'อนุมัติแล้ว รอโอนเงิน',
        description: 'คำขอนี้ผ่านการอนุมัติแล้ว และกำลังรอการโอนเงินจากนักลงทุน',
      };
    case 'INVESTOR_TRANSFERRED':
    case 'AWAITING_PAWNER_CONFIRM':
      return {
        label: 'รอผู้ขอสินเชื่อยืนยัน',
        description: 'นักลงทุนโอนเงินแล้ว กำลังรอผู้ขอสินเชื่อยืนยันการรับเงิน',
      };
    case 'COMPLETED':
      return {
        label: 'ดำเนินการสำเร็จ',
        description: 'การเพิ่มเงินต้นเสร็จสมบูรณ์แล้ว',
      };
    case 'INVESTOR_REJECTED':
      return {
        label: 'คำขอถูกปฏิเสธ',
        description: 'นักลงทุนปฏิเสธคำขอเพิ่มเงินต้นนี้แล้ว',
      };
    default:
      return {
        label: status || 'ไม่ทราบสถานะ',
        description: 'สถานะคำขอปัจจุบัน',
      };
  }
}
