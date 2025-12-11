import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      contractId,
      requestType,
      deliveryMethod,
      deliveryAddress,
      principalAmount,
      interestAmount,
      deliveryFee,
      totalAmount,
      pawnerLineId,
    } = body;

    if (!contractId || !requestType || !deliveryMethod) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Verify contract exists and belongs to pawner
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        *,
        pawners:customer_id (*),
        investors:investor_id (*),
        drop_points:drop_point_id (*)
      `)
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Check if pawner LINE ID matches
    if (pawnerLineId && contract.pawners?.line_id !== pawnerLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Check if contract is in valid status for redemption
    if (!['ACTIVE', 'CONFIRMED'].includes(contract.contract_status)) {
      return NextResponse.json(
        { error: 'Contract is not in active status' },
        { status: 400 }
      );
    }

    // Check for existing pending redemption
    const { data: existingRedemption } = await supabase
      .from('redemption_requests')
      .select('redemption_id')
      .eq('contract_id', contractId)
      .in('request_status', ['PENDING', 'SLIP_UPLOADED', 'AMOUNT_VERIFIED', 'PREPARING_ITEM', 'IN_TRANSIT'])
      .single();

    if (existingRedemption) {
      return NextResponse.json(
        { error: 'There is already a pending redemption request for this contract' },
        { status: 400 }
      );
    }

    // Build delivery address string
    let deliveryAddressFull = null;
    if (deliveryAddress) {
      const parts = [
        deliveryAddress.houseNo,
        deliveryAddress.village,
        deliveryAddress.street,
        deliveryAddress.subDistrict,
        deliveryAddress.district,
        deliveryAddress.province,
        deliveryAddress.postcode,
      ].filter(Boolean);
      deliveryAddressFull = parts.join(' ');
    }

    // Create redemption request
    const { data: redemption, error: redemptionError } = await supabase
      .from('redemption_requests')
      .insert({
        contract_id: contractId,
        request_type: requestType,
        principal_amount: principalAmount,
        interest_amount: interestAmount,
        delivery_fee: deliveryFee || 0,
        total_amount: totalAmount,
        delivery_method: deliveryMethod,
        delivery_address_full: deliveryAddressFull,
        delivery_addr_house_no: deliveryAddress?.houseNo,
        delivery_addr_village: deliveryAddress?.village,
        delivery_addr_street: deliveryAddress?.street,
        delivery_addr_sub_district: deliveryAddress?.subDistrict,
        delivery_addr_district: deliveryAddress?.district,
        delivery_addr_province: deliveryAddress?.province,
        delivery_addr_postcode: deliveryAddress?.postcode,
        delivery_contact_phone: deliveryAddress?.contactPhone,
        delivery_notes: deliveryAddress?.notes,
        request_status: 'PENDING',
      })
      .select()
      .single();

    if (redemptionError) {
      console.error('Error creating redemption:', redemptionError);
      return NextResponse.json(
        { error: 'Failed to create redemption request' },
        { status: 500 }
      );
    }

    // Update contract redemption status
    await supabase
      .from('contracts')
      .update({
        redemption_status: 'PENDING',
        updated_at: new Date().toISOString(),
      })
      .eq('contract_id', contractId);

    return NextResponse.json({
      success: true,
      redemptionId: redemption.redemption_id,
      message: 'Redemption request created successfully',
    });

  } catch (error: any) {
    console.error('Error creating redemption:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
