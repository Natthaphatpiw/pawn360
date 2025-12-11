import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ lineId: string }> }
) {
  try {
    const { lineId } = await context.params;

    if (!lineId) {
      return NextResponse.json(
        { error: 'LINE ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get investor by LINE ID
    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('*')
      .eq('line_id', lineId)
      .single();

    if (investorError) {
      if (investorError.code === 'PGRST116') {
        // No rows returned
        return NextResponse.json(
          { error: 'Investor not found', exists: false },
          { status: 404 }
        );
      }
      console.error('Error fetching investor:', investorError);
      return NextResponse.json(
        { error: 'Failed to fetch investor' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      investor: investor
    });

  } catch (error: any) {
    console.error('Error fetching investor by LINE ID:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
