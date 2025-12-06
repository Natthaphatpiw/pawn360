import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  { params }: { params: { contractId: string } }
) {
  try {
    const { contractId } = params;

    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Fetch contract with all related data
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        *,
        customer:customer_id (
          customer_id,
          firstname,
          lastname,
          phone_number,
          national_id
        ),
        investor:investor_id (
          investor_id,
          firstname,
          lastname,
          phone_number
        ),
        item:item_id (
          item_id,
          item_type,
          brand,
          model,
          capacity,
          serial_number,
          estimated_value,
          item_condition,
          accessories,
          defects,
          notes,
          image_urls
        ),
        drop_point:drop_point_id (
          drop_point_id,
          drop_point_name,
          drop_point_code,
          phone_number,
          addr_house_no,
          addr_street,
          addr_sub_district,
          addr_district,
          addr_province,
          addr_postcode,
          google_map_url,
          latitude,
          longitude
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

    // Calculate remaining days
    const endDate = new Date(contract.contract_end_date);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Calculate status
    let displayStatus = 'ปกติ';
    if (remainingDays < 0) {
      displayStatus = 'ครบกำหนด';
    } else if (remainingDays <= 7) {
      displayStatus = 'ใกล้ครบกำหนด';
    }

    if (contract.contract_status === 'COMPLETED') {
      displayStatus = 'เสร็จสิ้น';
    } else if (contract.contract_status === 'DEFAULTED') {
      displayStatus = 'เกินกำหนด';
    } else if (contract.contract_status === 'LIQUIDATED') {
      displayStatus = 'ชำระหนี้แล้ว';
    }

    // Calculate remaining payment
    const remainingAmount = contract.total_amount - contract.amount_paid;
    const remainingPrincipal = contract.loan_principal_amount - contract.principal_paid;
    const remainingInterest = contract.interest_amount - contract.interest_paid;

    return NextResponse.json({
      success: true,
      contract: {
        ...contract,
        remainingDays,
        displayStatus,
        remainingAmount,
        remainingPrincipal,
        remainingInterest
      }
    });

  } catch (error: any) {
    console.error('Error fetching contract detail:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
