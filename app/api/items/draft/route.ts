import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { refreshBlobUrls } from '@/lib/storage/blob';
import { buildItemNotesWithPasscode, splitItemNotesAndPasscode } from '@/lib/utils/item-private-notes';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import {
  boundedText,
  finiteNumber,
  readBoundedJsonObject,
  requireOwnedBlobUrl,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

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
    const claimedLineId = searchParams.get('lineId') || '';
    const rawItemId = boundedText(searchParams.get('itemId'), 64);
    const itemId = rawItemId ? requireUuid(rawItemId) : null;

    if (!claimedLineId) {
      return NextResponse.json(
        { error: 'LINE ID is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const lineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);

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

      const notesPayload = splitItemNotesAndPasscode(item?.notes);
      const refreshedItem = {
        ...item,
        notes: notesPayload.publicNotes,
        device_passcode: notesPayload.devicePasscode,
        image_urls: await refreshBlobUrls(item?.image_urls),
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
      (items || []).map(async (draft) => {
        const notesPayload = splitItemNotesAndPasscode(draft?.notes);
        return {
          ...draft,
          notes: notesPayload.publicNotes,
          device_passcode: notesPayload.devicePasscode,
          image_urls: await refreshBlobUrls(draft?.image_urls),
        };
      })
    );

    return NextResponse.json(
      {
        success: true,
        items: refreshedItems,
      },
      { headers: NO_STORE_HEADERS }
    );

  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error fetching draft items');
    return sanitizedServerError();
  }
}

// POST - Save a draft item
export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request) as any;
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
      devicePasscode,
      imageUrls,
      conditionResult,
      estimateResult,
      estimateAttestation,
      estimateJobId,
      conditionChecklist,
      // Laptop specific
      cpu,
      ram,
      storage,
      gpu,
      // Camera specific
      lenses
    } = body;

    const claimedLineId = boundedText(lineId, 128, true) || '';
    const verifiedLineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);

    if (!verifiedLineId) {
      return NextResponse.json(
        { error: 'LINE ID is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const safeItemType = boundedText(itemType, 80, true) || '';
    const safeBrand = boundedText(brand, 120, true) || '';
    const safeModel = boundedText(model, 180, true) || '';
    if (!safeItemType || !safeBrand || !safeModel) {
      return NextResponse.json(
        { error: 'Item type, brand, and model are required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const supabase = supabaseAdmin();

    if (!Array.isArray(imageUrls) || imageUrls.length === 0 || imageUrls.length > 4) {
      return NextResponse.json(
        { error: 'กรุณาอัปโหลดรูปภาพ 1-4 รูป' },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    const safeImageUrls = imageUrls.map((url: unknown) => requireOwnedBlobUrl(url, ['pawn-items/']));
    if (Array.isArray(lenses) && lenses.length > 10) {
      return NextResponse.json(
        { error: 'ระบุเลนส์ได้สูงสุด 10 รายการ' },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    // Check if user is registered (optional - draft can be saved without registration)
    const { data: pawner } = await supabase
      .from('pawners')
      .select('customer_id')
      .eq('line_id', verifiedLineId)
      .single();

    const totalScoreCandidate =
      typeof conditionResult?.totalScore === 'number'
        ? conditionResult.totalScore
        : typeof conditionResult?.score === 'number'
          ? Math.round(conditionResult.score * 100)
          : null;
    const totalScore = finiteNumber(totalScoreCandidate, { min: 0, max: 100 });

    const aiScoreCandidate =
      typeof conditionResult?.score === 'number'
        ? conditionResult.score
        : typeof conditionResult?.totalScore === 'number'
          ? conditionResult.totalScore / 100
          : null;
    const aiScore = finiteNumber(aiScoreCandidate, { min: 0, max: 1 });

    const estimatedValueCandidate =
      typeof estimateResult?.estimatedValue === 'number'
        ? estimateResult.estimatedValue
        : typeof estimateResult?.estimatedPrice === 'number'
          ? estimateResult.estimatedPrice
          : 0;
    const estimatedValue = finiteNumber(estimatedValueCandidate, {
      min: 0,
      max: 100_000_000,
    }) || 0;

    const aiConfidence = finiteNumber(
      typeof estimateResult?.confidence === 'number' ? estimateResult.confidence : null,
      { min: 0, max: 1 },
    );

    // Insert draft item
    const { data: item, error } = await supabase
      .from('items')
      .insert([{
        customer_id: pawner?.customer_id || null,
        line_id: verifiedLineId,
        item_type: safeItemType,
        brand: safeBrand,
        model: safeModel,
        capacity: boundedText(capacity, 120),
        color: boundedText(color, 120),
        serial_number: boundedText(serialNo, 180),
        screen_size: boundedText(screenSize, 80),
        watch_size: boundedText(watchSize, 80),
        watch_connectivity: boundedText(watchConnectivity, 80),
        accessories: boundedText(accessories, 2_000),
        defects: boundedText(defects, 2_000),
        notes: buildItemNotesWithPasscode(
          boundedText(notes, 2_000),
          boundedText(devicePasscode, 128),
        ),
        image_urls: safeImageUrls,
        item_condition: totalScore,
        ai_condition_score: aiScore,
        ai_condition_reason: boundedText(conditionResult?.reason, 2_000),
        condition_checklist: conditionChecklist || null,
        estimated_value: estimatedValue,
        ai_confidence: aiConfidence,
        estimate_attestation: boundedText(estimateAttestation, 4_096),
        estimate_job_id: boundedText(estimateJobId, 128),
        item_status: 'DRAFT',
        // Laptop specific
        cpu: boundedText(cpu, 180),
        ram: boundedText(ram, 120),
        storage: boundedText(storage, 120),
        gpu: boundedText(gpu, 180),
      }])
      .select('item_id, item_status, estimate_attestation, estimate_job_id, created_at')
      .single();

    if (error) {
      throw error;
    }

    // If there are camera lenses, insert them
    if (Array.isArray(lenses) && lenses.length > 0 && item) {
      const lensRecords = lenses
        .map((lens: unknown) => boundedText(lens, 180))
        .filter((lens: string | null): lens is string => Boolean(lens))
        .map((lens: string) => ({
          item_id: item.item_id,
          lens_model: lens
        }));

      if (lensRecords.length > 0) {
        const { error: lensError } = await supabase.from('item_lenses').insert(lensRecords);
        if (lensError) {
          await supabase
            .from('items')
            .delete()
            .eq('item_id', item.item_id)
            .eq('line_id', verifiedLineId)
            .eq('item_status', 'DRAFT');
          throw lensError;
        }
      }
    }

    return NextResponse.json(
      { success: true, item },
      { headers: NO_STORE_HEADERS }
    );

  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    // Supabase rejections are plain objects, not Errors, so the previous
    // bare message left a 500 with nothing to diagnose it by. Log the
    // Postgres code and constraint - both are fixed identifiers, never user
    // data - so a constraint violation names itself.
    const supabaseError = error as { code?: string; details?: string; hint?: string; message?: string };
    console.error('Error saving draft item', {
      code: supabaseError?.code || (error as { name?: string })?.name || 'UNKNOWN',
      constraint: /constraint "([^"]+)"/.exec(supabaseError?.message || '')?.[1],
      column: /column "([^"]+)"/.exec(supabaseError?.message || '')?.[1],
    });
    return sanitizedServerError();
  }
}

// DELETE - Delete a draft item
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawItemId = boundedText(searchParams.get('itemId'), 64);
    const itemId = rawItemId ? requireUuid(rawItemId) : null;
    const claimedLineId = searchParams.get('lineId') || '';

    if (!itemId || !claimedLineId) {
      return NextResponse.json(
        { error: 'Item ID and LINE ID are required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const lineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);

    const supabase = supabaseAdmin();

    // Only allow deleting draft items owned by this LINE user
    const { data, error } = await supabase
      .from('items')
      .delete()
      .eq('item_id', itemId)
      .eq('line_id', lineId)
      .eq('item_status', 'DRAFT')
      .select('item_id')
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return NextResponse.json(
        { error: 'ไม่พบรายการแบบร่าง' },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { success: true, message: 'Draft item deleted' },
      { headers: NO_STORE_HEADERS }
    );

  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error deleting draft item');
    return sanitizedServerError();
  }
}
