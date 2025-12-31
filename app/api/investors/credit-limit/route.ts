import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { lineId, maxInvestmentAmount } = body;

    if (!lineId) {
      return NextResponse.json(
        { error: 'Line ID is required' },
        { status: 400 }
      );
    }

    const parsedAmount = Number(maxInvestmentAmount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      return NextResponse.json(
        { error: 'Invalid credit limit amount' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('investor_id')
      .eq('line_id', lineId)
      .single();

    if (investorError || !investor) {
      return NextResponse.json(
        { error: 'Investor not found' },
        { status: 404 }
      );
    }

    const { data: updatedInvestor, error: updateError } = await supabase
      .from('investors')
      .update({
        max_investment_amount: parsedAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('line_id', lineId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating credit limit:', updateError);
      return NextResponse.json(
        { error: 'Failed to update credit limit' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      investor: updatedInvestor,
    });
  } catch (error: any) {
    console.error('Error updating credit limit:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
