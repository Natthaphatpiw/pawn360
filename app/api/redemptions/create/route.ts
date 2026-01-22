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
      deliveryFee,
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

    const msPerDay = 1000 * 60 * 60 * 24;
    const startDate = new Date(contract.contract_start_date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(contract.contract_end_date);
    endDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rawDurationDays = Number(contract.contract_duration_days || 0)
      || Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay);
    const daysInContract = Math.max(1, rawDurationDays);
    const rawDaysElapsed = Math.floor((today.getTime() - startDate.getTime()) / msPerDay) + 1;
    const daysElapsed = Math.min(daysInContract, Math.max(1, rawDaysElapsed));

    const rawRate = Number(contract.interest_rate || 0);
    const monthlyInterestRate = rawRate > 1 ? rawRate / 100 : rawRate;
    const feeRate = Number(contract.platform_fee_rate ?? 0.01);
    const dailyInterestRate = monthlyInterestRate / 30;

    const currentPrincipal = contract.current_principal_amount || contract.loan_principal_amount;
    const feeBase = contract.original_principal_amount || contract.loan_principal_amount || currentPrincipal;
    const feeAmount = Math.round(feeBase * feeRate * (daysInContract / 30) * 100) / 100;
    const interestAccrued = Math.round(currentPrincipal * dailyInterestRate * daysElapsed * 100) / 100;
    const interestDue = Math.max(0, interestAccrued + feeAmount - (contract.interest_paid || 0));

    const basePrincipal = Math.max(0, currentPrincipal - (contract.principal_paid || 0));
    const deliveryFeeAmount = deliveryFee || 0;
    const totalAmount = basePrincipal + interestDue + deliveryFeeAmount;

    // Create redemption request
    const { data: redemption, error: redemptionError } = await supabase
      .from('redemption_requests')
      .insert({
        contract_id: contractId,
        request_type: requestType,
        principal_amount: basePrincipal,
        interest_amount: interestDue,
        delivery_fee: deliveryFeeAmount,
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
