import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await context.params;
    const { searchParams } = new URL(request.url);
    const viewer = searchParams.get('viewer');

    if (!requestId) {
      return NextResponse.json(
        { error: 'Missing request ID' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: actionRequest, error } = await supabase
      .from('contract_action_requests')
      .select(`
        *,
        contract:contract_id (
          *,
          items:item_id (*),
          pawners:customer_id (*),
          investors:investor_id (*)
        )
      `)
      .eq('request_id', requestId)
      .single();

    if (error || !actionRequest) {
      return NextResponse.json(
        { error: 'Request not found' },
        { status: 404 }
      );
    }

    if (viewer === 'investor' && actionRequest.contract?.pawners) {
      const pawner = actionRequest.contract.pawners;
      actionRequest.contract.pawners = {
        customer_id: pawner.customer_id,
        bank_name: pawner.bank_name ?? null,
        bank_account_no: pawner.bank_account_no ?? null,
        bank_account_name: pawner.bank_account_name ?? null
      };
      if (actionRequest.pawner_signature_url) {
        actionRequest.pawner_signature_url = null;
      }
    }

    return NextResponse.json({
      success: true,
      request: actionRequest,
    });

  } catch (error: any) {
    console.error('Error fetching action request:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
