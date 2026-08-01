import { NextRequest, NextResponse } from 'next/server';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { supabaseAdmin } from '@/lib/supabase/client';

async function requireOwner(request: NextRequest, lineId: string) {
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LIFF_MOCK === 'true') return;
  const identity = await requireLiffIdentity(request, 'INVESTOR');
  if (identity.lineId !== lineId) throw new LiffAuthError('LIFF_AUTH_SUBJECT_MISMATCH', 403);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lineId = searchParams.get('lineId');

    if (!lineId) {
      return NextResponse.json(
        { error: 'Line ID is required' },
        { status: 400 }
      );
    }

    try {
      await requireOwner(request, lineId);
    } catch (error) {
      if (error instanceof LiffAuthError) {
        return NextResponse.json(
          {
            error: error.status === 403
              ? 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้'
              : 'กรุณาเปิดหน้านี้ผ่าน LINE และเข้าสู่ระบบอีกครั้ง',
            code: error.code,
          },
          { status: error.status, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      return NextResponse.json(
        { error: 'ไม่สามารถตรวจสอบสิทธิ์ได้ชั่วคราว', code: 'LIFF_AUTH_ERROR' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } }
      );
    }

    const supabase = supabaseAdmin();

    // Check if investor exists
    const { data: investor, error } = await supabase
      .from('investors')
      .select('*')
      .eq('line_id', lineId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Database error:', error);
      throw error;
    }

    if (!investor) {
      return NextResponse.json({
        exists: false,
        message: 'Investor not found'
      });
    }

    // Get contract statistics for this investor
    const { data: contracts } = await supabase
      .from('contracts')
      .select('contract_id, contract_status, loan_principal_amount')
      .eq('investor_id', investor.investor_id);

    const totalContracts = contracts?.length || 0;
    const activeStatuses = ['ACTIVE', 'PENDING_SIGNATURE', 'CONFIRMED'];
    const endedStatuses = ['COMPLETED', 'TERMINATED'];
    const activeContracts = contracts?.filter(
      c => activeStatuses.includes(c.contract_status)
    ).length || 0;
    const endedContracts = contracts?.filter(
      c => endedStatuses.includes(c.contract_status)
    ).length || 0;

    // Calculate total invested amount
    const totalInvestedAmount = contracts?.reduce((sum, contract) => {
      return sum + (contract.loan_principal_amount || 0);
    }, 0) || 0;

    const currentInvestedAmount = contracts
      ?.filter(c => activeStatuses.includes(c.contract_status))
      .reduce((sum, contract) => sum + (contract.loan_principal_amount || 0), 0) || 0;

    return NextResponse.json({
      exists: true,
      investor: {
        ...investor,
        stats: {
          totalContracts,
          activeContracts,
          endedContracts,
          totalInvestedAmount,
          currentInvestedAmount
        }
      }
    }, { headers: { 'Cache-Control': 'no-store, private' } });

  } catch (error: any) {
    console.error('Error checking investor:', error);
    return NextResponse.json(
      { error: 'ไม่สามารถตรวจสอบข้อมูล Asset Funding ได้ชั่วคราว', code: 'INVESTOR_LOOKUP_FAILED' },
      { status: 500 }
    );
  }
}
