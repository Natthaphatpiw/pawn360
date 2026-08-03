import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import { sanitizedServerError } from '@/lib/security/transaction-request';

const MAX_OFFER_AGE_HOURS = 4;
const MAX_OFFER_AGE_MS = MAX_OFFER_AGE_HOURS * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const identity = await requireLiffIdentity(request, 'INVESTOR');
    const supabase = supabaseAdmin();
    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('investor_id, kyc_status, is_active, is_blocked')
      .eq('line_id', identity.lineId)
      .single();
    if (
      investorError
      || !investor
      || investor.kyc_status !== 'VERIFIED'
      || investor.is_active === false
      || investor.is_blocked === true
    ) {
      return NextResponse.json(
        { error: 'กรุณายืนยันบัญชี Asset Funding ก่อนดูข้อเสนอ', code: 'INVESTOR_ACCESS_REQUIRED' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { data: contracts, error: contractsError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_status,
        funding_status,
        investor_id,
        loan_principal_amount,
        contract_duration_days,
        created_at,
        updated_at,
        items:item_id (
          item_id,
          brand,
          model,
          capacity,
          image_urls,
          item_condition,
          estimated_value
        ),
        drop_points:drop_point_id (
          drop_point_id,
          drop_point_name
        )
      `)
      .in('contract_status', ['PENDING', 'PENDING_SIGNATURE'])
      .eq('funding_status', 'PENDING')
      .is('investor_id', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (contractsError) {
      throw contractsError;
    }

    // ราคากลาง for each offer's item, so the list can show what secures the
    // loan. Fetched in one extra query rather than joined into the select
    // above: a missing column (code deployed ahead of the migration) then just
    // means the collateral line is hidden, instead of the whole offers list
    // failing to load.
    const marketPriceByItemId = new Map<string, number>();
    const itemIds = (contracts || [])
      .map((contract: any) => (Array.isArray(contract.items) ? contract.items[0] : contract.items)?.item_id)
      .filter((id: unknown): id is string => typeof id === 'string');
    if (itemIds.length > 0) {
      const { data: itemMarkets, error: itemMarketsError } = await supabase
        .from('items')
        .select('item_id, market_price')
        .in('item_id', itemIds);
      if (itemMarketsError) {
        console.warn('items.market_price unavailable for market offers; run 2026_08_03_add_items_market_price.sql');
      } else {
        for (const row of itemMarkets || []) {
          const value = Number((row as any).market_price);
          if (Number.isFinite(value) && value > 0) marketPriceByItemId.set(String((row as any).item_id), value);
        }
      }
    }

    const now = Date.now();

    // Calculate additional info for each contract and hide expired offers
    const offersWithInfo = contracts?.flatMap((contract) => {
      const postedAtValue = contract.updated_at || contract.created_at;
      const postedAt = new Date(postedAtValue);
      const postedAtMs = postedAt.getTime();

      if (!Number.isFinite(postedAtMs)) {
        return [];
      }

      const ageMs = now - postedAtMs;
      if (ageMs > MAX_OFFER_AGE_MS) {
        return [];
      }

      const hoursAgo = Math.floor(ageMs / (1000 * 60 * 60));

      const offerItem = Array.isArray(contract.items) ? contract.items[0] : contract.items;
      const offerItemId = offerItem?.item_id;

      return {
        ...contract,
        items: offerItem
          ? { ...offerItem, market_price: marketPriceByItemId.get(String(offerItemId)) ?? null }
          : offerItem,
        posted_at: postedAt.toISOString(),
        hours_ago: hoursAgo,
        expires_at: new Date(postedAtMs + MAX_OFFER_AGE_MS).toISOString(),
        time_display: hoursAgo < 1 ? 'เมื่อสักครู่' :
                      hoursAgo < 24 ? `${hoursAgo} ชั่วโมงที่แล้ว` :
                      `${Math.floor(hoursAgo / 24)} วันที่แล้ว`
      };
    }) || [];

    return NextResponse.json({
      success: true,
      offers: offersWithInfo
    }, { headers: { 'Cache-Control': 'private, no-store' } });

  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    console.error('[contract:market-offers] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return sanitizedServerError('ไม่สามารถโหลดข้อเสนอได้ชั่วคราว');
  }
}
