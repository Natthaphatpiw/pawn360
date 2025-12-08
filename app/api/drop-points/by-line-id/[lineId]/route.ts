import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lineId: string }> }
) {
  try {
    const { lineId } = await params;

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
      return NextResponse.json(
        { error: 'Drop point not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
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
