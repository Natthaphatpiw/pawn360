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

    // Check if pawner exists
    const { data: pawner, error } = await supabase
      .from('pawners')
      .select('*')
      .eq('line_id', lineId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!pawner) {
      return NextResponse.json({
        exists: false,
        message: 'Pawner not found'
      });
    }

    // Get contract statistics
    const { data: contracts } = await supabase
      .from('contracts')
      .select('contract_id, contract_status')
      .eq('customer_id', pawner.customer_id);

    const totalContracts = contracts?.length || 0;
    const activeContracts = contracts?.filter(
      c => c.contract_status === 'ACTIVE' || c.contract_status === 'PENDING_SIGNATURE'
    ).length || 0;
    const endedContracts = contracts?.filter(
      c => c.contract_status === 'COMPLETED' || c.contract_status === 'TERMINATED'
    ).length || 0;

    return NextResponse.json({
      exists: true,
      pawner: {
        ...pawner,
        stats: {
          totalContracts,
          activeContracts,
          endedContracts
        }
      }
    });

  } catch (error: any) {
    console.error('Error checking pawner:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
