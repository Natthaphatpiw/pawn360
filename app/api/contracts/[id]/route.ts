import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const viewer = searchParams.get('viewer');
    const includeBank = searchParams.get('includeBank') === 'true';

    if (!id) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: contract, error } = await supabase
      .from('contracts')
      .select(`
        *,
        items:item_id (*),
        pawners:customer_id (*),
        drop_points:drop_point_id (*)
      `)
      .eq('contract_id', id)
      .single();

    if (error || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    if (viewer === 'investor' && contract.pawners) {
      const pawner = contract.pawners;
      const bankPayload = includeBank ? {
        bank_name: pawner.bank_name ?? null,
        bank_account_no: pawner.bank_account_no ?? null,
        bank_account_name: pawner.bank_account_name ?? null
      } : {};
      contract.pawners = {
        customer_id: pawner.customer_id,
        ...bankPayload
      };
    }

    return NextResponse.json({
      success: true,
      contract
    });

  } catch (error: any) {
    console.error('Error fetching contract:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
