import { NextRequest, NextResponse } from 'next/server';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { supabaseAdmin } from '@/lib/supabase/client';

async function requireOwner(request: NextRequest, lineId: string) {
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LIFF_MOCK === 'true') return;
  const identity = await requireLiffIdentity(request, 'PAWNER');
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

    // Check if pawner exists
    const { data: pawner, error } = await supabase
      .from('pawners')
      .select('customer_id, firstname, lastname, kyc_status, default_drop_point_id')
      .eq('line_id', lineId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Database error:', error);
      throw error;
    }

    if (!pawner) {
      return NextResponse.json({
        exists: false,
        message: 'Pawner not found'
      });
    }

    // Get contract statistics
    const { data: contracts } = await supabase
      .from('contracts')
      .select('contract_id, contract_status, funding_status, payment_status, item_delivery_status')
      .eq('customer_id', pawner.customer_id);

    const isContractQualified = (contract: any) => {
      const status = contract.contract_status;
      const fundingStatus = contract.funding_status;
      const paymentStatus = contract.payment_status;
      const itemStatus = contract.item_delivery_status;

      if (fundingStatus === 'PENDING') return false;
      if (paymentStatus && paymentStatus !== 'COMPLETED') return false;

      if (['COMPLETED', 'TERMINATED', 'LIQUIDATED', 'DEFAULTED'].includes(status)) {
        return true;
      }

      if (!['CONFIRMED', 'EXTENDED', 'ACTIVE'].includes(status)) {
        return false;
      }

      if (!itemStatus || !['RECEIVED_AT_DROP_POINT', 'VERIFIED', 'RETURNED'].includes(itemStatus)) {
        return false;
      }

      return true;
    };

    const qualifiedContracts = (contracts || []).filter(isContractQualified);

    const totalContracts = qualifiedContracts.length;
    const activeContracts = qualifiedContracts.filter(
      c => ['CONFIRMED', 'EXTENDED'].includes(c.contract_status)
    ).length;
    const endedContracts = qualifiedContracts.filter(
      c => ['COMPLETED', 'TERMINATED', 'LIQUIDATED', 'DEFAULTED'].includes(c.contract_status)
    ).length;

    return NextResponse.json({
      exists: true,
      pawner: {
        customer_id: pawner.customer_id,
        firstname: pawner.firstname,
        lastname: pawner.lastname,
        kyc_status: pawner.kyc_status,
        default_drop_point_id: pawner.default_drop_point_id,
        stats: {
          totalContracts,
          activeContracts,
          endedContracts
        }
      }
    }, { headers: { 'Cache-Control': 'no-store, private' } });

  } catch (error: any) {
    console.error('Error checking pawner:', error);
    return NextResponse.json(
      { error: 'ไม่สามารถตรวจสอบข้อมูลผู้ขายได้ชั่วคราว', code: 'PAWNER_LOOKUP_FAILED' },
      { status: 500 }
    );
  }
}
