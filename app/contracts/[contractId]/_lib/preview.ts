export const PREVIEW_QUERY_VALUE = '1';

export function isPreviewMode(searchParams: { get: (key: string) => string | null } | null) {
  return searchParams?.get('preview') === PREVIEW_QUERY_VALUE;
}

export function withPreview(path: string, idKey?: string, idValue?: string) {
  const params = new URLSearchParams();
  params.set('preview', PREVIEW_QUERY_VALUE);
  if (idKey && idValue) {
    params.set(idKey, idValue);
  }
  return `${path}?${params.toString()}`;
}

function getMockItem() {
  return {
    brand: 'Apple',
    model: 'iPhone 13',
    estimated_value: 18000,
  };
}

function getMockItems() {
  return {
    brand: 'Apple',
    model: 'iPhone 13',
    estimated_value: 18000,
  };
}

function getMockContractBase(contractId: string) {
  return {
    contract_id: contractId,
    contract_number: `CT-${contractId}-MOCK`,
    contract_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    current_principal_amount: 10000,
    loan_principal_amount: 10000,
    original_principal_amount: 10000,
    interest_rate: 3,
    item: getMockItem(),
    items: getMockItems(),
    pawners: {
      bank_name: 'พร้อมเพย์',
      bank_account_no: '0812345678',
      bank_account_name: 'Mock User',
    },
  };
}

export function getMockInterestPaymentRequest(requestId: string, contractId: string) {
  return {
    request_id: requestId,
    request_status: 'PENDING_PAYMENT',
    total_amount: 400,
    interest_to_pay: 400,
    base_amount: 400,
    terms_accepted: true,
    pawner_signature_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='120' viewBox='0 0 300 120'%3E%3Crect width='300' height='120' fill='white'/%3E%3Cpath d='M30 78 C55 35 78 102 102 62 S145 48 167 70 S210 92 232 56 S260 48 272 70' fill='none' stroke='%23111' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E",
    new_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    contract: getMockContractBase(contractId),
  };
}

export function getMockPrincipalReductionRequest(requestId: string, contractId: string) {
  return {
    request_id: requestId,
    request_status: 'PENDING_PAYMENT',
    total_amount: 2400,
    base_amount: 2400,
    reduction_amount: 2000,
    principal_after_reduction: 8000,
    new_principal_amount: 8000,
    terms_accepted: true,
    pawner_signature_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='120' viewBox='0 0 300 120'%3E%3Crect width='300' height='120' fill='white'/%3E%3Cpath d='M30 78 C55 35 78 102 102 62 S145 48 167 70 S210 92 232 56 S260 48 272 70' fill='none' stroke='%23111' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E",
    contract: getMockContractBase(contractId),
  };
}

export function getMockPrincipalIncreaseRequest(requestId: string, contractId: string) {
  return {
    request_id: requestId,
    request_status: 'PENDING_INVESTOR_APPROVAL',
    total_amount: 400,
    base_amount: 400,
    increase_amount: 3000,
    principal_after_increase: 13000,
    new_principal_amount: 13000,
    pawner_bank_name: 'พร้อมเพย์',
    pawner_bank_account_no: '0812345678',
    contract: getMockContractBase(contractId),
  };
}

const RETURN_METHOD_LABELS: Record<string, string> = {
  SELF_PICKUP: 'รับของด้วยตัวเอง',
  SELF_ARRANGE: 'เรียกไรเดอร์เอง',
  PLATFORM_ARRANGE: 'Pawnly จัดส่งให้',
  DROPPOINT_SELF_PICKUP: 'รับเองที่ Drop Point',
  DROPPOINT_SELF_RIDER: 'เรียกไรเดอร์เอง',
  CENTRAL_SCHEDULE_7D: 'นัดรับที่ Drop Point ภายใน 7 วัน',
  CENTRAL_SELF_PICKUP_TODAY: 'รับวันนี้ที่คลังกลาง Astly',
  DROPPOINT_NEXT_DAY_PICKUP: 'รับวันถัดไปที่ Drop Point',
};

export function getMockRedemption(redemptionId: string, contractId: string, deliveryMethod?: string) {
  const isNearDueCentralPreview = contractId === 'mock-contract-001';
  const resolvedDeliveryMethod = deliveryMethod || (isNearDueCentralPreview ? 'CENTRAL_SCHEDULE_7D' : 'DROPPOINT_SELF_PICKUP');

  return {
    redemption_id: redemptionId,
    total_amount: isNearDueCentralPreview ? 26705 : 10300,
    base_amount: isNearDueCentralPreview ? 26705 : 10300,
    payment_slip_url: null,
    delivery_method: resolvedDeliveryMethod,
    contract: {
      ...getMockContractBase(contractId),
      items: {
        brand: isNearDueCentralPreview ? 'Apple' : 'Apple',
        model: isNearDueCentralPreview ? 'iPhone 15 Pro Max' : 'iPhone 13',
      },
    },
  };
}

export function getMockPost15RedemptionContract(contractId: string) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 19);

  return {
    contract_id: contractId,
    contract_number: `CT-${contractId}-POST15`,
    contract_start_date: startDate.toISOString(),
    loan_principal_amount: 10000,
    original_principal_amount: 10000,
    interest_rate: 0.03,
    interest_amount: 300,
    total_amount: 10300,
    amount_paid: 0,
    contract_duration_days: 30,
    remainingAmount: 10300,
    remainingPrincipal: 10000,
    remainingInterest: 300,
    item: {
      brand: 'Apple',
      model: 'iPhone 13',
      capacity: '128GB',
    },
    customer: {
      phone_number: '0812345678',
      addr_house_no: '99/9',
      addr_village: '',
      addr_street: 'Sukhumvit',
      addr_sub_district: 'Khlong Toei Nuea',
      addr_district: 'Watthana',
      addr_province: 'Bangkok',
      addr_postcode: '10110',
    },
    investor: null,
    drop_point: {
      drop_point_id: 'dp-mock',
      drop_point_name: 'Astly Drop Point Mock',
      phone_number: '020000000',
      map_embed: null,
    },
  };
}

export function getMockNearDueCentralRedemptionContract(contractId: string) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 24);

  return {
    ...getMockPost15RedemptionContract(contractId),
    contract_number: 'PW-2026-000184',
    contract_start_date: startDate.toISOString(),
    loan_principal_amount: 24500,
    original_principal_amount: 24500,
    interest_amount: 2205,
    total_amount: 26705,
    remainingAmount: 26705,
    remainingPrincipal: 24500,
    remainingInterest: 2205,
    item: {
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      capacity: '256GB',
    },
    customer: {
      phone_number: '0891234567',
      addr_house_no: '432',
      addr_village: '',
      addr_street: 'Rama I Rd',
      addr_sub_district: 'Wang Mai',
      addr_district: 'Pathum Wan',
      addr_province: 'Bangkok',
      addr_postcode: '10330',
    },
    drop_point: {
      drop_point_id: 'mock-drop-001',
      drop_point_name: 'Pawnly Siam Square',
      phone_number: '02-123-4567',
      map_embed: null,
    },
  };
}

export function getMockRedeemedReturnReceipt(contractId: string, qrCodeDataUrl: string, returnUrl: string) {
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 22);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 8);

  return {
    contract: {
      contract_id: contractId,
      contract_number: 'PW-2026-000221',
      contract_status: 'CONFIRMED',
      redemption_status: 'IN_PROGRESS',
      item_delivery_status: 'VERIFIED',
      contract_start_date: startDate.toISOString(),
      contract_end_date: endDate.toISOString(),
      customer: {
        firstname: 'สมชาย',
        lastname: 'รับของคืน',
        phone_number: '0865557788',
        national_id: '1101700203999',
        addr_house_no: '55/8',
        addr_village: '',
        addr_street: 'Sathorn Rd',
        addr_sub_district: 'Yan Nawa',
        addr_district: 'Sathon',
        addr_province: 'Bangkok',
        addr_postcode: '10120',
      },
      item: {
        brand: 'Apple',
        model: 'iPad Pro 12.9',
        capacity: '256GB',
        serial_number: 'APL-IPAD-PRO-RETURN-003',
        estimated_value: 28500,
      },
      drop_point: {
        drop_point_name: 'Pawnly Siam Square',
        phone_number: '02-123-4567',
        addr_house_no: '432',
        addr_street: 'Rama I Rd',
        addr_sub_district: 'Wang Mai',
        addr_district: 'Pathum Wan',
        addr_province: 'Bangkok',
        addr_postcode: '10330',
      },
    },
    redemption: {
      redemption_id: 'mock-redemption-redeemed-001',
      delivery_method: 'CENTRAL_SCHEDULE_7D',
      delivery_fee: 0,
      request_status: 'AMOUNT_VERIFIED',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    qrCodeDataUrl,
    returnUrl,
    returnMethodLabel: 'นัดรับที่ Drop Point ภายใน 7 วัน',
    bagNumber: 'BAG-MOCK-221',
    bagAssignedAt: now.toISOString(),
    storageBoxCode: 'ASTLY-CENTRAL-A12',
  };
}

export function getMockNearDueReturnReceipt(contractId: string, qrCodeDataUrl: string, returnUrl: string, deliveryMethod = 'CENTRAL_SCHEDULE_7D') {
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 24);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 6);

  return {
    contract: {
      contract_id: contractId,
      contract_number: 'PW-2026-000184',
      contract_status: 'CONFIRMED',
      redemption_status: 'IN_PROGRESS',
      item_delivery_status: 'VERIFIED',
      contract_start_date: startDate.toISOString(),
      contract_end_date: endDate.toISOString(),
      customer: {
        firstname: 'สมหญิง',
        lastname: 'ทดสอบ',
        phone_number: '0891234567',
        national_id: '1101700203451',
        addr_house_no: '432',
        addr_village: '',
        addr_street: 'Rama I Rd',
        addr_sub_district: 'Wang Mai',
        addr_district: 'Pathum Wan',
        addr_province: 'Bangkok',
        addr_postcode: '10330',
      },
      item: {
        brand: 'Apple',
        model: 'iPhone 15 Pro Max',
        capacity: '256GB',
        serial_number: 'APL-IP15PM-256-001',
        estimated_value: 28900,
      },
      drop_point: {
        drop_point_name: 'Pawnly Siam Square',
        phone_number: '02-123-4567',
        addr_house_no: '432',
        addr_street: 'Rama I Rd',
        addr_sub_district: 'Wang Mai',
        addr_district: 'Pathum Wan',
        addr_province: 'Bangkok',
        addr_postcode: '10330',
      },
    },
    redemption: {
      redemption_id: `preview-redeem-${contractId}`,
      delivery_method: deliveryMethod,
      delivery_fee: 0,
      request_status: 'AMOUNT_VERIFIED',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    qrCodeDataUrl,
    returnUrl,
    returnMethodLabel: RETURN_METHOD_LABELS[deliveryMethod] || deliveryMethod,
    bagNumber: 'BAG-MOCK-184',
    bagAssignedAt: now.toISOString(),
    storageBoxCode: 'ASTLY-CENTRAL-B07',
  };
}

export function getMockWithin15ReturnReceipt(contractId: string, qrCodeDataUrl: string, returnUrl: string, deliveryMethod = 'DROPPOINT_SELF_PICKUP') {
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 8);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 22);

  return {
    contract: {
      contract_id: contractId,
      contract_number: contractId === 'mock-contract-002' ? 'PW-2026-000197' : `CT-${contractId}-MOCK`,
      contract_status: 'CONFIRMED',
      redemption_status: 'IN_PROGRESS',
      item_delivery_status: 'VERIFIED',
      contract_start_date: startDate.toISOString(),
      contract_end_date: endDate.toISOString(),
      customer: {
        firstname: 'สมหญิง',
        lastname: 'ทดสอบ',
        phone_number: '0891234567',
        national_id: '1101700203451',
        addr_house_no: '89',
        addr_village: '',
        addr_street: 'Phahon Yothin Rd',
        addr_sub_district: 'Samsen Nai',
        addr_district: 'Phaya Thai',
        addr_province: 'Bangkok',
        addr_postcode: '10400',
      },
      item: {
        brand: contractId === 'mock-contract-002' ? 'Apple' : 'Apple',
        model: contractId === 'mock-contract-002' ? 'MacBook Air M2' : 'iPhone 13',
        capacity: contractId === 'mock-contract-002' ? '512GB' : '128GB',
        serial_number: contractId === 'mock-contract-002' ? 'APL-MBA-M2-512-002' : 'APL-IP13-128-MOCK',
        estimated_value: contractId === 'mock-contract-002' ? 23200 : 18000,
      },
      drop_point: {
        drop_point_name: contractId === 'mock-contract-002' ? 'Pawnly Ari' : 'Pawn360 Drop Point (Mock)',
        phone_number: contractId === 'mock-contract-002' ? '02-555-0199' : '020000000',
        addr_house_no: contractId === 'mock-contract-002' ? '89' : '99/9',
        addr_street: contractId === 'mock-contract-002' ? 'Phahon Yothin Rd' : 'Sukhumvit',
        addr_sub_district: contractId === 'mock-contract-002' ? 'Samsen Nai' : 'Khlong Toei Nuea',
        addr_district: contractId === 'mock-contract-002' ? 'Phaya Thai' : 'Watthana',
        addr_province: 'Bangkok',
        addr_postcode: contractId === 'mock-contract-002' ? '10400' : '10110',
      },
    },
    redemption: {
      redemption_id: `preview-redeem-${contractId}`,
      delivery_method: deliveryMethod,
      delivery_fee: 0,
      request_status: 'AMOUNT_VERIFIED',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    qrCodeDataUrl,
    returnUrl,
    returnMethodLabel: RETURN_METHOD_LABELS[deliveryMethod] || deliveryMethod,
    bagNumber: 'BAG-MOCK-DP15',
    bagAssignedAt: now.toISOString(),
    storageBoxCode: 'DP-MOCK-08',
  };
}
