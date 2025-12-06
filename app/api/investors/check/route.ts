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

    // Check if investor exists
    const { data: investor, error } = await supabase
      .from('investors')
      .select(`
        *,
        wallet:wallets(*)
      `)
      .eq('line_id', lineId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!investor) {
      return NextResponse.json({
        exists: false,
        investor: null
      });
    }

    // Get contract statistics
    const { data: contracts } = await supabase
      .from('contracts')
      .select('contract_id, contract_status')
      .eq('investor_id', investor.investor_id);

    const stats = {
      totalContracts: contracts?.length || 0,
      activeContracts: contracts?.filter(c =>
        c.contract_status === 'ACTIVE' || c.contract_status === 'PENDING_SIGNATURE'
      ).length || 0,
      endedContracts: contracts?.filter(c =>
        c.contract_status === 'COMPLETED' || c.contract_status === 'LIQUIDATED'
      ).length || 0
    };

    return NextResponse.json({
      exists: true,
      investor: {
        ...investor,
        stats
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
