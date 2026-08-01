import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { sendAdminMessage } from '@/lib/line/admin-client';
import { createManualEstimateRequestMessage } from '@/lib/line/manual-estimate';
import { parseBoolEnv } from '@/lib/utils/env';
import {
  liffAuthErrorResponse,
  requireAdminLiffIdentity,
  requireInternalRequest,
  requireLiffOwner,
} from '@/lib/security/request-auth';
import {
  boundedText,
  readBoundedJsonObject,
  requireOwnedBlobUrl,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';
import {
  EstimateAttestationError,
  estimateAttestationErrorResponse,
  issueEstimateAttestation,
} from '@/lib/security/estimate-attestation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const isManualEstimateEnabled = () => parseBoolEnv(process.env.MANUAL_ESTIMATE_ENABLED);

async function requireAdminOrInternal(request: NextRequest) {
  try {
    requireInternalRequest(request, ['INTERNAL_API_SECRET']);
  } catch {
    await requireAdminLiffIdentity(request);
  }
}

const normalizeNumber = (value: unknown) => {
  const num = typeof value === 'string' ? Number(value) : Number(value);
  return Number.isFinite(num) ? num : null;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestId = boundedText(searchParams.get('requestId'), 64, true) || '';
    const claimedLineId = boundedText(searchParams.get('lineId'), 128) || '';

    if (!requestId) {
      return NextResponse.json(
        { error: 'requestId is required' },
        { status: 400 }
      );
    }

    const lineId = claimedLineId
      ? await requireLiffOwner(request, 'PAWNER', claimedLineId)
      : null;
    if (!claimedLineId) await requireAdminOrInternal(request);

    const supabase = supabaseAdmin();
    let query = supabase
      .from('manual_estimate_requests')
      .select('request_id, status, item_data, image_urls, estimated_price, condition_score, condition_note, created_at, updated_at, completed_at')
      .eq('request_id', requestId);
    if (lineId) query = query.eq('line_id', lineId);
    const { data, error } = await query.single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Manual estimate request not found' },
        { status: 404 }
      );
    }

    let responseRequest: Record<string, unknown> = data as unknown as Record<string, unknown>;
    if (
      lineId
      && data.status === 'COMPLETED'
      && Number.isFinite(Number(data.estimated_price))
      && Number.isFinite(Number(data.condition_score))
    ) {
      try {
        responseRequest = {
          ...responseRequest,
          estimate_job_id: data.request_id,
          estimate_attestation: issueEstimateAttestation({
            referenceId: String(data.request_id),
            lineId,
            request: {
              ...(data.item_data && typeof data.item_data === 'object' ? data.item_data : {}),
              images: Array.isArray(data.image_urls) ? data.image_urls : [],
            },
            result: {
              estimatedPrice: Number(data.estimated_price),
              condition: Math.min(1, Math.max(0, Number(data.condition_score) / 100)),
              confidence: 1,
            },
            aiCondition: Math.min(1, Math.max(0, Number(data.condition_score) / 100)),
            source: 'MANUAL',
          }),
          requires_manual_review: false,
        };
      } catch (error) {
        if (error instanceof EstimateAttestationError) {
          return NextResponse.json(estimateAttestationErrorResponse(error), {
            status: error.status,
            headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
          });
        }
        throw error;
      }
    }

    return NextResponse.json(
      { success: true, request: responseRequest },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error fetching manual estimate request');
    return sanitizedServerError();
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

    const body = await readBoundedJsonObject(request) as any;
    const lineId = boundedText(body?.lineId, 128, true) || '';
    const itemData = body?.itemData ?? null;
    const imageUrls = Array.isArray(body?.imageUrls) ? body.imageUrls : [];

    if (!lineId) {
      return NextResponse.json(
        { error: 'lineId is required' },
        { status: 400 }
      );
    }
    const verifiedLineId = await requireLiffOwner(request, 'PAWNER', lineId);

    if (!itemData || typeof itemData !== 'object' || Array.isArray(itemData)) {
      return NextResponse.json(
        { error: 'itemData is required' },
        { status: 400 }
      );
    }

    if (!imageUrls.length || imageUrls.length > 4) {
      return NextResponse.json(
        { error: 'กรุณาอัปโหลดรูปภาพ 1-4 รูป' },
        { status: 400 }
      );
    }

    const safeImageUrls = imageUrls.map((url: unknown) => requireOwnedBlobUrl(url, ['pawn-items/']));
    const safeItemData = {
      ...itemData,
      itemType: boundedText(itemData.itemType, 80, true),
      brand: boundedText(itemData.brand, 120, true),
      model: boundedText(itemData.model, 180, true),
    };

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
          line_id: verifiedLineId,
          status: 'PENDING',
          item_data: safeItemData,
          image_urls: safeImageUrls,
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
        itemData: safeItemData,
        imageUrls: safeImageUrls,
      });
      await sendAdminMessage(message);
    } catch {
      console.error('Failed to send manual estimate message');
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
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error creating manual estimate request');
    return sanitizedServerError();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdminOrInternal(request);
    const body = await readBoundedJsonObject(request) as any;
    const requestId = boundedText(body?.requestId, 64, true) || '';
    const estimatedPrice = normalizeNumber(body?.estimatedPrice);
    const conditionScore = normalizeNumber(body?.conditionScore);
    const conditionNote = boundedText(body?.conditionNote, 2_000);

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
        status: 'COMPLETED',
        updated_at: now,
        completed_at: now,
      })
      .eq('request_id', requestId)
      .eq('status', 'PENDING')
      .select('request_id, status, estimated_price, condition_score, completed_at')
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Manual estimate request not found or already completed' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, request: data });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error updating manual estimate request');
    return sanitizedServerError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request) as any;
    const requestId = boundedText(body?.requestId, 64, true) || '';
    const lineId = boundedText(body?.lineId, 128, true) || '';

    if (!requestId || !lineId) {
      return NextResponse.json(
        { error: 'requestId is required' },
        { status: 400 }
      );
    }
    const verifiedLineId = await requireLiffOwner(request, 'PAWNER', lineId);

    const supabase = supabaseAdmin();
    const query = supabase
      .from('manual_estimate_requests')
      .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
      .eq('request_id', requestId)
      .eq('line_id', verifiedLineId)
      .eq('status', 'PENDING');

    const { data, error } = await query.select('request_id, status, updated_at').single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Manual estimate request not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, request: data });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error cancelling manual estimate request');
    return sanitizedServerError();
  }
}
