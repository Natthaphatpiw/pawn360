import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ lineId: string }> }
) {
  try {
    const params = await context.params;
    const { lineId } = params;

    if (!lineId) {
      return NextResponse.json(
        { error: 'Line ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: pawner, error } = await supabase
      .from('pawners')
      .select('*')
      .eq('line_id', lineId)
      .single();

    if (error || !pawner) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลผู้ใช้' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      pawner
    });

  } catch (error: any) {
    console.error('Error fetching pawner by line ID:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
