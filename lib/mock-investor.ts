export const MOCK_INVESTOR_STORAGE_KEY = 'pawn360_mock_investor';

export type MockInvestorData = {
  investor_id: string;
  line_id: string;
  firstname: string;
  lastname: string;
  kyc_status: string;
  referral_code?: string;
  max_investment_amount?: number;
  investor_tier?: string;
  total_active_principal?: number;
  auto_invest_enabled?: boolean;
  auto_liquidation_enabled?: boolean;
  investment_preferences?: any;
  stats: {
    totalContracts: number;
    activeContracts: number;
    endedContracts: number;
    totalInvestedAmount: number;
    currentInvestedAmount: number;
  };
  phone_number?: string;
  addr_house_no?: string;
  addr_village?: string;
  addr_street?: string;
  addr_sub_district?: string;
  addr_district?: string;
  addr_province?: string;
  addr_postcode?: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_account_type?: string;
  bank_account_name?: string;
};

const DEFAULT_MOCK_INVESTOR: MockInvestorData = {
  investor_id: 'mock-investor-00000001',
  line_id: 'Umock_dev_user_001',
  firstname: 'สมชาย',
  lastname: 'ใจดี',
  kyc_status: 'VERIFIED',
  referral_code: 'JM260001',
  max_investment_amount: 500000,
  investor_tier: 'GOLD',
  total_active_principal: 320000,
  auto_invest_enabled: true,
  auto_liquidation_enabled: false,
  investment_preferences: {
    categories: {
      'โทรศัพท์มือถือ': { enabled: true, sub: ['Apple', 'Samsung'], limitAmount: 180000 },
      'โน้ตบุค': { enabled: true, sub: [], limitAmount: 90000 },
      'กล้อง': { enabled: true, sub: ['Sony'], limitAmount: 30000 },
      'Apple': { enabled: true, sub: ['iPhone', 'MacBook'], limitAmount: 120000 },
      'อุปกรณ์เสริมโทรศัพท์': { enabled: true, sub: ['Apple', 'Anker'], limitAmount: 25000 },
    },
  },
  stats: {
    totalContracts: 18,
    activeContracts: 5,
    endedContracts: 13,
    totalInvestedAmount: 320000,
    currentInvestedAmount: 320000,
  },
  phone_number: '0812345678',
  addr_house_no: '123',
  addr_village: '',
  addr_street: '',
  addr_sub_district: '',
  addr_district: '',
  addr_province: '',
  addr_postcode: '10110',
  bank_name: '',
  bank_account_no: '',
  bank_account_type: '',
  bank_account_name: '',
};

const isBrowser = typeof window !== 'undefined';

export const isMockMode = () => process.env.NEXT_PUBLIC_LIFF_MOCK === 'true';

export function loadMockInvestor(): MockInvestorData {
  if (!isBrowser) {
    return DEFAULT_MOCK_INVESTOR;
  }

  try {
    const raw = window.localStorage.getItem(MOCK_INVESTOR_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(MOCK_INVESTOR_STORAGE_KEY, JSON.stringify(DEFAULT_MOCK_INVESTOR));
      return DEFAULT_MOCK_INVESTOR;
    }

    const parsed = JSON.parse(raw) as Partial<MockInvestorData>;
    const defaultCategories = DEFAULT_MOCK_INVESTOR.investment_preferences?.categories || {};
    const parsedCategories = parsed.investment_preferences?.categories || {};
    const hasParsedCategories = !!parsed.investment_preferences && Object.prototype.hasOwnProperty.call(parsed.investment_preferences, 'categories');
    return {
      ...DEFAULT_MOCK_INVESTOR,
      ...parsed,
      stats: {
        ...DEFAULT_MOCK_INVESTOR.stats,
        ...(parsed.stats || {}),
      },
      investment_preferences: {
        ...DEFAULT_MOCK_INVESTOR.investment_preferences,
        ...(parsed.investment_preferences || {}),
        categories: hasParsedCategories
          ? parsedCategories
          : {
              ...defaultCategories,
              ...parsedCategories,
            },
      },
    };
  } catch (error) {
    console.error('Failed to load mock investor from localStorage:', error);
    return DEFAULT_MOCK_INVESTOR;
  }
}

export function updateMockInvestor(update: Partial<MockInvestorData>): MockInvestorData {
  if (!isBrowser) {
    return { ...DEFAULT_MOCK_INVESTOR, ...update };
  }

  try {
    const current = loadMockInvestor();
    const currentCategories = current.investment_preferences?.categories || {};
    const updateCategories = update.investment_preferences?.categories || {};
    const hasUpdateCategories = !!update.investment_preferences && Object.prototype.hasOwnProperty.call(update.investment_preferences, 'categories');
    const updated: MockInvestorData = {
      ...current,
      ...update,
      stats: {
        ...current.stats,
        ...(update.stats || {}),
      },
      investment_preferences: update.investment_preferences
        ? {
            ...current.investment_preferences,
            ...update.investment_preferences,
            categories: hasUpdateCategories
              ? updateCategories
              : {
                  ...currentCategories,
                  ...updateCategories,
                },
          }
        : current.investment_preferences,
    };
    window.localStorage.setItem(MOCK_INVESTOR_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Failed to update mock investor in localStorage:', error);
    return { ...DEFAULT_MOCK_INVESTOR, ...update };
  }
}
