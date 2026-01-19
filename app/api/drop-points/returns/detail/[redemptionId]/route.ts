import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ redemptionId: string }> }
) {
  try {
    const { redemptionId } = await context.params;
    const { searchParams } = new URL(request.url);
    const lineId = searchParams.get('lineId');

    if (!redemptionId || !lineId) {
      return NextResponse.json(
        { error: 'Redemption ID and LINE ID are required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: dropPoint, error: dropPointError } = await supabase
      .from('drop_points')
      .select('drop_point_id')
      .eq('line_id', lineId)
      .single();

    if (dropPointError || !dropPoint) {
      return NextResponse.json(
        { error: 'Drop point not found' },
        { status: 404 }
      );
    }

    const { data: redemption, error: redemptionError } = await supabase
      .from('redemption_requests')
      .select(`
        *,
        contract:contract_id (
          contract_id,
          contract_number,
          drop_point_id,
          items:item_id (
            item_id,
            brand,
            model,
            image_urls
          ),
          pawners:customer_id (
            firstname,
            lastname,
            phone_number,
            national_id
          ),
          drop_points:drop_point_id (
            drop_point_id,
            drop_point_name,
            phone_number
          )
        )
      `)
      .eq('redemption_id', redemptionId)
      .eq('contract.drop_point_id', dropPoint.drop_point_id)
      .single();

    if (redemptionError || !redemption) {
      return NextResponse.json(
        { error: 'Redemption not found' },
        { status: 404 }
      );
    }

    const { data: bag } = await supabase
      .from('drop_point_bag_assignments')
      .select('bag_number, assigned_at')
      .eq('contract_id', redemption.contract?.contract_id)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      redemption: {
        ...redemption,
        bag_number: bag?.bag_number || null,
        bag_assigned_at: bag?.assigned_at || null
      }
    });
  } catch (error: any) {
    console.error('Error fetching drop point return detail:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
