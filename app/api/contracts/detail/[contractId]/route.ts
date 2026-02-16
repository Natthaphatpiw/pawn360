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

    const getDueStatus = (remainingDays: number) => {
      if (remainingDays <= 0) return 'ครบกำหนด';
      if (remainingDays <= 7) return 'ใกล้ครบกำหนด';
      return 'ปกติ';
    };

    const getDisplayStatus = (data: any, remainingDays: number) => {
      const status = data.contract_status;
      const fundingStatus = data.funding_status;
      const paymentStatus = data.payment_status;
      const itemStatus = data.item_delivery_status;

      if (status === 'TERMINATED') return 'ยกเลิก';
      if (status === 'COMPLETED') return 'เสร็จสิ้น';
      if (status === 'LIQUIDATED') return 'ขายทอดตลาด';
      if (status === 'DEFAULTED') return 'เกินกำหนด';

      if (status === 'PENDING' || status === 'PENDING_SIGNATURE' || fundingStatus === 'PENDING') {
        return 'รอรับนักลงทุน';
      }

      if (status === 'ACTIVE') {
        if (fundingStatus === 'FUNDED' && paymentStatus !== 'COMPLETED') {
          return 'รอการโอนเงิน';
        }
        if (paymentStatus === 'COMPLETED') {
          return 'รอยืนยันรับเงิน';
        }
        return 'รอการดำเนินการ';
      }

      if (status === 'CONFIRMED' || status === 'EXTENDED') {
        if (!itemStatus || itemStatus === 'PENDING') return 'รอนำส่งสินค้า';
        if (itemStatus === 'PAWNER_CONFIRMED') return 'กำลังนำส่งสินค้า';
        if (['IN_TRANSIT', 'DRIVER_ASSIGNED', 'DRIVER_SEARCH', 'ITEM_PICKED'].includes(itemStatus)) {
          return 'กำลังขนส่ง';
        }
        if (itemStatus === 'RECEIVED_AT_DROP_POINT') return 'รอตรวจสอบสินค้า';
        if (itemStatus === 'VERIFIED') return getDueStatus(remainingDays);
        if (itemStatus === 'RETURNED') return 'ส่งคืน';
      }

      return getDueStatus(remainingDays);
    };

    // Calculate remaining days
    const endDate = new Date(contract.contract_end_date);
    endDate.setHours(0, 0, 0, 0);
    const startDate = new Date(contract.contract_start_date);
    startDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = endDate.getTime() - today.getTime();
    const remainingDays = Math.ceil(diffTime / msPerDay);

    const displayStatus = getDisplayStatus(contract, remainingDays);

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
