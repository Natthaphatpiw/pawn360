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
      console.error('Database error:', error);
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
      .select('contract_id, contract_status, funding_status, payment_status, item_delivery_status')
      .eq('customer_id', pawner.customer_id);

    const isContractQualified = (contract: any) => {
      const status = contract.contract_status;
      const fundingStatus = contract.funding_status;
      const paymentStatus = contract.payment_status;
      const itemStatus = contract.item_delivery_status;

      if (fundingStatus === 'PENDING') return false;
      if (paymentStatus && paymentStatus !== 'COMPLETED') return false;

      if (['COMPLETED', 'TERMINATED', 'LIQUIDATED', 'DEFAULTED'].includes(status)) {
        return true;
      }

      if (!['CONFIRMED', 'EXTENDED', 'ACTIVE'].includes(status)) {
        return false;
      }

      if (!itemStatus || !['RECEIVED_AT_DROP_POINT', 'VERIFIED', 'RETURNED'].includes(itemStatus)) {
        return false;
      }

      return true;
    };

    const qualifiedContracts = (contracts || []).filter(isContractQualified);

    const totalContracts = qualifiedContracts.length;
    const activeContracts = qualifiedContracts.filter(
      c => ['CONFIRMED', 'EXTENDED'].includes(c.contract_status)
    ).length;
    const endedContracts = qualifiedContracts.filter(
      c => ['COMPLETED', 'TERMINATED', 'LIQUIDATED', 'DEFAULTED'].includes(c.contract_status)
    ).length;

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
