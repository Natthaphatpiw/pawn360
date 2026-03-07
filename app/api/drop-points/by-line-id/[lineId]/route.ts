import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ lineId: string }> }
) {
  try {
    const { lineId: rawLineId } = await context.params;
    const lineId = (rawLineId || '').trim();

    if (!lineId) {
      return NextResponse.json(
        { error: 'LINE ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: dropPoint, error } = await supabase
      .from('drop_points')
      .select('*')
      .eq('line_id', lineId)
      .single();

    if (error || !dropPoint) {
      return NextResponse.json({
        success: false,
        registered: false,
        dropPoint: null,
      });
    }

    return NextResponse.json({
      success: true,
      registered: true,
      dropPoint
    });

  } catch (error: any) {
    console.error('Error fetching drop point:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
