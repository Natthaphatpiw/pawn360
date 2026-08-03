import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { refreshBlobUrls } from '@/lib/storage/blob';
import { splitItemNotesAndPasscode } from '@/lib/utils/item-private-notes';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import { requireUuid, sanitizedServerError, transactionRequestErrorResponse } from '@/lib/security/transaction-request';

const MAX_OFFER_AGE_MS = 4 * 60 * 60 * 1000;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId);
    const { searchParams } = new URL(request.url);
    const viewer = searchParams.get('viewer') === 'investor' ? 'investor' : 'pawner';
    const includeBank = searchParams.get('includeBank') === 'true';
    const identity = await requireLiffIdentity(request, viewer === 'investor' ? 'INVESTOR' : 'PAWNER');

    const supabase = supabaseAdmin();

    let authenticatedInvestorId: string | null = null;
    if (viewer === 'investor') {
      const { data: investor, error: investorError } = await supabase
        .from('investors')
        .select('investor_id, kyc_status')
        .eq('line_id', identity.lineId)
        .single();

      if (investorError || !investor) {
        return NextResponse.json(
          { error: 'ไม่พบข้อมูล Asset Funding', code: 'INVESTOR_NOT_FOUND' },
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
      authenticatedInvestorId = investor.investor_id;
    }

    const { data: contract, error } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        investor_id,
        contract_start_date,
        contract_end_date,
        contract_duration_days,
        loan_principal_amount,
        current_principal_amount,
        original_principal_amount,
        interest_rate,
        interest_amount,
        total_amount,
        platform_fee_rate,
        platform_fee_amount,
        investor_rate,
        contract_status,
        funding_status,
        payment_status,
        payment_slip_url,
        payment_confirmed_at,
        item_delivery_status,
        contract_file_url,
        signed_contract_url,
        created_at,
        updated_at,
        items:item_id (
          item_id, item_type, brand, model, capacity, serial_number,
          estimated_value, item_condition, accessories, defects, notes, image_urls
        ),
        pawners:customer_id (
          customer_id, line_id, firstname, lastname,
          bank_name, bank_account_no, bank_account_name, promptpay_number
        ),
        investors:investor_id (investor_id, line_id),
        drop_points:drop_point_id (
          drop_point_id, drop_point_name, drop_point_code, phone_number,
          addr_house_no, addr_street, addr_sub_district, addr_district,
          addr_province, addr_postcode, google_map_url, map_embed, latitude, longitude
        )
      `)
      .eq('contract_id', id)
      .single();

    if (error || !contract) {
      return NextResponse.json(
        { error: 'ไม่พบสัญญา', code: 'CONTRACT_NOT_FOUND' },
        { status: 404 }
      );
    }

    const relationOne = <T,>(value: T | T[] | null | undefined): T | null => (
      Array.isArray(value) ? value[0] || null : value || null
    );
    const pawner = relationOne<any>(contract.pawners);
    const contractInvestor = relationOne<any>(contract.investors);

    // ราคากลาง for the investor's collateral view. Fetched separately rather
    // than added to the select above so that a missing column - code deployed
    // ahead of the migration - degrades to "not shown" instead of failing the
    // whole contract lookup for both pawner and investor.
    const contractItem = relationOne<any>(contract.items);
    if (contractItem?.item_id) {
      const { data: itemMarket } = await supabase
        .from('items')
        .select('market_price')
        .eq('item_id', contractItem.item_id)
        .maybeSingle();
      contractItem.market_price = itemMarket?.market_price ?? null;
    }

    if (viewer === 'pawner' && pawner?.line_id !== identity.lineId) {
      throw new LiffAuthError('CONTRACT_ACCESS_DENIED', 403);
    }
    if (
      viewer === 'investor'
      && contract.investor_id
      && (contract.investor_id !== authenticatedInvestorId || contractInvestor?.line_id !== identity.lineId)
    ) {
      throw new LiffAuthError('CONTRACT_ACCESS_DENIED', 403);
    }
    if (viewer === 'investor' && includeBank && contract.investor_id !== authenticatedInvestorId) {
      throw new LiffAuthError('CONTRACT_ACCESS_DENIED', 403);
    }

    const postedAtValue = contract.updated_at || contract.created_at;
    const postedAt = postedAtValue ? new Date(postedAtValue) : null;
    const postedAtMs = postedAt?.getTime();
    if (
      viewer === 'investor'
      && !contract.investor_id
      && (
        contract.funding_status !== 'PENDING'
        || !['PENDING', 'PENDING_SIGNATURE'].includes(contract.contract_status)
        || !Number.isFinite(postedAtMs as number)
        || Date.now() - (postedAtMs as number) > MAX_OFFER_AGE_MS
      )
    ) {
      // Do not disclose expired/cancelled/unassigned historical contracts to
      // arbitrary registered investors who happen to know a UUID.
      return NextResponse.json(
        { error: 'ไม่พบข้อเสนอ', code: 'OFFER_NOT_AVAILABLE' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const offerMetadata = postedAt && Number.isFinite(postedAtMs as number)
      ? {
          posted_at: postedAt.toISOString(),
          expires_at: new Date((postedAtMs as number) + MAX_OFFER_AGE_MS).toISOString(),
          hours_ago: Math.floor((Date.now() - (postedAtMs as number)) / (1000 * 60 * 60)),
        }
      : {};

    let items = contract.items as any;
    if (Array.isArray(items)) {
      items = await Promise.all(
        items.map(async (item) => {
          const notesPayload = splitItemNotesAndPasscode(item?.notes);
          return {
            ...item,
            notes: notesPayload.publicNotes,
            image_urls: await refreshBlobUrls(item?.image_urls),
          };
        })
      );
    } else if (items) {
      const notesPayload = splitItemNotesAndPasscode(items?.notes);
      items = {
        ...items,
        notes: notesPayload.publicNotes,
        image_urls: await refreshBlobUrls(items?.image_urls),
      };
    }

    const pawnerPayload = viewer === 'pawner'
      ? {
          firstname: pawner?.firstname ?? null,
          lastname: pawner?.lastname ?? null,
          bank_name: pawner?.bank_name ?? null,
          bank_account_no: pawner?.bank_account_no ?? null,
          bank_account_name: pawner?.bank_account_name ?? null,
          promptpay_number: pawner?.promptpay_number ?? null,
        }
      : includeBank
        ? {
            bank_name: pawner?.bank_name ?? null,
            bank_account_no: pawner?.bank_account_no ?? null,
            bank_account_name: pawner?.bank_account_name ?? null,
            promptpay_number: pawner?.promptpay_number ?? null,
          }
        : undefined;
    const safeContract = { ...contract } as Record<string, unknown>;
    delete safeContract.pawners;
    delete safeContract.investors;
    if (viewer === 'investor' && !contract.investor_id) {
      delete safeContract.payment_slip_url;
      delete safeContract.payment_confirmed_at;
      delete safeContract.contract_file_url;
      delete safeContract.signed_contract_url;
    }

    return NextResponse.json({
      success: true,
      contract: {
        ...safeContract,
        ...offerMetadata,
        items,
        ...(pawnerPayload ? { pawners: pawnerPayload } : {}),
      }
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    console.error('[contracts:detail-summary] failed');
    return sanitizedServerError('ไม่สามารถโหลดข้อมูลสัญญาได้ กรุณาลองใหม่');
  }
}
