import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lineId = searchParams.get('lineId');

    if (!lineId) {
      return NextResponse.json(
        { error: 'Line ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Check if investor exists
    const { data: investor, error } = await supabase
      .from('investors')
      .select('*')
      .eq('line_id', lineId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Database error:', error);
      throw error;
    }

    if (!investor) {
      return NextResponse.json({
        exists: false,
        message: 'Investor not found'
      });
    }

    // Get contract statistics for this investor
    const { data: contracts } = await supabase
      .from('contracts')
      .select('contract_id, contract_status, loan_principal_amount')
      .eq('investor_id', investor.investor_id);

    const totalContracts = contracts?.length || 0;
    const activeContracts = contracts?.filter(
      c => c.contract_status === 'ACTIVE' || c.contract_status === 'PENDING_SIGNATURE'
    ).length || 0;
    const endedContracts = contracts?.filter(
      c => c.contract_status === 'COMPLETED' || c.contract_status === 'TERMINATED'
    ).length || 0;

    // Calculate total invested amount
    const totalInvestedAmount = contracts?.reduce((sum, contract) => {
      return sum + (contract.loan_principal_amount || 0);
    }, 0) || 0;

    return NextResponse.json({
      exists: true,
      investor: {
        ...investor,
        stats: {
          totalContracts,
          activeContracts,
          endedContracts,
          totalInvestedAmount
        }
      }
    });

  } catch (error: any) {
    console.error('Error checking investor:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}