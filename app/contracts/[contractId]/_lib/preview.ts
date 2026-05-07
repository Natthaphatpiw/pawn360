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

export function getMockRedemption(redemptionId: string, contractId: string) {
  return {
    redemption_id: redemptionId,
    total_amount: 10300,
    base_amount: 10300,
    payment_slip_url: null,
    delivery_method: 'SELF_PICKUP',
    contract: {
      ...getMockContractBase(contractId),
      items: {
        brand: 'Apple',
        model: 'iPhone 13',
      },
    },
  };
}
