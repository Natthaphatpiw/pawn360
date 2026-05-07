export const MOCK_PAWNER_DRAFTS_STORAGE_KEY = 'pawn360_mock_pawner_drafts';

const isBrowser = typeof window !== 'undefined';

type MockDraftStoredItem = {
  item_id: string;
  createdAt: string;
  payload?: Record<string, unknown> | null;
};

type MockDraftListItem = {
  item_id: string;
  item_type: string;
  brand: string;
  model: string;
  capacity?: string;
  color?: string;
  estimated_value: number;
  image_urls: string[];
  item_condition: number;
  created_at: string;
};

const svgDataUrl = (title: string, subtitle: string, accent: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fff7f2" />
          <stop offset="100%" stop-color="#ffe4d5" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" rx="40" fill="url(#bg)" />
      <rect x="70" y="70" width="1060" height="760" rx="34" fill="#ffffff" stroke="#ffd4bf" stroke-width="6" />
      <rect x="120" y="120" width="960" height="420" rx="28" fill="${accent}" opacity="0.12" />
      <circle cx="600" cy="320" r="120" fill="${accent}" opacity="0.22" />
      <rect x="200" y="610" width="400" height="34" rx="17" fill="#f4c4aa" />
      <rect x="200" y="670" width="620" height="24" rx="12" fill="#f8ddcf" />
      <text x="600" y="595" text-anchor="middle" font-size="52" font-family="Arial, sans-serif" fill="#7a3416" font-weight="700">${title}</text>
      <text x="600" y="655" text-anchor="middle" font-size="28" font-family="Arial, sans-serif" fill="#a14d26">${subtitle}</text>
    </svg>`
  )}`;

const DEFAULT_BRANCHES = [
  {
    branch_id: 'mock-branch-bkk-01',
    branch_name: 'Pawnly Siam Square',
    address: '432 Rama I Rd',
    district: 'Pathum Wan',
    province: 'Bangkok',
    postal_code: '10330',
    latitude: 13.7466,
    longitude: 100.5327,
    phone_number: '02-123-4567',
    google_maps_link: 'https://maps.google.com/?q=13.7466,100.5327',
    map_embed: null,
    operating_hours: '10:00 - 20:00',
  },
  {
    branch_id: 'mock-branch-bkk-02',
    branch_name: 'Pawnly Ari',
    address: '89 Phahon Yothin Rd',
    district: 'Phaya Thai',
    province: 'Bangkok',
    postal_code: '10400',
    latitude: 13.7798,
    longitude: 100.5447,
    phone_number: '02-555-0199',
    google_maps_link: 'https://maps.google.com/?q=13.7798,100.5447',
    map_embed: null,
    operating_hours: '10:00 - 19:30',
  },
];

const DEFAULT_STORES = [
  {
    _id: 'mock-store-01',
    storeName: 'Pawnly Rama 9',
    phone: '02-888-1100',
    address: {
      houseNumber: '9/9',
      street: 'Rama 9',
      subDistrict: 'Huai Khwang',
      district: 'Huai Khwang',
      province: 'Bangkok',
      postcode: '10310',
    },
    interestPerday: 0.0033,
    interestSet: {
      '7': 0.025,
      '14': 0.04,
      '30': 0.1,
      '60': 0.18,
      '90': 0.24,
    },
  },
  {
    _id: 'mock-store-02',
    storeName: 'Pawnly On Nut',
    phone: '02-888-2200',
    address: {
      houseNumber: '188',
      street: 'Sukhumvit 77',
      subDistrict: 'Suan Luang',
      district: 'Suan Luang',
      province: 'Bangkok',
      postcode: '10250',
    },
    interestPerday: 0.0031,
    interestSet: {
      '7': 0.024,
      '14': 0.039,
      '30': 0.095,
      '60': 0.17,
      '90': 0.23,
    },
  },
];

const DEFAULT_CUSTOMER = {
  _id: 'mock-customer-0001',
  lineId: 'Umock_dev_user_001',
  fullName: 'สมหญิง ทดสอบ',
  phone: '0891234567',
  contractsID: ['mock-contract-20260424-001'],
  storeId: ['mock-store-01'],
  pawnRequests: ['mock-loan-20260424-001'],
};

export const isMockPawnerMode = () => process.env.NEXT_PUBLIC_LIFF_MOCK === 'true';

export const waitMock = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms));

export const getMockCustomer = () => ({ ...DEFAULT_CUSTOMER });

export const getMockStores = () => DEFAULT_STORES.map((store) => ({ ...store, address: { ...store.address }, interestSet: { ...store.interestSet } }));

export const getMockBranches = () => DEFAULT_BRANCHES.map((branch) => ({ ...branch }));

const createSeedMockDraftEntries = (): MockDraftStoredItem[] => [
  {
    item_id: 'mock-draft-001',
    createdAt: '2026-04-24T10:00:00.000Z',
    payload: {
      itemType: 'Apple',
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      capacity: '256GB',
      color: 'Natural Titanium',
      estimatedValue: 28900,
      condition: 94,
    },
  },
  {
    item_id: 'mock-draft-002',
    createdAt: '2026-04-24T11:00:00.000Z',
    payload: {
      itemType: 'โน้ตบุค',
      brand: 'Apple',
      model: 'MacBook Air M2',
      capacity: '512GB',
      color: 'Midnight',
      estimatedValue: 23200,
      condition: 89,
    },
  },
  {
    item_id: 'mock-draft-003',
    createdAt: '2026-04-25T04:30:00.000Z',
    payload: {
      itemType: 'กล้อง',
      brand: 'Sony',
      model: 'ZV-E10',
      capacity: 'Body + Lens',
      color: 'Black',
      estimatedValue: 16100,
      condition: 86,
    },
  },
];

const readMockDraftEntries = (): MockDraftStoredItem[] => {
  if (!isBrowser) {
    return createSeedMockDraftEntries();
  }

  try {
    const raw = window.localStorage.getItem(MOCK_PAWNER_DRAFTS_STORAGE_KEY);
    if (!raw) {
      const seeded = createSeedMockDraftEntries();
      window.localStorage.setItem(MOCK_PAWNER_DRAFTS_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return createSeedMockDraftEntries();
  }
};

export const getMockDraftCount = () => {
  return readMockDraftEntries().length;
};

export const saveMockDraft = (payload?: Record<string, unknown>) => {
  const itemId = `mock-draft-${Date.now()}`;
  if (isBrowser) {
    try {
      const nextDrafts = readMockDraftEntries();
      nextDrafts.unshift({
        item_id: itemId,
        createdAt: new Date().toISOString(),
        payload: payload || null,
      });
      window.localStorage.setItem(MOCK_PAWNER_DRAFTS_STORAGE_KEY, JSON.stringify(nextDrafts));
    } catch {
      // Ignore mock draft persistence failures
    }
  }
  return itemId;
};

export const getMockDraftItems = (): MockDraftListItem[] =>
  readMockDraftEntries().map((draft, index) => {
    const payload = draft.payload || {};
    const itemType = typeof payload.itemType === 'string' ? payload.itemType : 'Apple';
    const brand = typeof payload.brand === 'string' ? payload.brand : index % 2 === 0 ? 'Apple' : 'Sony';
    const model = typeof payload.model === 'string' ? payload.model : `Mock Device ${index + 1}`;
    const capacity = typeof payload.capacity === 'string' ? payload.capacity : undefined;
    const color = typeof payload.color === 'string' ? payload.color : undefined;
    const estimatedValue = typeof payload.estimatedValue === 'number' ? payload.estimatedValue : 12000 + index * 3500;
    const itemCondition = typeof payload.condition === 'number' ? payload.condition : 84 + index * 3;

    return {
      item_id: draft.item_id,
      item_type: itemType,
      brand,
      model,
      capacity,
      color,
      estimated_value: estimatedValue,
      image_urls: getMockImageUrls(itemType, model),
      item_condition: itemCondition,
      created_at: draft.createdAt,
    };
  });

export const deleteMockDraft = (itemId: string) => {
  if (!isBrowser) return;

  try {
    const nextDrafts = readMockDraftEntries().filter((draft) => draft.item_id !== itemId);
    window.localStorage.setItem(MOCK_PAWNER_DRAFTS_STORAGE_KEY, JSON.stringify(nextDrafts));
  } catch {
    // Ignore mock draft persistence failures
  }
};

export const getMockImageUrls = (itemType?: string, model?: string) => {
  const title = itemType === 'Apple' ? 'Apple Device' : itemType || 'Pawn Item';
  const subtitle = model || 'Mock preview';
  return [
    svgDataUrl(title, subtitle, '#ff5d1f'),
    svgDataUrl('Front View', subtitle, '#f97316'),
    svgDataUrl('Side View', subtitle, '#fb923c'),
  ];
};

export const buildMockEstimate = (input: {
  itemType?: string;
  brand?: string;
  model?: string;
  condition: number;
  appleCategory?: string;
}) => {
  const basePriceByType: Record<string, number> = {
    Apple: 24000,
    โทรศัพท์มือถือ: 9800,
    โน้ตบุค: 16500,
    กล้อง: 14200,
    อุปกรณ์เสริมโทรศัพท์: 2200,
    อุปกรณ์คอมพิวเตอร์: 6800,
  };

  const base = basePriceByType[input.itemType || ''] || 7500;
  const conditionFactor = 0.45 + Math.min(100, Math.max(0, input.condition)) / 100;
  const appleBonus = input.itemType === 'Apple' ? 3500 : 0;
  const premiumBonus = /pro|max|ultra|macbook/i.test(`${input.brand || ''} ${input.model || ''} ${input.appleCategory || ''}`) ? 2800 : 0;
  const estimatedPrice = Math.round((base + appleBonus + premiumBonus) * conditionFactor / 100) * 100;
  const score = Math.min(0.98, Math.max(0.45, input.condition / 100));

  return {
    estimateResult: {
      estimatedPrice: Math.max(1000, estimatedPrice),
      condition: score,
      confidence: 0.92,
    },
    conditionResult: {
      score,
      reason: `Mock AI preview: ประเมินจาก ${input.itemType || 'สินค้า'} รุ่น ${input.model || 'ตัวอย่าง'} และสภาพ ${Math.round(input.condition)}%`,
    },
  };
};

export const createMockLoanRequest = () => ({
  loanRequestId: `mock-loan-${Date.now()}`,
  itemId: `mock-item-${Date.now()}`,
});

export const createMockPawnRequest = () => ({
  requestId: `mock-pawn-request-${Date.now()}`,
});

export const createMockContract = () => `mock-contract-${Date.now()}`;
