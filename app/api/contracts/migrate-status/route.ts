import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin();

    // Update all ACTIVE contracts that have payment_confirmed_at to CONFIRMED
    const { data: updatedContracts, error: updateError } = await supabase
      .from('contracts')
      .update({
        contract_status: 'CONFIRMED',
        updated_at: new Date().toISOString()
      })
      .eq('contract_status', 'ACTIVE')
      .not('payment_confirmed_at', 'is', null)
      .select('contract_id, contract_number, contract_status, payment_confirmed_at');

    if (updateError) {
      console.error('Error migrating contract statuses:', updateError);
      return NextResponse.json(
        { error: 'Failed to migrate contract statuses' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Migrated ${updatedContracts?.length || 0} contracts to CONFIRMED status`,
      updated_contracts: updatedContracts
    });

  } catch (error: any) {
    console.error('Error in migrate-status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
