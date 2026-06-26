import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { generateQRCode } from '@/lib/utils/qrcode';
import {
  getMockNearDueReturnReceipt,
  getMockRedeemedReturnReceipt,
  getMockWithin15ReturnReceipt,
} from '@/app/contracts/[contractId]/_lib/preview';

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

export async function GET(
  request: Request,
  context: { params: Promise<{ contractId: string }> }
) {
  try {
    const { contractId } = await context.params;
    const { searchParams } = new URL(request.url);
    const previewDeliveryMethod = searchParams.get('deliveryMethod') || undefined;

    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    const domain = process.env.NEXT_PUBLIC_DOMAIN || 'https://pawnly.io';
    const returnUrl = `${domain}/contracts/${contractId}/return-receipt`;

    if (contractId === 'mock-contract-redeemed') {
      const qrCodeDataUrl = await generateQRCode(returnUrl);
      return NextResponse.json({
        success: true,
        receipt: getMockRedeemedReturnReceipt(contractId, qrCodeDataUrl, returnUrl),
      });
    }

    if (contractId === 'mock-contract-001') {
      const qrCodeDataUrl = await generateQRCode(returnUrl);
      return NextResponse.json({
        success: true,
        receipt: getMockNearDueReturnReceipt(contractId, qrCodeDataUrl, returnUrl, previewDeliveryMethod),
      });
    }

    if (contractId === 'mock-contract-002' || contractId.includes('mock')) {
      const qrCodeDataUrl = await generateQRCode(returnUrl);
      return NextResponse.json({
        success: true,
        receipt: getMockWithin15ReturnReceipt(contractId, qrCodeDataUrl, returnUrl, previewDeliveryMethod),
      });
    }

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
          phone_number,
          national_id,
          addr_house_no,
          addr_village,
          addr_street,
          addr_sub_district,
          addr_district,
          addr_province,
          addr_postcode
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

    const { data: redemption } = await supabase
      .from('redemption_requests')
      .select('redemption_id, delivery_method, delivery_fee, delivery_notes, request_status, created_at, updated_at')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: bag } = await supabase
      .from('drop_point_bag_assignments')
      .select('bag_number, assigned_at')
      .eq('contract_id', contractId)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: storageBox } = await supabase
      .from('drop_point_storage_boxes')
      .select('box_code, occupied_at, last_updated_at')
      .eq('contract_id', contractId)
      .order('last_updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const qrCodeDataUrl = await generateQRCode(returnUrl);
    const deliveryMethod = String(redemption?.delivery_method || previewDeliveryMethod || '');

    return NextResponse.json({
      success: true,
      receipt: {
        contract,
        redemption,
        qrCodeDataUrl,
        returnUrl,
        returnMethodLabel: RETURN_METHOD_LABELS[deliveryMethod] || deliveryMethod || '-',
        bagNumber: bag?.bag_number || storageBox?.box_code || null,
        bagAssignedAt: bag?.assigned_at || storageBox?.occupied_at || storageBox?.last_updated_at || null,
        storageBoxCode: storageBox?.box_code || null,
      },
    });
  } catch (error: any) {
    console.error('Error fetching return receipt:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
