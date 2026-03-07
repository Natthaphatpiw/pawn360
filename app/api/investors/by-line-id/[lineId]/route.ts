import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ lineId: string }> }
) {
  try {
    const params = await context.params;
    const lineId = (params.lineId || '').trim();

    if (!lineId) {
      return NextResponse.json(
        { error: 'Line ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: investor, error } = await supabase
      .from('investors')
      .select('*')
      .eq('line_id', lineId)
      .single();

    if (error || !investor) {
      return NextResponse.json({
        success: false,
        registered: false,
        investor: null,
      });
    }

    return NextResponse.json({
      success: true,
      registered: true,
      investor
    });

  } catch (error: any) {
    console.error('Error fetching investor by line ID:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
