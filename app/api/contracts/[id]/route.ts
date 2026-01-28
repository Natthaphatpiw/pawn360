import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { refreshImageUrls } from '@/lib/aws/s3';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const viewer = searchParams.get('viewer');
    const includeBank = searchParams.get('includeBank') === 'true';
    const lineId = searchParams.get('lineId');

    if (!id) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    if (viewer === 'investor' && !lineId) {
      return NextResponse.json(
        { error: 'LINE ID is required for investor view' },
        { status: 400 }
      );
    }

    if (viewer === 'investor' && lineId) {
      const { data: investor, error: investorError } = await supabase
        .from('investors')
        .select('investor_id, kyc_status')
        .eq('line_id', lineId)
        .single();

      if (investorError || !investor) {
        return NextResponse.json(
          { error: 'Investor not found' },
          { status: 404 }
        );
      }

      if (investor.kyc_status !== 'VERIFIED') {
        return NextResponse.json(
          {
            error: 'ต้องยืนยันตัวตน (eKYC) ก่อนจึงจะดูข้อเสนอได้',
            kycRequired: true,
            kycStatus: investor.kyc_status,
            redirectTo: '/ekyc-invest'
          },
          { status: 403 }
        );
      }
    }

    const { data: contract, error } = await supabase
      .from('contracts')
      .select(`
        *,
        items:item_id (*),
        pawners:customer_id (*),
        drop_points:drop_point_id (*)
      `)
      .eq('contract_id', id)
      .single();

    if (error || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    if (viewer === 'investor' && contract.pawners) {
      const pawner = contract.pawners;
      const bankPayload = includeBank ? {
        bank_name: pawner.bank_name ?? null,
        bank_account_no: pawner.bank_account_no ?? null,
        bank_account_name: pawner.bank_account_name ?? null
      } : {};
      contract.pawners = {
        customer_id: pawner.customer_id,
        ...bankPayload
      };
    }

    let items = contract.items as any;
    if (Array.isArray(items)) {
      items = await Promise.all(
        items.map(async (item) => ({
          ...item,
          image_urls: await refreshImageUrls(item?.image_urls),
        }))
      );
    } else if (items) {
      items = {
        ...items,
        image_urls: await refreshImageUrls(items?.image_urls),
      };
    }

    return NextResponse.json({
      success: true,
      contract: {
        ...contract,
        items,
      }
    });

  } catch (error: any) {
    console.error('Error fetching contract:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
