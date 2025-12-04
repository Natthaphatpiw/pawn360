import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const contractId = params.id;

    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: contract, error } = await supabase
      .from('contracts')
      .select(`
        *,
        pawners!customer_id (
          customer_id,
          firstname,
          lastname,
          phone_number,
          national_id
        ),
        investors!investor_id (
          investor_id,
          firstname,
          lastname
        ),
        items!item_id (
          item_id,
          brand,
          model,
          item_type
        ),
        drop_points!drop_point_id (
          drop_point_id,
          drop_point_name,
          addr_house_no,
          addr_street,
          addr_sub_district,
          addr_district,
          addr_province,
          google_map_url
        )
      `)
      .eq('contract_id', contractId)
      .single();

    if (error) {
      throw error;
    }

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const endDate = new Date(contract.contract_end_date);
    const today = new Date();
    const remainingDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    return NextResponse.json({
      success: true,
      contract: {
        ...contract,
        remainingDays
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
