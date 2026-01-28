import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { getCompanyBankAccount } from '@/lib/services/slip-verification';

const buildAddressFull = (address: Record<string, string | undefined>) => {
  const parts = [
    address.houseNo,
    address.village,
    address.street,
    address.subDistrict,
    address.district,
    address.province,
    address.postcode,
  ].filter(Boolean);
  return parts.join(' ');
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contractId')?.trim();
    const lineId = searchParams.get('lineId')?.trim();

    if (!contractId || !lineId) {
      return NextResponse.json(
        { error: 'Missing contractId or lineId' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        loan_request_id,
        customer_id,
        drop_point_id,
        items:item_id (brand, model),
        pawners:customer_id (line_id, firstname, lastname, phone_number),
        drop_points:drop_point_id (drop_point_name, phone_number, line_id)
      `)
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const pawner = Array.isArray(contract.pawners)
      ? contract.pawners[0]
      : contract.pawners;
    const dropPoint = Array.isArray(contract.drop_points)
      ? contract.drop_points[0]
      : contract.drop_points;

    if (pawner?.line_id !== lineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const { data: loanRequest } = await supabase
      .from('loan_requests')
      .select('delivery_method, delivery_fee')
      .eq('request_id', contract.loan_request_id)
      .single();

    const { data: deliveryRequest } = await supabase
      .from('pawn_delivery_requests')
      .select('*')
      .eq('contract_id', contractId)
      .maybeSingle();

    const bankAccount = await getCompanyBankAccount();

    return NextResponse.json({
      success: true,
      contract: {
        contract_id: contract.contract_id,
        contract_number: contract.contract_number,
        item: contract.items,
        pawner,
        drop_point: dropPoint,
      },
      loanRequest: loanRequest || null,
      deliveryRequest: deliveryRequest || null,
      bankAccount,
    });
  } catch (error: any) {
    console.error('Error fetching pawn delivery request:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      contractId,
      lineId,
      address,
      contactPhone,
      notes,
    } = body || {};

    if (!contractId || !lineId || !address?.houseNo) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        loan_request_id,
        customer_id,
        drop_point_id,
        pawners:customer_id (line_id),
        drop_points:drop_point_id (line_id)
      `)
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const pawner = Array.isArray(contract.pawners)
      ? contract.pawners[0]
      : contract.pawners;
    const dropPoint = Array.isArray(contract.drop_points)
      ? contract.drop_points[0]
      : contract.drop_points;

    if (pawner?.line_id !== lineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const { data: loanRequest } = await supabase
      .from('loan_requests')
      .select('delivery_method, delivery_fee')
      .eq('request_id', contract.loan_request_id)
      .single();

    if (loanRequest?.delivery_method !== 'DELIVERY') {
      return NextResponse.json(
        { error: 'Delivery option not available for this contract' },
        { status: 400 }
      );
    }

    const { data: existingRequest } = await supabase
      .from('pawn_delivery_requests')
      .select('delivery_request_id, status, slip_attempt_count')
      .eq('contract_id', contractId)
      .maybeSingle();

    if (
      existingRequest &&
      ['PAYMENT_VERIFIED', 'DRIVER_SEARCH', 'DRIVER_ASSIGNED', 'ITEM_PICKED', 'ARRIVED'].includes(existingRequest.status)
    ) {
      return NextResponse.json(
        { error: 'Delivery request already in progress' },
        { status: 409 }
      );
    }

    const addressFull = buildAddressFull(address);
    const now = new Date().toISOString();

    const payload = {
      contract_id: contract.contract_id,
      loan_request_id: contract.loan_request_id,
      customer_id: contract.customer_id,
      drop_point_id: contract.drop_point_id,
      pawner_line_id: lineId,
      drop_point_line_id: dropPoint?.line_id || null,
      delivery_fee: loanRequest?.delivery_fee ?? 40,
      status: 'AWAITING_PAYMENT',
      address_house_no: address.houseNo,
      address_village: address.village || null,
      address_street: address.street || null,
      address_sub_district: address.subDistrict || null,
      address_district: address.district || null,
      address_province: address.province || null,
      address_postcode: address.postcode || null,
      address_full: addressFull || null,
      contact_phone: contactPhone || null,
      notes: notes || null,
      updated_at: now,
    };

    let result;

    if (existingRequest?.delivery_request_id) {
      result = await supabase
        .from('pawn_delivery_requests')
        .update(payload)
        .eq('delivery_request_id', existingRequest.delivery_request_id)
        .select('delivery_request_id')
        .single();
    } else {
      result = await supabase
        .from('pawn_delivery_requests')
        .insert({ ...payload, created_at: now })
        .select('delivery_request_id')
        .single();
    }

    if (result.error || !result.data) {
      console.error('Error saving delivery request:', result.error);
      return NextResponse.json(
        { error: 'Failed to save delivery request' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deliveryRequestId: result.data.delivery_request_id,
    });
  } catch (error: any) {
    console.error('Error creating delivery request:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
