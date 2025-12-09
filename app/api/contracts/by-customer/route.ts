import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lineId = searchParams.get('lineId');

    if (!lineId) {
      return NextResponse.json(
        { error: 'LINE ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

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

    // Fetch contracts with item details (only fully confirmed/completed contracts)
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
      .in('contract_status', ['CONFIRMED', 'COMPLETED'])
      .order('created_at', { ascending: false });

    if (contractsError) {
      throw contractsError;
    }

    // Calculate remaining days and status for each contract
    const contractsWithStatus = contracts?.map(contract => {
      const endDate = new Date(contract.contract_end_date);
      const today = new Date();
      const diffTime = endDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let displayStatus = 'ปกติ'; // Active/Normal
      if (diffDays < 0) {
        displayStatus = 'ครบกำหนด'; // Due/Overdue
      } else if (diffDays <= 7) {
        displayStatus = 'ใกล้ครบกำหนด'; // Near Due
      }

      // Override with contract status
      if (contract.contract_status === 'CONFIRMED') {
        displayStatus = 'กำลังดำเนินการ';
      } else if (contract.contract_status === 'COMPLETED') {
        displayStatus = 'เสร็จสิ้น';
      } else if (contract.contract_status === 'DEFAULTED') {
        displayStatus = 'เกินกำหนด';
      } else if (contract.contract_status === 'LIQUIDATED') {
        displayStatus = 'ชำระหนี้แล้ว';
      }

      return {
        ...contract,
        remainingDays: diffDays,
        displayStatus
      };
    }) || [];

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
