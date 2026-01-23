import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { sendAdminMessage } from '@/lib/line/admin-client';
import { createManualEstimateRequestMessage } from '@/lib/line/manual-estimate';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const isManualEstimateEnabled = () => {
  const value = (process.env.MANUAL_ESTIMATE_ENABLED || '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes' || value === 'on';
};

const normalizeNumber = (value: unknown) => {
  const num = typeof value === 'string' ? Number(value) : Number(value);
  return Number.isFinite(num) ? num : null;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestId = searchParams.get('requestId');
    const lineId = searchParams.get('lineId');

    if (!requestId) {
      return NextResponse.json(
        { error: 'requestId is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from('manual_estimate_requests')
      .select('*')
      .eq('request_id', requestId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Manual estimate request not found' },
        { status: 404 }
      );
    }

    if (lineId && data.line_id && data.line_id !== lineId) {
      return NextResponse.json(
        { error: 'Not authorized for this request' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, request: data });
  } catch (error: any) {
    console.error('Error fetching manual estimate request:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isManualEstimateEnabled()) {
      return NextResponse.json(
        { error: 'Manual estimate is disabled' },
        { status: 409 }
      );
    }

    const body = await request.json();
    const lineId = typeof body?.lineId === 'string' ? body.lineId.trim() : '';
    const itemData = body?.itemData ?? null;
    const imageUrls = Array.isArray(body?.imageUrls)
      ? body.imageUrls.filter((value: unknown) => typeof value === 'string' && value.trim())
      : [];

    if (!lineId) {
      return NextResponse.json(
        { error: 'lineId is required' },
        { status: 400 }
      );
    }

    if (!itemData || typeof itemData !== 'object') {
      return NextResponse.json(
        { error: 'itemData is required' },
        { status: 400 }
      );
    }

    if (!imageUrls.length) {
      return NextResponse.json(
        { error: 'imageUrls are required' },
        { status: 400 }
      );
    }

    if (!itemData.itemType || !itemData.brand || !itemData.model) {
      return NextResponse.json(
        { error: 'itemType, brand, and model are required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from('manual_estimate_requests')
      .insert([
        {
          line_id: lineId,
          status: 'PENDING',
          item_data: itemData,
          image_urls: imageUrls,
          created_at: now,
          updated_at: now,
        },
      ])
      .select()
      .single();

    if (error || !data) {
      throw error || new Error('Failed to create manual estimate request');
    }

    try {
      const message = createManualEstimateRequestMessage({
        requestId: data.request_id,
        itemData,
        imageUrls,
      });
      await sendAdminMessage(message);
    } catch (lineError) {
      console.error('Failed to send manual estimate message:', lineError);
      await supabase
        .from('manual_estimate_requests')
        .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
        .eq('request_id', data.request_id);

      return NextResponse.json(
        { error: 'Failed to notify admin for manual estimate' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      requestId: data.request_id,
      status: data.status,
    });
  } catch (error: any) {
    console.error('Error creating manual estimate request:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
    const estimatedPrice = normalizeNumber(body?.estimatedPrice);
    const conditionScore = normalizeNumber(body?.conditionScore);
    const conditionNote = typeof body?.conditionNote === 'string' ? body.conditionNote.trim() : null;
    const adminLineId = typeof body?.adminLineId === 'string' ? body.adminLineId.trim() : null;

    if (!requestId) {
      return NextResponse.json(
        { error: 'requestId is required' },
        { status: 400 }
      );
    }

    if (estimatedPrice === null || estimatedPrice <= 0) {
      return NextResponse.json(
        { error: 'estimatedPrice must be greater than 0' },
        { status: 400 }
      );
    }

    if (conditionScore === null || conditionScore < 0 || conditionScore > 100) {
      return NextResponse.json(
        { error: 'conditionScore must be between 0 and 100' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from('manual_estimate_requests')
      .update({
        estimated_price: estimatedPrice,
        condition_score: conditionScore,
        condition_note: conditionNote,
        admin_line_id: adminLineId,
        status: 'COMPLETED',
        updated_at: now,
        completed_at: now,
      })
      .eq('request_id', requestId)
      .eq('status', 'PENDING')
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Manual estimate request not found or already completed' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, request: data });
  } catch (error: any) {
    console.error('Error updating manual estimate request:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
    const lineId = typeof body?.lineId === 'string' ? body.lineId.trim() : '';

    if (!requestId) {
      return NextResponse.json(
        { error: 'requestId is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    const query = supabase
      .from('manual_estimate_requests')
      .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
      .eq('request_id', requestId);

    if (lineId) {
      query.eq('line_id', lineId);
    }

    const { data, error } = await query.select().single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Manual estimate request not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, request: data });
  } catch (error: any) {
    console.error('Error cancelling manual estimate request:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
