import { NextRequest, NextResponse } from 'next/server';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
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

    if (!(process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LIFF_MOCK === 'true')) {
      const identity = await requireLiffIdentity(request, 'INVESTOR');
      if (identity.lineId !== lineId) throw new LiffAuthError('LIFF_AUTH_SUBJECT_MISMATCH', 403);
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
    }, { headers: { 'Cache-Control': 'no-store, private' } });

  } catch (error: unknown) {
    if (error instanceof LiffAuthError) {
      return NextResponse.json(
        { error: error.status === 403 ? 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' : 'กรุณาเข้าสู่ระบบ LINE ใหม่', code: error.code },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    console.error('Error fetching investor by line ID:', error);
    return NextResponse.json(
      { error: 'ไม่สามารถโหลดข้อมูล Asset Funding ได้ชั่วคราว', code: 'INVESTOR_LOOKUP_FAILED' },
      { status: 500 }
    );
  }
}
