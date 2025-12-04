import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: contracts, error } = await supabase
      .from('contracts')
      .select('contract_id, contract_number, loan_principal_amount, contract_end_date, contract_status, items!inner(item_id, brand, model, item_type)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const formattedContracts = contracts?.map(contract => {
      const item = Array.isArray(contract.items) ? contract.items[0] : contract.items;
      const brand = item && typeof item === 'object' && 'brand' in item ? item.brand : '';
      const model = item && typeof item === 'object' && 'model' in item ? item.model : '';
      
      return {
        contract_id: contract.contract_id,
        contract_number: contract.contract_number,
        item_name: `${brand} ${model}`.trim(),
        loan_principal_amount: contract.loan_principal_amount,
        contract_end_date: contract.contract_end_date,
        contract_status: contract.contract_status
      };
    });

    return NextResponse.json({
      success: true,
      contracts: formattedContracts
    });

  } catch (error: any) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
