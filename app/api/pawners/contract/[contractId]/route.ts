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

    // Get contract with related data
    const { data: contractData, error } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        customer_id,
        investor_id,
        item_id,
        contract_start_date,
        contract_end_date,
        contract_duration_days,
        loan_principal_amount,
        interest_rate,
        interest_amount,
        total_amount,
        contract_status,
        items!inner (
          item_type,
          brand,
          model
        ),
        pawners (
          firstname,
          lastname,
          national_id,
          phone_number
        )
      `)
      .eq('contract_id', contractId)
      .single();

    if (error || !contractData) {
      console.error('Contract fetch error:', error);
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Calculate remaining days
    const endDate = new Date(contractData.contract_end_date);
    const today = new Date();
    const remainingDays = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    // Format data for frontend
    const formattedContract = {
      contract_id: contractData.contract_id,
      contract_number: contractData.contract_number,
      customer: {
        name: contractData.pawners && contractData.pawners.length > 0
          ? `${contractData.pawners[0].firstname} ${contractData.pawners[0].lastname}`
          : 'ไม่พบข้อมูล',
        idCard: contractData.pawners && contractData.pawners.length > 0
          ? contractData.pawners[0].national_id || 'X-XXXX-XXXXX-XX-X'
          : 'X-XXXX-XXXXX-XX-X',
        phone: contractData.pawners && contractData.pawners.length > 0
          ? contractData.pawners[0].phone_number || '000-000-0000'
          : '000-000-0000'
      },
      details: {
        contractId: contractData.contract_number,
        item: contractData.items && contractData.items.length > 0
          ? `${contractData.items[0].brand} ${contractData.items[0].model}`.trim()
          : 'ไม่พบข้อมูลสินค้า',
        status: contractData.contract_status === 'ACTIVE' ? 'ปกติ' : contractData.contract_status,
        value: contractData.loan_principal_amount.toLocaleString(),
        interest: `${contractData.interest_amount.toLocaleString()} (${(contractData.interest_rate * 100).toFixed(1)}%)`,
        duration: `${contractData.contract_duration_days} วัน`,
        startDate: new Date(contractData.contract_start_date).toLocaleDateString('th-TH'),
        endDate: new Date(contractData.contract_end_date).toLocaleDateString('th-TH'),
        partnerName: 'Pawnly'
      },
      remark: 'ไม่มี',
      remainingDays: remainingDays
    };

    return NextResponse.json({
      success: true,
      contract: formattedContract
    });

  } catch (error: any) {
    console.error('Error fetching contract detail:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
