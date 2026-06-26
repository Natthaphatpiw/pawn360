import { getMockImageUrls, isMockPawnerMode, waitMock } from '@/lib/mock-pawner';

export type MockContractItem = {
  item_id: string;
  item_type: string;
  brand: string;
  model: string;
  capacity: string | null;
  estimated_value: number;
  item_condition: number;
  image_urls: string[];
  accessories?: string | null;
  defects?: string | null;
  notes?: string | null;
  serial_number?: string | null;
};

export type MockContractListItem = {
  contract_id: string;
  contract_number: string;
  contract_start_date: string;
  contract_end_date: string;
  contract_duration_days: number;
  loan_principal_amount: number;
  interest_rate: number;
  interest_amount: number;
  total_amount: number;
  amount_paid: number;
  contract_status: string;
  redemption_status?: string | null;
  funding_status: string;
  items: MockContractItem;
  remainingDays: number;
  displayStatus: string;
};

export type MockActionItem = {
  request_id: string;
  request_type: string;
  request_status: string;
  increase_amount?: number | null;
  reduction_amount?: number | null;
  interest_to_pay?: number | null;
  total_amount?: number | null;
  created_at: string;
  updated_at: string;
  contract?: {
    contract_id: string;
    contract_number: string;
    items?: MockContractItem | null;
  } | null;
};

export type MockContractDetail = {
  contract_id: string;
  contract_number: string;
  contract_start_date: string;
  contract_end_date: string;
  contract_duration_days: number;
  loan_principal_amount: number;
  original_principal_amount?: number | null;
  current_principal_amount?: number | null;
  interest_rate: number;
  interest_amount: number;
  total_amount: number;
  amount_paid: number;
  interest_paid: number;
  principal_paid: number;
  contract_status: string;
  redemption_status?: string | null;
  funding_status: string;
  payment_status?: string | null;
  item_delivery_status?: string | null;
  contract_file_url: string | null;
  customer: {
    customer_id: string;
    firstname: string;
    lastname: string;
    phone_number: string;
    national_id: string;
  };
  investor: {
    investor_id: string;
    firstname: string;
    lastname: string;
    phone_number: string;
  } | null;
  item: MockContractItem;
  drop_point: {
    drop_point_id: string;
    drop_point_name: string;
    drop_point_code: string;
    phone_number: string;
    addr_house_no: string;
    addr_street: string;
    addr_sub_district: string;
    addr_district: string;
    addr_province: string;
    addr_postcode: string;
    google_map_url: string | null;
    map_embed?: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  remainingDays: number;
  displayStatus: string;
  remainingAmount: number;
  remainingPrincipal: number;
  remainingInterest: number;
};

const mockContractList: MockContractListItem[] = [
  {
    contract_id: 'mock-contract-001',
    contract_number: 'PW-2026-000184',
    contract_start_date: '2026-04-03T00:00:00.000Z',
    contract_end_date: '2026-05-03T00:00:00.000Z',
    contract_duration_days: 30,
    loan_principal_amount: 24500,
    interest_rate: 0.1,
    interest_amount: 2205,
    total_amount: 26705,
    amount_paid: 0,
    contract_status: 'CONFIRMED',
    funding_status: 'FUNDED',
    items: {
      item_id: 'mock-item-iphone',
      item_type: 'Apple',
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      capacity: '256GB',
      estimated_value: 28900,
      item_condition: 94,
      image_urls: getMockImageUrls('Apple', 'iPhone 15 Pro Max'),
      accessories: 'กล่อง, สายชาร์จ',
      defects: 'มีรอยขนแมวเล็กน้อยที่ขอบเครื่อง',
      notes: 'สภาพโดยรวมดีมาก ใช้งานปกติทุกฟังก์ชัน',
      serial_number: 'APL-IP15PM-256-001',
    },
    remainingDays: 6,
    displayStatus: 'ใกล้ครบกำหนด',
  },
  {
    contract_id: 'mock-contract-002',
    contract_number: 'PW-2026-000197',
    contract_start_date: '2026-04-10T00:00:00.000Z',
    contract_end_date: '2026-05-10T00:00:00.000Z',
    contract_duration_days: 30,
    loan_principal_amount: 16800,
    interest_rate: 0.09,
    interest_amount: 1512,
    total_amount: 18312,
    amount_paid: 0,
    contract_status: 'CONFIRMED',
    funding_status: 'FUNDED',
    items: {
      item_id: 'mock-item-macbook',
      item_type: 'โน้ตบุค',
      brand: 'Apple',
      model: 'MacBook Air M2',
      capacity: '512GB',
      estimated_value: 23200,
      item_condition: 89,
      image_urls: getMockImageUrls('โน้ตบุค', 'MacBook Air M2'),
      accessories: 'ที่ชาร์จ',
      defects: 'รอยขีดเล็กน้อยบริเวณฝาหลัง',
      notes: 'แบตเตอรี่ยังดี เหมาะกับการใช้งานทั่วไป',
      serial_number: 'APL-MBA-M2-512-002',
    },
    remainingDays: 13,
    displayStatus: 'ปกติ',
  },
  {
    contract_id: 'mock-contract-redeemed',
    contract_number: 'PW-2026-000221',
    contract_start_date: '2026-05-24T00:00:00.000Z',
    contract_end_date: '2026-06-23T00:00:00.000Z',
    contract_duration_days: 30,
    loan_principal_amount: 21000,
    interest_rate: 0.03,
    interest_amount: 945,
    total_amount: 21945,
    amount_paid: 21945,
    contract_status: 'CONFIRMED',
    redemption_status: 'IN_PROGRESS',
    funding_status: 'FUNDED',
    items: {
      item_id: 'mock-item-redeemed-ipad',
      item_type: 'แท็บเล็ต',
      brand: 'Apple',
      model: 'iPad Pro 12.9',
      capacity: '256GB',
      estimated_value: 28500,
      item_condition: 91,
      image_urls: getMockImageUrls('แท็บเล็ต', 'iPad Pro 12.9'),
      accessories: 'Apple Pencil, ที่ชาร์จ',
      defects: 'รอยเล็กน้อยที่มุมเครื่อง',
      notes: 'ไถ่ถอนแล้ว รอรับของคืน',
      serial_number: 'APL-IPAD-PRO-RETURN-003',
    },
    remainingDays: 0,
    displayStatus: 'รอรับของคืน',
  },
];

const mockActionList: MockActionItem[] = [
  {
    request_id: 'mock-action-001',
    request_type: 'INTEREST_PAYMENT',
    request_status: 'AWAITING_SIGNATURE',
    interest_to_pay: 2205,
    total_amount: 2205,
    created_at: '2026-04-24T08:15:00.000Z',
    updated_at: '2026-04-24T08:20:00.000Z',
    contract: {
      contract_id: 'mock-contract-001',
      contract_number: 'PW-2026-000184',
      items: mockContractList[0].items,
    },
  },
  {
    request_id: 'mock-action-002',
    request_type: 'PRINCIPAL_REDUCTION',
    request_status: 'AWAITING_PAYMENT',
    reduction_amount: 5000,
    total_amount: 5000,
    created_at: '2026-04-25T03:45:00.000Z',
    updated_at: '2026-04-25T04:10:00.000Z',
    contract: {
      contract_id: 'mock-contract-002',
      contract_number: 'PW-2026-000197',
      items: mockContractList[1].items,
    },
  },
];

const mockContractDetails: Record<string, MockContractDetail> = {
  'mock-contract-001': {
    ...mockContractList[0],
    original_principal_amount: 24500,
    current_principal_amount: 24500,
    interest_paid: 0,
    principal_paid: 0,
    payment_status: 'UNPAID',
    item_delivery_status: 'VERIFIED',
    contract_file_url: null,
    customer: {
      customer_id: 'mock-customer-0001',
      firstname: 'สมหญิง',
      lastname: 'ทดสอบ',
      phone_number: '0891234567',
      national_id: '1101700203451',
    },
    investor: {
      investor_id: 'mock-investor-0001',
      firstname: 'ปกรณ์',
      lastname: 'ตัวอย่าง',
      phone_number: '0812233445',
    },
    item: mockContractList[0].items,
    drop_point: {
      drop_point_id: 'mock-drop-001',
      drop_point_name: 'Pawnly Siam Square',
      drop_point_code: 'SQ01',
      phone_number: '02-123-4567',
      addr_house_no: '432',
      addr_street: 'Rama I Rd',
      addr_sub_district: 'Wang Mai',
      addr_district: 'Pathum Wan',
      addr_province: 'Bangkok',
      addr_postcode: '10330',
      google_map_url: 'https://maps.google.com/?q=13.7466,100.5327',
      map_embed: null,
      latitude: 13.7466,
      longitude: 100.5327,
    },
    remainingAmount: 26705,
    remainingPrincipal: 24500,
    remainingInterest: 2205,
  },
  'mock-contract-002': {
    ...mockContractList[1],
    original_principal_amount: 16800,
    current_principal_amount: 16800,
    interest_paid: 0,
    principal_paid: 0,
    payment_status: 'UNPAID',
    item_delivery_status: 'VERIFIED',
    contract_file_url: null,
    customer: {
      customer_id: 'mock-customer-0001',
      firstname: 'สมหญิง',
      lastname: 'ทดสอบ',
      phone_number: '0891234567',
      national_id: '1101700203451',
    },
    investor: {
      investor_id: 'mock-investor-0002',
      firstname: 'กิตติ',
      lastname: 'นักลงทุน',
      phone_number: '0809988776',
    },
    item: mockContractList[1].items,
    drop_point: {
      drop_point_id: 'mock-drop-002',
      drop_point_name: 'Pawnly Ari',
      drop_point_code: 'AR02',
      phone_number: '02-555-0199',
      addr_house_no: '89',
      addr_street: 'Phahon Yothin Rd',
      addr_sub_district: 'Samsen Nai',
      addr_district: 'Phaya Thai',
      addr_province: 'Bangkok',
      addr_postcode: '10400',
      google_map_url: 'https://maps.google.com/?q=13.7798,100.5447',
      map_embed: null,
      latitude: 13.7798,
      longitude: 100.5447,
    },
    remainingAmount: 18312,
    remainingPrincipal: 16800,
    remainingInterest: 1512,
  },
  'mock-contract-redeemed': {
    ...mockContractList[2],
    original_principal_amount: 21000,
    current_principal_amount: 21000,
    interest_paid: 945,
    principal_paid: 21000,
    payment_status: 'COMPLETED',
    item_delivery_status: 'VERIFIED',
    contract_file_url: null,
    customer: {
      customer_id: 'mock-customer-returned',
      firstname: 'สมชาย',
      lastname: 'รับของคืน',
      phone_number: '0865557788',
      national_id: '1101700203999',
    },
    investor: {
      investor_id: 'mock-investor-returned',
      firstname: 'อนันต์',
      lastname: 'ปิดสัญญา',
      phone_number: '0801239876',
    },
    item: mockContractList[2].items,
    drop_point: {
      drop_point_id: 'mock-drop-001',
      drop_point_name: 'Pawnly Siam Square',
      drop_point_code: 'SQ01',
      phone_number: '02-123-4567',
      addr_house_no: '432',
      addr_street: 'Rama I Rd',
      addr_sub_district: 'Wang Mai',
      addr_district: 'Pathum Wan',
      addr_province: 'Bangkok',
      addr_postcode: '10330',
      google_map_url: 'https://maps.google.com/?q=13.7466,100.5327',
      map_embed: null,
      latitude: 13.7466,
      longitude: 100.5327,
    },
    remainingAmount: 0,
    remainingPrincipal: 0,
    remainingInterest: 0,
  },
};

export const getMockContractsEnabled = () => isMockPawnerMode();

export const getMockContractsUserName = () => 'สมหญิง ทดสอบ';

export const getMockContracts = async () => {
  await waitMock(320);
  return mockContractList.map((contract) => ({
    ...contract,
    items: { ...contract.items, image_urls: [...contract.items.image_urls] },
  }));
};

export const getMockActionRequests = async () => {
  await waitMock(260);
  return mockActionList.map((request) => ({
    ...request,
    contract: request.contract
      ? {
          ...request.contract,
          items: request.contract.items
            ? { ...request.contract.items, image_urls: [...request.contract.items.image_urls] }
            : null,
        }
      : null,
  }));
};

export const getMockActionRequestById = async (requestId: string) => {
  await waitMock(220);
  return mockActionList.find((request) => request.request_id === requestId) || null;
};

export const getMockContractDetail = async (contractId: string) => {
  await waitMock(280);
  const contract = mockContractDetails[contractId];
  if (!contract) return null;

  return {
    ...contract,
    item: { ...contract.item, image_urls: [...contract.item.image_urls] },
    drop_point: contract.drop_point ? { ...contract.drop_point } : null,
    customer: { ...contract.customer },
    investor: contract.investor ? { ...contract.investor } : null,
  };
};
