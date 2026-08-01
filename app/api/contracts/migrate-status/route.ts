import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  internalAuthErrorResponse,
  requireInternalRequest,
} from '@/lib/security/request-auth';

export async function POST(request: NextRequest) {
  try {
    requireInternalRequest(request);
  } catch (error) {
    return internalAuthErrorResponse(error);
  }

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

  } catch (error) {
    console.error('[contracts:migrate-status] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Failed to migrate contract statuses', code: 'MIGRATION_FAILED' },
      { status: 500 }
    );
  }
}
