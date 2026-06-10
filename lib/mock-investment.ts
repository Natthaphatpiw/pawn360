import { getMockImageUrls } from '@/lib/mock-pawner';
import { loadMockInvestor } from '@/lib/mock-investor';

export const MOCK_CONTRACT_IDS = {
  offer: 'mock-contract-offer-001',
  active: 'mock-contract-active-001',
  completed: 'mock-contract-completed-001',
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

export const isInvestorPreviewMode = () => process.env.NEXT_PUBLIC_LIFF_MOCK === 'true';

export function getMockInvestorContracts() {
  return [
    {
      contract_id: MOCK_CONTRACT_IDS.offer,
      contract_number: 'INV-2026-0501',
      created_at: new Date(Date.now() - (60 * 60 * 1000)).toISOString(),
      contract_status: 'PENDING',
      funding_status: 'PENDING',
      payment_status: 'PENDING',
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
      contract_id: MOCK_CONTRACT_IDS.active,
      contract_number: 'INV-2026-0418',
      contract_status: 'ACTIVE',
      funding_status: 'DISBURSED',
      payment_status: 'COMPLETED',
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
      contract_id: MOCK_CONTRACT_IDS.completed,
      contract_number: 'INV-2026-0312',
      contract_status: 'COMPLETED',
      funding_status: 'DISBURSED',
      payment_status: 'COMPLETED',
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
  ];
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
    },
    pawner: {
      signatureUrl: null,
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
  const contract = getMockContractById(MOCK_CONTRACT_IDS.active);
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
  if (contractId !== MOCK_CONTRACT_IDS.active) {
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
