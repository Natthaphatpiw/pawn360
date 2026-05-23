export type MockDropPoint = {
  drop_point_id: string;
  drop_point_name: string;
  drop_point_code: string;
  phone_number: string;
};

export type MockContractListItem = {
  contract_id: string;
  contract_number: string;
  item_delivery_status: string;
  displayStatus: string;
  displayDate: string;
  storage_box_code?: string | null;
  delivery_request_id?: string | null;
  delivery_request_status?: string | null;
  statusGroup: 'WAITING_DRIVER' | 'INCOMING' | 'ARRIVED' | 'UNKNOWN';
  items: {
    brand: string;
    model: string;
    item_type?: string;
    image_urls: string[];
  };
};

export type MockContractDetail = {
  contract_id: string;
  contract_number: string;
  item_delivery_status: string;
  delivery_request_id?: string | null;
  delivery_request_status?: string | null;
  item_received_at?: string;
  item_verified_at?: string;
  created_at?: string;
  updated_at?: string;
  storage_box_code?: string | null;
  storage_box_assigned_at?: string | null;
  items: {
    item_id: string;
    brand: string;
    model: string;
    capacity?: string | null;
    color?: string | null;
    image_urls: string[];
    item_condition?: number;
    notes?: string | null;
    defects?: string | null;
    device_passcode?: string | null;
  };
  pawners: {
    firstname: string;
    lastname: string;
    phone_number: string;
    national_id?: string;
  };
  drop_points: {
    drop_point_name: string;
    phone_number: string;
  };
};

export type MockHistoryEntry = {
  id: string;
  type: 'PAWN' | 'REDEMPTION';
  title: string;
  status: string;
  rawStatus: string;
  date: string;
};

export type MockPickupData = {
  deliveryRequest: {
    delivery_request_id: string;
    status: string;
    address_full: string;
    contact_phone: string;
    delivery_fee: number;
  };
  contract: {
    contract_id: string;
    contract_number: string;
    item: { brand: string; model: string };
    pawner: { firstname: string; lastname: string; phone_number: string };
    drop_point: { drop_point_name: string };
  };
};

export type MockRedemptionItem = {
  redemption_id: string;
  request_status: string;
  displayDate: string;
  storage_box_code?: string | null;
  contract: {
    contract_id: string;
    contract_number: string;
    items: { brand: string; model: string; image_urls: string[] };
    pawners: { firstname: string; lastname: string; phone_number: string; national_id: string };
  };
};

export type MockRedemptionDetail = {
  redemption_id: string;
  request_status: string;
  drop_point_return_photos?: string[] | null;
  item_return_confirmed_at?: string | null;
  delivery_method?: string;
  delivery_address_full?: string;
  delivery_contact_phone?: string;
  bag_number?: string | null;
  storage_box_code?: string | null;
  contract: {
    contract_id: string;
    contract_number: string;
    items: { brand: string; model: string; image_urls: string[] };
    pawners: { firstname: string; lastname: string; phone_number: string; national_id: string };
    drop_points: { drop_point_name: string; phone_number: string };
  };
};

export type MockDropPointDashboardCategory = {
  key: string;
  label: string;
  count: number;
  color: string;
};

export type MockDropPointDashboard = {
  dropPoint: MockDropPoint;
  currentInventoryCount: number;
  currentInventoryByType: MockDropPointDashboardCategory[];
  cumulative: {
    avgHoldingDays: number;
    returnedItems: number;
    verifiedItems: number;
    totalRevenue: number;
  };
  allTimeItemsCount: number;
  allTimeItemsByType: MockDropPointDashboardCategory[];
  currentMonth: {
    revenue: number;
    pendingSaleItems: number;
    receivedItems: number;
    avgVerificationDays: number;
  };
  operations: {
    waitingDriver: number;
    incoming: number;
    waitingVerification: number;
    storageBoxesUsed: number;
    storageBoxesTotal: number;
  };
};

const mockImages = [
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1517336714739-489689fd1ca8?auto=format&fit=crop&w=900&q=80',
];

export const mockDropPoint: MockDropPoint = {
  drop_point_id: 'dp_001',
  drop_point_name: 'Astly Green Hub Rama 9',
  drop_point_code: 'DP-R9-01',
  phone_number: '02-345-6789',
};

export const mockContracts: MockContractListItem[] = [
  {
    contract_id: 'ct_mock_waiting_01',
    contract_number: 'CT-2026-00135',
    item_delivery_status: 'PENDING',
    displayStatus: 'รอเรียกรถ',
    displayDate: '2026-05-21T08:10:00.000Z',
    delivery_request_id: 'dr_mock_waiting_01',
    delivery_request_status: 'DRIVER_SEARCH',
    statusGroup: 'WAITING_DRIVER',
    items: {
      brand: 'Apple',
      model: 'iPad Air M2',
      item_type: 'Apple',
      image_urls: mockImages,
    },
  },
  {
    contract_id: 'ct_mock_incoming_01',
    contract_number: 'CT-2026-00129',
    item_delivery_status: 'IN_TRANSIT',
    displayStatus: 'กำลังมา',
    displayDate: '2026-05-21T09:30:00.000Z',
    delivery_request_id: 'dr_mock_01',
    delivery_request_status: 'ITEM_PICKED',
    statusGroup: 'INCOMING',
    items: {
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      item_type: 'โทรศัพท์มือถือ',
      image_urls: mockImages,
    },
  },
  {
    contract_id: 'ct_mock_arrived_01',
    contract_number: 'CT-2026-00111',
    item_delivery_status: 'RECEIVED_AT_DROP_POINT',
    displayStatus: 'รอตรวจสอบ',
    displayDate: '2026-05-20T13:20:00.000Z',
    storage_box_code: 'BX-GR-019',
    statusGroup: 'ARRIVED',
    items: {
      brand: 'Canon',
      model: 'EOS R50',
      item_type: 'กล้อง',
      image_urls: mockImages.slice(1),
    },
  },
];

export const mockContractDetails: Record<string, MockContractDetail> = {
  ct_mock_incoming_01: {
    contract_id: 'ct_mock_incoming_01',
    contract_number: 'CT-2026-00129',
    item_delivery_status: 'IN_TRANSIT',
    delivery_request_id: 'dr_mock_01',
    delivery_request_status: 'ITEM_PICKED',
    created_at: '2026-05-20T08:00:00.000Z',
    updated_at: '2026-05-21T09:30:00.000Z',
    items: {
      item_id: 'item_mock_01',
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      capacity: '256GB',
      color: 'Natural Titanium',
      image_urls: mockImages,
      item_condition: 92,
      notes: 'หน้าจอปกติ แบตเตอรี่ใช้งานได้ดี',
      defects: 'รอยมุมเล็กน้อย',
      device_passcode: '2580',
    },
    pawners: {
      firstname: 'Narin',
      lastname: 'S.',
      phone_number: '089-111-2222',
      national_id: '1103700001111',
    },
    drop_points: {
      drop_point_name: mockDropPoint.drop_point_name,
      phone_number: mockDropPoint.phone_number,
    },
  },
  ct_mock_arrived_01: {
    contract_id: 'ct_mock_arrived_01',
    contract_number: 'CT-2026-00111',
    item_delivery_status: 'RECEIVED_AT_DROP_POINT',
    delivery_request_id: 'dr_mock_02',
    delivery_request_status: 'ARRIVED',
    item_received_at: '2026-05-20T13:20:00.000Z',
    updated_at: '2026-05-20T13:25:00.000Z',
    storage_box_code: 'BX-GR-019',
    storage_box_assigned_at: '2026-05-20T13:30:00.000Z',
    items: {
      item_id: 'item_mock_02',
      brand: 'Canon',
      model: 'EOS R50',
      capacity: '-',
      color: 'Black',
      image_urls: mockImages.slice(1),
      item_condition: 88,
      notes: 'พร้อมตรวจรับ',
      defects: 'ไม่มีรอยแตก',
      device_passcode: null,
    },
    pawners: {
      firstname: 'Pimchanok',
      lastname: 'K.',
      phone_number: '081-222-3333',
      national_id: '1103700002222',
    },
    drop_points: {
      drop_point_name: mockDropPoint.drop_point_name,
      phone_number: mockDropPoint.phone_number,
    },
  },
  ct_mock_waiting_01: {
    contract_id: 'ct_mock_waiting_01',
    contract_number: 'CT-2026-00135',
    item_delivery_status: 'PENDING',
    delivery_request_id: 'dr_mock_waiting_01',
    delivery_request_status: 'DRIVER_SEARCH',
    created_at: '2026-05-21T08:00:00.000Z',
    updated_at: '2026-05-21T08:10:00.000Z',
    items: {
      item_id: 'item_mock_03',
      brand: 'Apple',
      model: 'iPad Air M2',
      capacity: '128GB',
      color: 'Space Gray',
      image_urls: mockImages,
      item_condition: 90,
      notes: 'รอเรียกรถเข้ารับ',
      defects: 'ไม่มี',
      device_passcode: '1111',
    },
    pawners: {
      firstname: 'Korn',
      lastname: 'P.',
      phone_number: '084-555-6666',
      national_id: '1103700004444',
    },
    drop_points: {
      drop_point_name: mockDropPoint.drop_point_name,
      phone_number: mockDropPoint.phone_number,
    },
  },
};

export const mockHistoryEntries: MockHistoryEntry[] = [
  { id: 'ct_mock_arrived_01', type: 'PAWN', title: 'Canon EOS R50', status: 'ถึงแล้ว', rawStatus: 'RECEIVED_AT_DROP_POINT', date: '2026-05-20T13:20:00.000Z' },
  { id: 'rd_mock_01', type: 'REDEMPTION', title: 'Apple iPhone 14', status: 'คืนแล้ว', rawStatus: 'COMPLETED', date: '2026-05-18T11:00:00.000Z' },
  { id: 'rd_mock_02', type: 'REDEMPTION', title: 'Samsung Galaxy S24', status: 'ยกเลิก', rawStatus: 'CANCELLED', date: '2026-05-15T16:30:00.000Z' },
];

export const mockPickupData: MockPickupData = {
  deliveryRequest: {
    delivery_request_id: 'dr_mock_01',
    status: 'ITEM_PICKED',
    address_full: '88/19 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310',
    contact_phone: '082-444-5555',
    delivery_fee: 120,
  },
  contract: {
    contract_id: 'ct_mock_incoming_01',
    contract_number: 'CT-2026-00129',
    item: { brand: 'Apple', model: 'iPhone 15 Pro Max' },
    pawner: { firstname: 'Narin', lastname: 'S.', phone_number: '089-111-2222' },
    drop_point: { drop_point_name: mockDropPoint.drop_point_name },
  },
};

export const mockRedemptions: MockRedemptionItem[] = [
  {
    redemption_id: 'rd_mock_01',
    request_status: 'READY_FOR_RETURN',
    displayDate: '2026-05-21T10:15:00.000Z',
    storage_box_code: 'BX-GR-004',
    contract: {
      contract_id: 'ct_mock_return_01',
      contract_number: 'CT-2026-00084',
      items: { brand: 'Apple', model: 'iPhone 14', image_urls: mockImages },
      pawners: { firstname: 'Napat', lastname: 'L.', phone_number: '080-123-9999', national_id: '1103700003333' },
    },
  },
];

export const mockRedemptionDetails: Record<string, MockRedemptionDetail> = {
  rd_mock_01: {
    redemption_id: 'rd_mock_01',
    request_status: 'READY_FOR_RETURN',
    delivery_method: 'SELF_PICKUP',
    delivery_address_full: 'รับที่หน้าร้าน Astly Green Hub Rama 9',
    delivery_contact_phone: '080-123-9999',
    storage_box_code: 'BX-GR-004',
    bag_number: '',
    contract: {
      contract_id: 'ct_mock_return_01',
      contract_number: 'CT-2026-00084',
      items: { brand: 'Apple', model: 'iPhone 14', image_urls: mockImages },
      pawners: { firstname: 'Napat', lastname: 'L.', phone_number: '080-123-9999', national_id: '1103700003333' },
      drop_points: { drop_point_name: mockDropPoint.drop_point_name, phone_number: mockDropPoint.phone_number },
    },
  },
};

export const mockDropPointDashboard: MockDropPointDashboard = {
  dropPoint: mockDropPoint,
  currentInventoryCount: 18,
  currentInventoryByType: [
    { key: 'phone', label: 'โทรศัพท์มือถือ', count: 8, color: 'var(--register-chart-1)' },
    { key: 'apple', label: 'Apple', count: 4, color: 'var(--register-chart-2)' },
    { key: 'camera', label: 'กล้อง', count: 3, color: 'var(--register-chart-3)' },
    { key: 'notebook', label: 'โน้ตบุค', count: 2, color: 'var(--register-chart-4)' },
    { key: 'accessory', label: 'อุปกรณ์เสริม', count: 1, color: 'var(--register-chart-5)' },
  ],
  cumulative: {
    avgHoldingDays: 14.6,
    returnedItems: 47,
    verifiedItems: 326,
    totalRevenue: 286450,
  },
  allTimeItemsCount: 326,
  allTimeItemsByType: [
    { key: 'phone', label: 'โทรศัพท์มือถือ', count: 142, color: 'var(--register-chart-1)' },
    { key: 'apple', label: 'Apple', count: 79, color: 'var(--register-chart-2)' },
    { key: 'camera', label: 'กล้อง', count: 43, color: 'var(--register-chart-3)' },
    { key: 'notebook', label: 'โน้ตบุค', count: 38, color: 'var(--register-chart-4)' },
    { key: 'accessory', label: 'อุปกรณ์เสริม', count: 24, color: 'var(--register-chart-5)' },
  ],
  currentMonth: {
    revenue: 38450,
    pendingSaleItems: 7,
    receivedItems: 29,
    avgVerificationDays: 1.8,
  },
  operations: {
    waitingDriver: 3,
    incoming: 5,
    waitingVerification: 4,
    storageBoxesUsed: 18,
    storageBoxesTotal: 30,
  },
};

export function getMockContractDetail(contractId?: string | null) {
  if (!contractId) return null;
  return mockContractDetails[contractId] || mockContractDetails.ct_mock_incoming_01;
}

export function getMockRedemptionDetail(redemptionId?: string | null) {
  if (!redemptionId) return null;
  return mockRedemptionDetails[redemptionId] || mockRedemptionDetails.rd_mock_01;
}

export function getMockDropPointDashboard() {
  return mockDropPointDashboard;
}

type SearchParamsLike = {
  get: (key: string) => string | null;
};

export function isDropPointMockEnabled(searchParams?: SearchParamsLike | null) {
  return process.env.NEXT_PUBLIC_DROPPOINT_MOCK === 'true'
    || process.env.NEXT_PUBLIC_LIFF_MOCK === 'true'
    || searchParams?.get('mock') === '1';
}
