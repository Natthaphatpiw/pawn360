import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(
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

    // Update contract status to CONFIRMED and set payment confirmation timestamp
    const { data: contract, error: updateError } = await supabase
      .from('contracts')
      .update({
        contract_status: 'CONFIRMED',
        payment_confirmed_at: new Date().toISOString(),
        payment_status: 'COMPLETED',
        updated_at: new Date().toISOString()
      })
      .eq('contract_id', contractId)
      .select(`
        contract_id,
        contract_number,
        contract_status,
        payment_confirmed_at,
        payment_status,
        customer_id,
        investor_id
      `)
      .single();

    if (updateError) {
      console.error('Error updating contract:', updateError);
      return NextResponse.json(
        { error: 'Failed to update contract' },
        { status: 500 }
      );
    }

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // TODO: Send notification to investor that pawner has confirmed payment

    return NextResponse.json({
      success: true,
      message: 'Payment confirmed successfully',
      contract: contract
    });

  } catch (error: any) {
    console.error('Error confirming payment:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
