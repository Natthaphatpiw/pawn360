import { after, NextRequest, NextResponse } from 'next/server';
import type { FlexMessage } from '@line/bot-sdk';
import { supabaseAdmin } from '@/lib/supabase/client';
import { uploadSignatureToBlob } from '@/lib/storage/blob';
import { lineRetryKeyFromMaterial, pushLineMessage } from '@/lib/line/push-text';
import { requirePinToken } from '@/lib/security/pin';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import {
  boundedText,
  readBoundedJsonObject,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';
import { getInvestorRateForTier, resolveInvestorTier } from '@/lib/services/investor-tier';

const relationOne = <T,>(value: T | T[] | null | undefined): T | null => (
  Array.isArray(value) ? value[0] || null : value || null
);

function validatedPngDataUrl(value: unknown): string {
  const dataUrl = boundedText(value, 1_500_000, true) || '';
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error('SIGNATURE_INVALID');
  const buffer = Buffer.from(match[1], 'base64');
  if (
    buffer.length < 8
    || buffer.length > 1_000_000
    || !buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    throw new Error('SIGNATURE_INVALID');
  }
  return dataUrl;
}

const contractNumberForRequest = (loanRequestId: string) => (
  `CTR-L-${loanRequestId.replace(/-/g, '').slice(0, 20).toUpperCase()}`
);

/**
 * Confirms to the pawner that their request is live on the investor market.
 *
 * Best-effort and deliberately isolated: a push failure must never affect a
 * contract that is already signed and recorded.
 */
async function notifyPawnerRequestLive(contract: any, pawnerLineId?: string | null) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !pawnerLineId) {
    console.warn('Pawner request-live notification skipped', {
      hasToken: Boolean(token),
      hasLineId: Boolean(pawnerLineId),
    });
    return;
  }

  const principal = Number(contract.loan_principal_amount) || 0;
  const text = [
    'ส่งคำขอสินเชื่อเรียบร้อยแล้ว ✅',
    '',
    `เลขที่สัญญา: ${contract.contract_number}`,
    `วงเงินที่ขอ: ${principal.toLocaleString()} บาท`,
    `ระยะเวลา: ${contract.contract_duration_days} วัน`,
    '',
    'ขณะนี้คำขอของคุณแสดงให้นักลงทุนเห็นแล้ว',
    'เมื่อมีนักลงทุนรับคำขอ ระบบจะแจ้งให้ทราบทาง LINE ทันที',
    'จากนั้นจึงนำสินค้าไปส่งที่จุดรับฝากที่เลือกไว้',
  ].join('\n');

  try {
    await pushLineMessage({
      channelAccessToken: token,
      to: pawnerLineId,
      messages: [{ type: 'text', text }],
      retryKey: lineRetryKeyFromMaterial(`pawn-request-live:${contract.contract_id}`),
    });
  } catch (error) {
    console.error('Pawner request-live notification failed', {
      code: (error as { code?: string })?.code || 'PUSH_FAILED',
    });
  }
}

async function notifyEligibleInvestors(contract: any, loanRequest: any) {
  const supabase = supabaseAdmin();
  const { data: investors, error } = await supabase
    .from('investors')
    .select('investor_id, line_id, total_active_principal')
    .eq('is_active', true)
    .eq('is_blocked', false)
    .eq('kyc_status', 'VERIFIED')
    .not('line_id', 'is', null)
    .neq('line_id', '')
    .like('line_id', 'U%')
    .limit(500);
  if (error || !investors?.length) return;

  // Keep fan-out bounded. Provider failures are retried safely when the same
  // deterministic LINE retry key is used by a later reconciliation job.
  const concurrency = 10;
  for (let offset = 0; offset < investors.length; offset += concurrency) {
    const batch = investors.slice(offset, offset + concurrency);
    await Promise.allSettled(batch.map((investor) => {
      const projectedTotal = Number(investor.total_active_principal || 0)
        + Number(loanRequest.requested_amount || 0);
      const investorRate = getInvestorRateForTier(resolveInvestorTier(projectedTotal));
      return pushLineMessage({
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST,
        to: investor.line_id,
        messages: createPawnOfferCard(contract, loanRequest, investorRate),
        retryKey: lineRetryKeyFromMaterial(
          `new-contract-offer:${contract.contract_id}:${investor.investor_id}`,
        ),
      });
    }));
  }
}

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request, 1_750_000);
    const loanRequestId = requireUuid(body.loanRequestId);
    const itemId = requireUuid(body.itemId);
    const accepted = body.accepted === true;
    const signature = validatedPngDataUrl(body.signature);
    const claimedLineId = boundedText(body.lineId, 128, true) || '';
    const pinToken = boundedText(body.pinToken, 256, true) || '';
    if (!accepted) {
      return NextResponse.json(
        { error: 'กรุณายอมรับเงื่อนไขสัญญา', code: 'TERMS_NOT_ACCEPTED' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const supabase = supabaseAdmin();
    // items.market_price only feeds the collateral line on the investor offer
    // card. PostgREST fails the whole query on an unknown column, and this
    // codebase deploys on push while migrations are applied by hand, so the
    // wide select is attempted first and the original one is used if the
    // column is not there yet. Signing a contract must never depend on a
    // display field.
    const selectLoanRequest = (itemColumns: string) => supabase
      .from('loan_requests')
      .select(`
        request_id,
        item_id,
        customer_id,
        drop_point_id,
        requested_amount,
        requested_duration_days,
        request_status,
        items:item_id (${itemColumns}),
        pawners:customer_id (customer_id, line_id)
      `)
      .eq('request_id', loanRequestId)
      .single();

    let { data: rawLoanRequest, error: loanRequestError } =
      await selectLoanRequest('item_id, image_urls, market_price, brand, model');
    if (loanRequestError && `${loanRequestError.message || ''}`.toLowerCase().includes('market_price')) {
      console.warn('items.market_price is missing; run 2026_08_03_add_items_market_price.sql. Offer card will omit the collateral value.');
      ({ data: rawLoanRequest, error: loanRequestError } = await selectLoanRequest('item_id, image_urls'));
    }
    if (loanRequestError || !rawLoanRequest) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอสินเชื่อ', code: 'LOAN_REQUEST_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const loanRequest: any = rawLoanRequest;
    const pawner = relationOne<any>(loanRequest.pawners);
    if (loanRequest.item_id !== itemId || !pawner?.line_id) {
      throw new LiffAuthError('CONTRACT_ACCESS_DENIED', 403);
    }
    const lineId = await requireLiffOwner(request, 'PAWNER', pawner.line_id);
    if (lineId !== claimedLineId) throw new LiffAuthError('LIFF_AUTH_SUBJECT_MISMATCH', 403);
    const pinCheck = await requirePinToken('PAWNER', lineId, pinToken);
    if (!pinCheck.ok) {
      return NextResponse.json(pinCheck.payload, {
        status: pinCheck.status,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    releaseLock = await acquireFinancialLock(`contract-create:${loanRequestId}`, 180);

    const { data: lockedLoanRequest, error: lockedLoanRequestError } = await supabase
      .from('loan_requests')
      .select(`
        request_id, item_id, customer_id, drop_point_id,
        requested_amount, requested_duration_days, request_status
      `)
      .eq('request_id', loanRequestId)
      .single();
    if (lockedLoanRequestError || !lockedLoanRequest) {
      return NextResponse.json(
        { error: 'ไม่พบคำขอสินเชื่อ', code: 'LOAN_REQUEST_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (
      lockedLoanRequest.item_id !== itemId
      || lockedLoanRequest.customer_id !== loanRequest.customer_id
    ) {
      throw new LiffAuthError('CONTRACT_ACCESS_DENIED', 403);
    }
    Object.assign(loanRequest, lockedLoanRequest);

    const existing = await supabase
      .from('contracts')
      .select('contract_id, contract_number')
      .eq('loan_request_id', loanRequestId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      const [itemRepair, requestRepair] = await Promise.all([
        supabase
          .from('items')
          .update({ item_status: 'IN_CONTRACT' })
          .eq('item_id', itemId),
        supabase
          .from('loan_requests')
          .update({ request_status: 'OFFER_ACCEPTED' })
          .eq('request_id', loanRequestId)
          .in('request_status', ['PENDING', 'MATCHING', 'OFFER_ACCEPTED']),
      ]);
      if (itemRepair.error || requestRepair.error) {
        throw itemRepair.error || requestRepair.error;
      }
      return NextResponse.json({
        success: true,
        alreadyCreated: true,
        contractId: existing.data.contract_id,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const requestedAmount = Number(loanRequest.requested_amount);
    const requestedDurationDays = Math.round(Number(loanRequest.requested_duration_days || 30));
    if (
      !Number.isFinite(requestedAmount)
      || requestedAmount <= 0
      || requestedAmount > 100_000_000
      || !Number.isFinite(requestedDurationDays)
      || requestedDurationDays < 1
      || requestedDurationDays > 3_650
    ) {
      return NextResponse.json(
        { error: 'ข้อมูลวงเงินหรือระยะเวลาสัญญาไม่ถูกต้อง', code: 'LOAN_TERMS_INVALID' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (!['PENDING', 'MATCHING', 'OFFER_ACCEPTED'].includes(loanRequest.request_status)) {
      return NextResponse.json(
        { error: 'คำขอนี้ไม่พร้อมสร้างสัญญา', code: 'LOAN_REQUEST_STATE_CONFLICT' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const contractNumber = contractNumberForRequest(loanRequestId);
    const signedContractUrl = await uploadSignatureToBlob(contractNumber, signature);
    const contractStartDate = new Date();
    contractStartDate.setUTCHours(0, 0, 0, 0);
    const contractEndDate = new Date(contractStartDate);
    contractEndDate.setUTCDate(contractEndDate.getUTCDate() + requestedDurationDays);
    const monthlyInterestRate = 0.015;
    const platformFeeRate = 0.015;
    const interestAmount = requestedAmount * monthlyInterestRate * (requestedDurationDays / 30);
    const platformFeeAmount = requestedAmount * platformFeeRate * (requestedDurationDays / 30);

    let { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        contract_number: contractNumber,
        customer_id: loanRequest.customer_id,
        investor_id: null,
        drop_point_id: loanRequest.drop_point_id,
        item_id: loanRequest.item_id,
        loan_request_id: loanRequest.request_id,
        contract_start_date: contractStartDate.toISOString(),
        contract_end_date: contractEndDate.toISOString(),
        contract_duration_days: requestedDurationDays,
        loan_principal_amount: requestedAmount,
        interest_rate: monthlyInterestRate,
        interest_amount: interestAmount,
        total_amount: requestedAmount + interestAmount + platformFeeAmount,
        platform_fee_rate: platformFeeRate,
        platform_fee_amount: platformFeeAmount,
        contract_status: 'PENDING_SIGNATURE',
        funding_status: 'PENDING',
        signed_contract_url: signedContractUrl,
      })
      .select('contract_id, contract_number, loan_principal_amount, contract_duration_days')
      .single();
    if (contractError?.code === '23505') {
      const recovered = await supabase
        .from('contracts')
        .select('contract_id, contract_number, loan_principal_amount, contract_duration_days')
        .eq('contract_number', contractNumber)
        .single();
      contract = recovered.data;
      contractError = recovered.error;
    }
    if (contractError || !contract) throw contractError || new Error('CONTRACT_CREATE_FAILED');

    const [itemUpdate, requestUpdate] = await Promise.all([
      supabase
        .from('items')
        .update({ item_status: 'IN_CONTRACT' })
        .eq('item_id', itemId),
      supabase
        .from('loan_requests')
        .update({ request_status: 'OFFER_ACCEPTED' })
        .eq('request_id', loanRequestId)
        .in('request_status', ['PENDING', 'MATCHING', 'OFFER_ACCEPTED']),
    ]);
    if (itemUpdate.error || requestUpdate.error) throw itemUpdate.error || requestUpdate.error;

    const notificationLoanRequest = {
      ...loanRequest,
      items: relationOne<any>(loanRequest.items),
    };
    after(() => notifyEligibleInvestors(contract, notificationLoanRequest));
    // The pawner heard nothing at all once they signed: the only push went to
    // investors, and the request-status screen lists contract actions rather
    // than new requests, so a submitted request looked to them like it had
    // vanished. Tell them it is live and what happens next.
    after(() => notifyPawnerRequestLive(contract, pawner?.line_id));

    return NextResponse.json({
      success: true,
      contractId: contract.contract_id,
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[contract:create] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return sanitizedServerError('ไม่สามารถสร้างสัญญาได้ชั่วคราว กรุณาตรวจสอบสถานะแล้วลองใหม่');
  } finally {
    await releaseLock?.();
  }
}

function createPawnOfferCard(contract: any, loanRequest: any, investorRate: number): FlexMessage {
  const monthlyInvestorRate = Number(investorRate || 0.015);
  const principal = Number(contract.loan_principal_amount) || 0;
  const investorInterestAmount = principal
    * monthlyInvestorRate
    * (contract.contract_duration_days / 30);

  // The collateral line: what the item is worth second-hand, so the investor
  // can see the loan is secured by something worth materially more than the
  // money they are putting in.
  //
  // Suppressed entirely when unknown - items predating the market_price column,
  // and manual estimates, which have no ราคากลาง by construction. It must never
  // fall back to estimated_value: that field is the loan CEILING, so showing it
  // here would imply ~100% LTV against a reality of 40-60%.
  const marketPrice = Number(loanRequest.items?.market_price) || 0;
  const hasCollateralValue = marketPrice > 0 && principal > 0;
  // Computed from the contract's actual principal, never assumed to be the 60%
  // LTV factor - the principal is negotiated and the pawner may request less.
  const ltvPercent = hasCollateralValue ? Math.round((principal / marketPrice) * 100) : 0;

  const collateralLines: any[] = hasCollateralValue
    ? [
      { type: 'separator', margin: 'md' },
      {
        type: 'text',
        text: `ราคากลางมือสอง (ประมาณการ): ${Math.round(marketPrice).toLocaleString()} บาท`,
        wrap: true,
        size: 'sm',
        margin: 'md',
        color: '#1E3A8A',
        weight: 'bold',
      },
      {
        type: 'text',
        text: `วงเงินคิดเป็น ${ltvPercent}% ของราคากลาง`,
        wrap: true,
        size: 'xs',
        color: '#666666',
      },
      {
        type: 'text',
        // Deliberately explicit: this is derived from advertised second-hand
        // listings, not from prices anything actually sold for, and the
        // platform holds no realized-resale data to validate it against.
        text: 'ประมาณการจากราคาประกาศขายมือสองในตลาด ไม่ใช่ราคาขายจริงที่รับประกันได้',
        wrap: true,
        size: 'xxs',
        color: '#999999',
        margin: 'sm',
      },
    ]
    : [];

  return {
    type: 'flex',
    altText: 'ข้อเสนอสินเชื่อ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'ข้อเสนอสินเชื่อ',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
        }],
        backgroundColor: '#1E3A8A',
        paddingAll: 'lg',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'image',
          url: loanRequest.items?.image_urls?.[0] || 'https://placehold.co/300x300/png',
          size: 'full',
          aspectRatio: '1:1',
          aspectMode: 'cover',
        }, {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'sm',
          contents: [
            { type: 'text', text: `วงเงินสินเชื่อ: ${principal.toLocaleString()} บาท`, wrap: true, weight: 'bold', color: '#1E3A8A' },
            { type: 'text', text: `ระยะเวลา: ${contract.contract_duration_days} วัน`, wrap: true, size: 'sm', color: '#666666' },
            { type: 'text', text: `ผลตอบแทนโดยประมาณ: ${investorInterestAmount.toLocaleString()} บาท`, wrap: true, size: 'sm', color: '#666666' },
            ...collateralLines,
          ],
        }],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button',
          action: {
            type: 'uri',
            label: 'ดูข้อเสนอ',
            uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_INVEST_OFFER_DETAIL || 'CREATE_NEW_LIFF_APP'}?contractId=${contract.contract_id}`,
          },
          style: 'primary',
          color: '#1E3A8A',
        }],
      },
    },
  };
}
