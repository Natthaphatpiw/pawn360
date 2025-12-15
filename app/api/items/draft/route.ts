import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

// GET - Fetch draft items for a LINE user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lineId = searchParams.get('lineId');

    if (!lineId) {
      return NextResponse.json(
        { error: 'LINE ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Fetch draft items for this LINE user
    const { data: items, error } = await supabase
      .from('items')
      .select('*')
      .eq('line_id', lineId)
      .eq('item_status', 'DRAFT')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      items: items || []
    });

  } catch (error: any) {
    console.error('Error fetching draft items:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Save a draft item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      lineId,
      itemType,
      brand,
      model,
      capacity,
      accessories,
      defects,
      notes,
      imageUrls,
      conditionResult,
      estimateResult,
      // Laptop specific
      cpu,
      ram,
      storage,
      gpu,
      // Camera specific
      lenses
    } = body;

    if (!lineId) {
      return NextResponse.json(
        { error: 'LINE ID is required' },
        { status: 400 }
      );
    }

    if (!itemType || !brand || !model) {
      return NextResponse.json(
        { error: 'Item type, brand, and model are required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Check if user is registered (optional - draft can be saved without registration)
    const { data: pawner } = await supabase
      .from('pawners')
      .select('customer_id')
      .eq('line_id', lineId)
      .single();

    // Insert draft item
    const { data: item, error } = await supabase
      .from('items')
      .insert([{
        customer_id: pawner?.customer_id || null,
        line_id: lineId,
        item_type: itemType,
        brand,
        model,
        capacity: capacity || null,
        accessories: accessories || null,
        defects: defects || null,
        notes: notes || null,
        image_urls: imageUrls || [],
        item_condition: conditionResult?.totalScore || null,
        ai_condition_score: conditionResult?.score || null,
        ai_condition_reason: conditionResult?.reason || null,
        estimated_value: estimateResult?.estimatedValue || 0,
        ai_confidence: estimateResult?.confidence || null,
        item_status: 'DRAFT',
        // Laptop specific
        cpu: cpu || null,
        ram: ram || null,
        storage: storage || null,
        gpu: gpu || null,
      }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    // If there are camera lenses, insert them
    if (lenses && lenses.length > 0 && item) {
      const lensRecords = lenses
        .filter((lens: string) => lens.trim() !== '')
        .map((lens: string) => ({
          item_id: item.item_id,
          lens_model: lens
        }));

      if (lensRecords.length > 0) {
        await supabase.from('item_lenses').insert(lensRecords);
      }
    }

    return NextResponse.json({
      success: true,
      item
    });

  } catch (error: any) {
    console.error('Error saving draft item:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a draft item
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const itemId = searchParams.get('itemId');
    const lineId = searchParams.get('lineId');

    if (!itemId || !lineId) {
      return NextResponse.json(
        { error: 'Item ID and LINE ID are required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Only allow deleting draft items owned by this LINE user
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('item_id', itemId)
      .eq('line_id', lineId)
      .eq('item_status', 'DRAFT');

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Draft item deleted'
    });

  } catch (error: any) {
    console.error('Error deleting draft item:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
