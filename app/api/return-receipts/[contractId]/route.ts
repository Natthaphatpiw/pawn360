import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { generateQRCode } from '@/lib/utils/qrcode';
import {
  getMockNearDueReturnReceipt,
  getMockRedeemedReturnReceipt,
  getMockWithin15ReturnReceipt,
} from '@/app/contracts/[contractId]/_lib/preview';
import { requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const RETURN_METHOD_LABELS: Record<string, string> = {
  SELF_PICKUP: 'รับของด้วยตัวเอง',
  SELF_ARRANGE: 'เรียกขนส่งเอง',
  PLATFORM_ARRANGE: 'Pawnly จัดส่งให้',
  DROPPOINT_SELF_PICKUP: 'รับเองที่ Drop Point',
  DROPPOINT_SELF_RIDER: 'เรียกไรเดอร์เอง',
  CENTRAL_SCHEDULE_7D: 'นัดรับที่ Drop Point ภายใน 7 วัน',
  CENTRAL_SELF_PICKUP_TODAY: 'รับวันนี้ที่คลังกลาง Astly',
  DROPPOINT_NEXT_DAY_PICKUP: 'รับวันถัดไปที่ Drop Point',
};

function localMockAllowed(): boolean {
  return process.env.NODE_ENV !== 'production'
    && process.env.NEXT_PUBLIC_LIFF_MOCK === 'true';
}

export async function GET(
  request: Request,
  context: { params: Promise<{ contractId: string }> }
) {
  try {
    const params = await context.params;
    const { searchParams } = new URL(request.url);
    const previewDeliveryMethod = searchParams.get('deliveryMethod') || undefined;
    const rawContractId = params.contractId;

    if (localMockAllowed() && rawContractId === 'mock-contract-redeemed') {
      const returnUrl = `/contracts/${rawContractId}/return-receipt`;
      const qrCodeDataUrl = await generateQRCode(returnUrl);
      return NextResponse.json({
        success: true,
        receipt: getMockRedeemedReturnReceipt(rawContractId, qrCodeDataUrl, returnUrl),
      });
    }

    if (localMockAllowed() && rawContractId === 'mock-contract-001') {
      const returnUrl = `/contracts/${rawContractId}/return-receipt`;
      const qrCodeDataUrl = await generateQRCode(returnUrl);
      return NextResponse.json({
        success: true,
        receipt: getMockNearDueReturnReceipt(rawContractId, qrCodeDataUrl, returnUrl, previewDeliveryMethod),
      });
    }

    if (localMockAllowed() && (rawContractId === 'mock-contract-002' || rawContractId.includes('mock'))) {
      const returnUrl = `/contracts/${rawContractId}/return-receipt`;
      const qrCodeDataUrl = await generateQRCode(returnUrl);
      return NextResponse.json({
        success: true,
        receipt: getMockWithin15ReturnReceipt(rawContractId, qrCodeDataUrl, returnUrl, previewDeliveryMethod),
      });
    }

    const contractId = requireUuid(rawContractId);
    const identity = await requireLiffIdentity(request, 'PAWNER');
    const supabase = supabaseAdmin();
    const configuredDomain = String(process.env.NEXT_PUBLIC_DOMAIN || '').trim();
    const domain = configuredDomain && /^https:\/\//.test(configuredDomain)
      ? configuredDomain.replace(/\/$/, '')
      : 'https://pawnly.io';
    const returnUrl = `${domain}/contracts/${contractId}/return-receipt`;

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        contract_status,
        redemption_status,
        item_delivery_status,
        contract_start_date,
        contract_end_date,
        customer:customer_id (
          firstname,
          lastname,
          line_id
        ),
        item:item_id (
          brand,
          model,
          capacity,
          serial_number,
          estimated_value
        ),
        drop_point:drop_point_id (
          drop_point_name,
          phone_number,
          addr_house_no,
          addr_street,
          addr_sub_district,
          addr_district,
          addr_province,
          addr_postcode
        )
      `)
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const customer = Array.isArray(contract.customer) ? contract.customer[0] : contract.customer;
    const item = Array.isArray(contract.item) ? contract.item[0] : contract.item;
    const dropPoint = Array.isArray(contract.drop_point) ? contract.drop_point[0] : contract.drop_point;
    if (!customer?.line_id || customer.line_id !== identity.lineId) {
      return NextResponse.json(
        { error: 'คุณไม่มีสิทธิ์ดูใบรับของนี้' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { data: redemption, error: redemptionError } = await supabase
      .from('redemption_requests')
      .select('redemption_id, delivery_method, delivery_fee, delivery_notes, request_status, created_at, updated_at')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (redemptionError) throw redemptionError;

    const { data: bag, error: bagError } = await supabase
      .from('drop_point_bag_assignments')
      .select('bag_number, assigned_at')
      .eq('contract_id', contractId)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (bagError) throw bagError;

    const { data: storageBox, error: storageBoxError } = await supabase
      .from('drop_point_storage_boxes')
      .select('box_code, occupied_at, last_updated_at')
      .eq('contract_id', contractId)
      .order('last_updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (storageBoxError) throw storageBoxError;

    const qrCodeDataUrl = await generateQRCode(returnUrl);
    const deliveryMethod = String(redemption?.delivery_method || '');

    return NextResponse.json({
      success: true,
      receipt: {
        contract: {
          contract_id: contract.contract_id,
          contract_number: contract.contract_number,
          contract_status: contract.contract_status,
          redemption_status: contract.redemption_status,
          item_delivery_status: contract.item_delivery_status,
          contract_start_date: contract.contract_start_date,
          contract_end_date: contract.contract_end_date,
          customer: customer ? {
            firstname: customer.firstname,
            lastname: customer.lastname,
            phone_number: null,
            national_id: null,
          } : null,
          item: item ? {
            brand: item.brand,
            model: item.model,
            capacity: item.capacity,
            serial_number: item.serial_number,
            estimated_value: item.estimated_value,
          } : null,
          drop_point: dropPoint ? {
            drop_point_name: dropPoint.drop_point_name,
            phone_number: dropPoint.phone_number,
            addr_house_no: dropPoint.addr_house_no,
            addr_street: dropPoint.addr_street,
            addr_sub_district: dropPoint.addr_sub_district,
            addr_district: dropPoint.addr_district,
            addr_province: dropPoint.addr_province,
            addr_postcode: dropPoint.addr_postcode,
          } : null,
        },
        redemption,
        qrCodeDataUrl,
        returnUrl,
        returnMethodLabel: RETURN_METHOD_LABELS[deliveryMethod] || deliveryMethod || '-',
        bagNumber: bag?.bag_number || storageBox?.box_code || null,
        bagAssignedAt: bag?.assigned_at || storageBox?.occupied_at || storageBox?.last_updated_at || null,
        storageBoxCode: storageBox?.box_code || null,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('[return-receipt] failed');
    return sanitizedServerError('ไม่สามารถโหลดใบรับของได้ กรุณาลองใหม่');
  }
}
