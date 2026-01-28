import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { refreshImageUrls } from '@/lib/aws/s3';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ contractId: string }> }
) {
  try {
    const { contractId } = await context.params;
    const { searchParams } = new URL(request.url);
    const lineId = searchParams.get('lineId');

    if (!contractId || !lineId) {
      return NextResponse.json(
        { error: 'Contract ID and LINE ID are required' },
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

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        contract_status,
        item_delivery_status,
        item_received_at,
        item_verified_at,
        created_at,
        updated_at,
        contract_start_date,
        contract_end_date,
        items:item_id (
          item_id,
          brand,
          model,
          capacity,
          image_urls,
          item_condition,
          notes,
          defects
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
      `)
      .eq('contract_id', contractId)
      .eq('drop_point_id', dropPoint.drop_point_id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const { data: bag } = await supabase
      .from('drop_point_bag_assignments')
      .select('bag_number, assigned_at')
      .eq('contract_id', contractId)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

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
        bag_number: bag?.bag_number || null,
        bag_assigned_at: bag?.assigned_at || null
      }
    });
  } catch (error: any) {
    console.error('Error fetching drop point contract detail:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
