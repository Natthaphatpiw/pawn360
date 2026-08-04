import { NextRequest, NextResponse } from 'next/server';
import type { FlexMessage } from '@line/bot-sdk';
import { supabaseAdmin } from '@/lib/supabase/client';
import { lineRetryKeyFromMaterial, pushLineMessage } from '@/lib/line/push-text';
import { requirePinToken } from '@/lib/security/pin';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import {
  boundedText,
  readBoundedJsonObject,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';
import {
  getInvestorRateForTier,
  refreshInvestorTierAndTotals,
  resolveInvestorTier,
} from '@/lib/services/investor-tier';

const relationOne = <T,>(value: T | T[] | null | undefined): T | null => (
  Array.isArray(value) ? value[0] || null : value || null
);

export async function POST(request: NextRequest) {
  const releaseLocks: Array<() => Promise<void>> = [];
  try {
    const body = await readBoundedJsonObject(request, 8 * 1024);
    const action = boundedText(body.action, 16, true);
    const contractId = requireUuid(body.contractId);
    const pinToken = boundedText(body.pinToken, 256);
    if (action !== 'accept' && action !== 'decline') {
      return NextResponse.json(
        { error: 'ประเภทรายการไม่ถูกต้อง', code: 'ACTION_INVALID' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const identity = await requireLiffIdentity(request, 'INVESTOR');
    const supabase = supabaseAdmin();
    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('investor_id, kyc_status, investor_tier, total_active_principal')
      .eq('line_id', identity.lineId)
      .single();
    if (investorError || !investor) {
      return NextResponse.json(
        { error: 'ไม่พบบัญชี Asset Funding', code: 'INVESTOR_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (action === 'decline') {
      return NextResponse.json(
        { success: true, message: 'ปฏิเสธข้อเสนอแล้ว' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (investor.kyc_status !== 'VERIFIED') {
      return NextResponse.json({
        error: 'ต้องยืนยันตัวตน (eKYC) ก่อนจึงจะรับข้อเสนอได้',
        code: 'INVESTOR_KYC_REQUIRED',
        kycRequired: true,
        redirectTo: '/ekyc-invest',
      }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
    const checkedPin = await requirePinToken('INVESTOR', identity.lineId, pinToken || '');
    if (!checkedPin.ok) {
      return NextResponse.json(checkedPin.payload, {
        status: checkedPin.status,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    releaseLocks.push(await acquireFinancialLock(`investor-funding:${investor.investor_id}`, 120));
    releaseLocks.push(await acquireFinancialLock(`contract-funding:${contractId}`, 120));

    const { data: rawContract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        contract_status,
        funding_status,
        investor_id,
        loan_request_id,
        contract_end_date,
        contract_duration_days,
        loan_principal_amount,
        interest_amount,
        platform_fee_amount,
        total_amount,
        items:item_id (brand, model, image_urls),
        pawners:customer_id (line_id),
        drop_points:drop_point_id (google_map_url)
      `)
      .eq('contract_id', contractId)
      .single();
    if (contractError) {
      // A rejected query is not a missing contract. Reporting both as 404 is
      // what let a bad column name read as "ไม่พบสัญญา" to every investor
      // instead of surfacing as the schema error it was.
      console.error('[contract:investor-action] contract lookup failed', {
        code: (contractError as { code?: string })?.code || 'QUERY_FAILED',
        column: /column ([a-z_.]+) does not exist/i.exec(contractError.message || '')?.[1],
        details: /'([a-z_]+)' column/i.exec(contractError.message || '')?.[1],
      });
      return NextResponse.json(
        { error: 'ไม่สามารถโหลดข้อมูลสัญญาได้ กรุณาลองใหม่อีกครั้ง', code: 'CONTRACT_LOOKUP_FAILED' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (!rawContract) {
      return NextResponse.json(
        { error: 'ไม่พบสัญญา', code: 'CONTRACT_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const contract: any = rawContract;
    if (contract.investor_id === investor.investor_id) {
      return NextResponse.json({
        success: true,
        alreadyAccepted: true,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (
      contract.investor_id
      || contract.funding_status !== 'PENDING'
      || !['PENDING', 'PENDING_SIGNATURE'].includes(contract.contract_status)
    ) {
      return NextResponse.json(
        { error: 'ข้อเสนอนี้มีผู้รับแล้ว', code: 'CONTRACT_NOT_AVAILABLE' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const projectedTotal = Number(investor.total_active_principal || 0)
      + Number(contract.loan_principal_amount || 0);
    const investorRate = getInvestorRateForTier(resolveInvestorTier(projectedTotal));
    const { data: updatedContracts, error: updateError } = await supabase
      .from('contracts')
      .update({
        investor_id: investor.investor_id,
        contract_status: 'ACTIVE',
        funding_status: 'FUNDED',
        funded_at: new Date().toISOString(),
        investor_rate: investorRate,
      })
      .eq('contract_id', contractId)
      .is('investor_id', null)
      .in('contract_status', ['PENDING', 'PENDING_SIGNATURE'])
      .eq('funding_status', 'PENDING')
      .select('contract_id');
    if (updateError) throw updateError;
    if (!updatedContracts?.length) {
      return NextResponse.json(
        { error: 'ข้อเสนอนี้มีผู้รับแล้ว', code: 'CONTRACT_NOT_AVAILABLE' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (contract.loan_request_id) {
      const requestUpdate = await supabase
        .from('loan_requests')
        .update({ request_status: 'FUNDED' })
        .eq('request_id', contract.loan_request_id)
        .in('request_status', ['OFFER_ACCEPTED', 'MATCHING', 'PENDING']);
      if (requestUpdate.error) throw requestUpdate.error;
    }
    await refreshInvestorTierAndTotals(investor.investor_id).catch(() => {});

    const { data: loanRequest } = contract.loan_request_id
      ? await supabase
        .from('loan_requests')
        .select('delivery_method, delivery_fee')
        .eq('request_id', contract.loan_request_id)
        .maybeSingle()
      : { data: null };
    contract.items = relationOne<any>(contract.items);
    contract.pawners = relationOne<any>(contract.pawners);
    contract.drop_points = relationOne<any>(contract.drop_points);
    await pushLineMessage({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
      to: contract.pawners?.line_id,
      messages: createAcceptedCard(contract, loanRequest || null),
      retryKey: lineRetryKeyFromMaterial(`contract-funded:${contractId}`),
    }).catch(() => {});

    return NextResponse.json(
      { success: true, message: 'รับข้อเสนอเรียบร้อยแล้ว' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[contract:investor-action] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return sanitizedServerError('ไม่สามารถดำเนินรายการได้ชั่วคราว กรุณาตรวจสอบสถานะแล้วลองใหม่');
  } finally {
    for (const release of releaseLocks.reverse()) await release();
  }
}

function createAcceptedCard(contract: any, loanRequest: { delivery_method?: string | null; delivery_fee?: number | null } | null) {
  const dueDate = new Date(contract.contract_end_date);
  const dueDateString = dueDate.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const deliveryMethod = loanRequest?.delivery_method || 'WALK_IN';
  const deliveryFee = Number(loanRequest?.delivery_fee || 40);
  const isDelivery = deliveryMethod === 'DELIVERY';
  const deliveryLiffId = process.env.NEXT_PUBLIC_LIFF_ID_PAWNER_DELIVERY || '2008216710-690r5uXQ';
  const deliveryUrl = `https://liff.line.me/${deliveryLiffId}?contractId=${contract.contract_id}`;
  const itemName = [contract.items?.brand, contract.items?.model].filter(Boolean).join(' ').trim() || '-';

  const card = {
    type: 'flex',
    altText: 'มีนักลงทุนสนใจสินค้าของคุณ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'มีนักลงทุนสนใจ',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }, {
          type: 'text',
          text: 'มีผู้สนใจปล่อยสินเชื่อให้กับสินค้าของคุณ',
          size: 'sm',
          color: '#ffffff',
          align: 'center',
          margin: 'sm'
        }],
        backgroundColor: '#C0562F',
        paddingAll: 'lg'
      },
      hero: {
        type: 'image',
        url: contract.items?.image_urls?.[0] || 'https://via.placeholder.com/300x200?text=No+Image',
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'สินค้า:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: itemName, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'หมายเลขสัญญา:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: contract.contract_number, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'วันครบกำหนด:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: dueDateString, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ระยะเวลา:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.contract_duration_days} วัน`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              margin: 'lg',
              contents: [
                { type: 'text', text: 'วงเงินสินเชื่อ:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.loan_principal_amount.toLocaleString()} บาท`, color: '#C0562F', size: 'lg', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ดอกเบี้ย:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.interest_amount.toLocaleString()} บาท`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ค่าธรรมเนียม:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${Number(contract.platform_fee_amount || 0).toLocaleString()} บาท`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ยอดชำระคืน:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.total_amount.toLocaleString()} บาท`, color: '#9A3412', size: 'md', flex: 5, weight: 'bold' }
              ]
            },
            ...(isDelivery ? [{
              type: 'separator',
              margin: 'lg'
            }, {
              type: 'text',
              text: 'Drop Point จะทำการเรียกรถไปรับสินค้าของคุณภายใน 2 ชั่วโมง',
              size: 'sm',
              color: '#C0562F',
              wrap: true,
              margin: 'md'
            }, {
              type: 'text',
              text: 'กรุณากรอกที่อยู่รับสินค้าผ่านปุ่มด้านล่าง',
              size: 'xs',
              color: '#666666',
              wrap: true
            }] : [])
          ]
        }]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: isDelivery ? [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'กรอกที่อยู่รับสินค้า',
              uri: deliveryUrl
            },
            style: 'primary',
            color: '#C0562F'
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: `ค่าจัดส่ง ${deliveryFee.toLocaleString()} บาท (ชำระก่อนจัดส่ง)`,
                size: 'xs',
                color: '#666666',
                wrap: true
              }
            ]
          }
        ] : [{
          type: 'button',
          action: {
            type: 'postback',
            label: 'ยืนยันคำขอสินเชื่อ',
            data: `action=confirm_pawn&contractId=${contract.contract_id}`
          },
          style: 'primary',
          color: '#C0562F'
        }, {
          type: 'button',
          action: {
            type: 'uri',
            label: 'นำทางไป Drop Point',
            uri: contract.drop_points?.google_map_url || 'https://maps.google.com'
          },
          style: 'secondary'
        }]
      }
    }
  };

  return card as FlexMessage;
}
