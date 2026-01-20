import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ contractId: string }> }
) {
  try {
    const { contractId } = await context.params;

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
          map_embed,
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

    const msPerDay = 1000 * 60 * 60 * 24;

    // Calculate remaining days
    const endDate = new Date(contract.contract_end_date);
    const startDate = new Date(contract.contract_start_date);
    startDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = endDate.getTime() - today.getTime();
    const remainingDays = Math.ceil(diffTime / msPerDay);

    // Calculate status
    let displayStatus = 'ปกติ';
    if (remainingDays < 0) {
      displayStatus = 'ครบกำหนด';
    } else if (remainingDays <= 7) {
      displayStatus = 'ใกล้ครบกำหนด';
    }

    if (contract.contract_status === 'PENDING' || contract.contract_status === 'PENDING_SIGNATURE') {
      displayStatus = 'รอการดำเนินการ';
    } else if (contract.contract_status === 'CONFIRMED') {
      displayStatus = 'กำลังดำเนินการ';
    } else if (contract.contract_status === 'COMPLETED') {
      displayStatus = 'เสร็จสิ้น';
    } else if (contract.contract_status === 'DEFAULTED') {
      displayStatus = 'เกินกำหนด';
    } else if (contract.contract_status === 'LIQUIDATED') {
      displayStatus = 'ชำระหนี้แล้ว';
    } else if (contract.contract_status === 'TERMINATED') {
      displayStatus = 'ยกเลิก';
    }

    const rawDurationDays = Number(contract.contract_duration_days || 0)
      || Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay);
    const daysInContract = Math.max(1, rawDurationDays);
    const rawDaysElapsed = Math.floor((today.getTime() - startDate.getTime()) / msPerDay) + 1;
    const daysElapsed = Math.min(daysInContract, Math.max(1, rawDaysElapsed));

    const rawRate = Number(contract.interest_rate || 0);
    const monthlyInterestRate = rawRate > 1 ? rawRate / 100 : rawRate;
    const feeRate = 0.01;
    const interestRateForAccrual = Math.max(0, monthlyInterestRate - feeRate);
    const dailyInterestRate = interestRateForAccrual / 30;

    const currentPrincipal = contract.current_principal_amount || contract.loan_principal_amount;
    const feeBase = contract.original_principal_amount || contract.loan_principal_amount || currentPrincipal;
    const feeAmount = Math.round(feeBase * feeRate * (daysInContract / 30) * 100) / 100;
    const interestAccrued = Math.round(currentPrincipal * dailyInterestRate * daysElapsed * 100) / 100;
    const interestDue = Math.max(0, interestAccrued + feeAmount - (contract.interest_paid || 0));

    // Calculate remaining payment (use accrued interest + fixed fee)
    const remainingPrincipal = Math.max(0, currentPrincipal - (contract.principal_paid || 0));
    const remainingInterest = Math.max(0, interestDue);
    const remainingAmount = Math.max(0, remainingPrincipal + remainingInterest);

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
