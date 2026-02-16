import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  console.log('📥 [by-customer] GET request received');
  try {
    const { searchParams } = new URL(request.url);
    const lineId = searchParams.get('lineId');
    console.log('🔍 [by-customer] lineId:', lineId);

    if (!lineId) {
      console.log('❌ [by-customer] Missing lineId');
      return NextResponse.json(
        { error: 'LINE ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    console.log('✅ [by-customer] Supabase client initialized');

    // First, get the customer_id from the pawners table
    const { data: pawner, error: pawnerError } = await supabase
      .from('pawners')
      .select('customer_id')
      .eq('line_id', lineId)
      .single();

    if (pawnerError || !pawner) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Fetch contracts with item details
    const visibleStatuses = [
      'PENDING',
      'PENDING_SIGNATURE',
      'ACTIVE',
      'CONFIRMED',
      'EXTENDED',
      'COMPLETED',
      'TERMINATED',
      'LIQUIDATED',
      'DEFAULTED',
    ];
    const { data: contracts, error: contractsError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        contract_start_date,
        contract_end_date,
        contract_duration_days,
        loan_principal_amount,
        interest_rate,
        interest_amount,
        total_amount,
        amount_paid,
        interest_paid,
        principal_paid,
        contract_status,
        funding_status,
        payment_status,
        item_delivery_status,
        items:item_id (
          item_id,
          item_type,
          brand,
          model,
          capacity,
          estimated_value,
          item_condition,
          image_urls
        )
      `)
      .eq('customer_id', pawner.customer_id)
      .in('contract_status', visibleStatuses)
      .order('created_at', { ascending: false });

    if (contractsError) {
      throw contractsError;
    }

    const getDueStatus = (remainingDays: number) => {
      if (remainingDays <= 0) return 'ครบกำหนด';
      if (remainingDays <= 7) return 'ใกล้ครบกำหนด';
      return 'ปกติ';
    };

    const getDisplayStatus = (contract: any, remainingDays: number) => {
      const status = contract.contract_status;
      const fundingStatus = contract.funding_status;
      const paymentStatus = contract.payment_status;
      const itemStatus = contract.item_delivery_status;

      if (status === 'TERMINATED') return 'ยกเลิก';
      if (status === 'COMPLETED') return 'เสร็จสิ้น';
      if (status === 'LIQUIDATED') return 'ขายทอดตลาด';
      if (status === 'DEFAULTED') return 'เกินกำหนด';

      if (status === 'PENDING' || status === 'PENDING_SIGNATURE' || fundingStatus === 'PENDING') {
        return 'รอสถานะคำขอ';
      }

      if (status === 'ACTIVE') {
        if (fundingStatus === 'FUNDED' && paymentStatus !== 'COMPLETED') {
          return 'รอการโอนเงิน';
        }
        if (paymentStatus === 'COMPLETED') {
          return 'รอยืนยันรับเงิน';
        }
        return 'รอสถานะคำขอ';
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

    const shouldShowInContractList = (contract: any) => {
      const status = contract.contract_status;
      const fundingStatus = contract.funding_status;
      const paymentStatus = contract.payment_status;

      // รายการที่ยังรอรับนักลงทุน/รอคำขอ ให้ไปอยู่หน้า "สถานะคำขอ"
      if (status === 'PENDING' || status === 'PENDING_SIGNATURE') return false;
      if (fundingStatus === 'PENDING') return false;
      if (status === 'ACTIVE' && paymentStatus !== 'COMPLETED') return false;

      return true;
    };

    // Calculate remaining days and status for each visible contract
    const contractsWithStatus = contracts?.map(contract => {
      const endDate = new Date(contract.contract_end_date);
      endDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = endDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const displayStatus = getDisplayStatus(contract, diffDays);

      return {
        ...contract,
        remainingDays: diffDays,
        displayStatus
      };
    }).filter(shouldShowInContractList) || [];

    return NextResponse.json({
      success: true,
      contracts: contractsWithStatus
    });

  } catch (error: any) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
