import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { refreshImageUrls } from '@/lib/aws/s3';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
};

// GET - Fetch draft items for a LINE user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lineId = searchParams.get('lineId');
    const itemId = searchParams.get('itemId');

    if (!lineId) {
      return NextResponse.json(
        { error: 'LINE ID is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const supabase = supabaseAdmin();

    // Fetch a single draft item (optional)
    if (itemId) {
      const { data: item, error } = await supabase
        .from('items')
        .select('*')
        .eq('line_id', lineId)
        .eq('item_status', 'DRAFT')
        .eq('item_id', itemId)
        .single();

      if (error) {
        // Not found
        return NextResponse.json(
          { success: false, error: 'Draft not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const refreshedItem = {
        ...item,
        image_urls: await refreshImageUrls(item?.image_urls),
      };

      return NextResponse.json(
        { success: true, item: refreshedItem },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Fetch all draft items for this LINE user
    const { data: items, error } = await supabase
      .from('items')
      .select('*')
      .eq('line_id', lineId)
      .eq('item_status', 'DRAFT')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const refreshedItems = await Promise.all(
      (items || []).map(async (draft) => ({
        ...draft,
        image_urls: await refreshImageUrls(draft?.image_urls),
      }))
    );

    return NextResponse.json(
      {
        success: true,
        items: refreshedItems,
      },
      { headers: NO_STORE_HEADERS }
    );

  } catch (error: any) {
    console.error('Error fetching draft items:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
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
      color,
      serialNo,
      screenSize,
      watchSize,
      watchConnectivity,
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
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!itemType || !brand || !model) {
      return NextResponse.json(
        { error: 'Item type, brand, and model are required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const supabase = supabaseAdmin();

    // Check if user is registered (optional - draft can be saved without registration)
    const { data: pawner } = await supabase
      .from('pawners')
      .select('customer_id')
      .eq('line_id', lineId)
      .single();

    const totalScore =
      typeof conditionResult?.totalScore === 'number'
        ? conditionResult.totalScore
        : typeof conditionResult?.score === 'number'
          ? Math.round(conditionResult.score * 100)
          : null;

    const aiScore =
      typeof conditionResult?.score === 'number'
        ? conditionResult.score
        : typeof conditionResult?.totalScore === 'number'
          ? conditionResult.totalScore / 100
          : null;

    const estimatedValue =
      typeof estimateResult?.estimatedValue === 'number'
        ? estimateResult.estimatedValue
        : typeof estimateResult?.estimatedPrice === 'number'
          ? estimateResult.estimatedPrice
          : 0;

    const aiConfidence =
      typeof estimateResult?.confidence === 'number' ? estimateResult.confidence : null;

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
        color: color || null,
        serial_number: serialNo || null,
        screen_size: screenSize || null,
        watch_size: watchSize || null,
        watch_connectivity: watchConnectivity || null,
        accessories: accessories || null,
        defects: defects || null,
        notes: notes || null,
        image_urls: imageUrls || [],
        item_condition: totalScore,
        ai_condition_score: aiScore,
        ai_condition_reason: conditionResult?.reason || null,
        estimated_value: estimatedValue,
        ai_confidence: aiConfidence,
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

    return NextResponse.json(
      { success: true, item },
      { headers: NO_STORE_HEADERS }
    );

  } catch (error: any) {
    console.error('Error saving draft item:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
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
        { status: 400, headers: NO_STORE_HEADERS }
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

    return NextResponse.json(
      { success: true, message: 'Draft item deleted' },
      { headers: NO_STORE_HEADERS }
    );

  } catch (error: any) {
    console.error('Error deleting draft item:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
