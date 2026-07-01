export const MOCK_PAWN_DELIVERY_CONTRACT_ID = 'mock-pawn-delivery-001';

export const mockPawnDeliveryContract = {
  contract_id: MOCK_PAWN_DELIVERY_CONTRACT_ID,
  contract_number: 'CT-PD-2026-001',
  item: { brand: 'Apple', model: 'iPhone 15 Pro Max 256GB' },
  pawner: {
    firstname: 'สมหญิง',
    lastname: 'ตัวอย่าง',
    phone_number: '0891234567',
    addr_house_no: '88/12',
    addr_village: 'ซอยสุขุมวิท 24',
    addr_street: 'สุขุมวิท',
    addr_sub_district: 'คลองตัน',
    addr_district: 'คลองเตย',
    addr_province: 'กรุงเทพมหานคร',
    addr_postcode: '10110',
  },
  drop_point: {
    drop_point_name: 'Astly Drop Point Siam',
    phone_number: '02-123-4567',
  },
};

export const resolveMockPawnDeliveryStatus = (stage?: string, status?: string) => {
  if (status) return status;
  switch (stage) {
    case 'assigned':
      return 'DRIVER_ASSIGNED';
    case 'picked':
      return 'ITEM_PICKED';
    case 'arrived':
      return 'ARRIVED';
    default:
      return 'DRIVER_SEARCH';
  }
};

export const createMockPawnDeliveryRequest = (status = 'DRIVER_SEARCH') => ({
  delivery_request_id: 'mock-delivery-request-001',
  status,
  delivery_fee: 0,
  address_house_no: '88/12',
  address_village: 'ซอยสุขุมวิท 24',
  address_street: 'สุขุมวิท',
  address_sub_district: 'คลองตัน',
  address_district: 'คลองเตย',
  address_province: 'กรุงเทพมหานคร',
  address_postcode: '10110',
  address_full: '88/12 ซอยสุขุมวิท 24 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
  contact_phone: '0891234567',
  notes: 'สะดวกให้เข้ารับช่วง 13:00-16:00 น.',
});
