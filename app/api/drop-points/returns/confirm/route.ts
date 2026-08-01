import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client } from '@line/bot-sdk';
import { requirePinToken } from '@/lib/security/pin';
import {
  getInvestorRateForContract,
  refreshInvestorTierAndTotals,
} from '@/lib/services/investor-tier';
import { requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  acquireTransactionLock,
  transactionLockErrorResponse,
} from '@/lib/security/transaction-lock';
import {
  boundedText,
  fingerprintOwnedBlob,
  readBoundedJsonObject,
  requireOwnedBlobUrl,
  requireUuid,
  sanitizedServerError,
  TransactionRequestError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';
import {
  ActorRateLimitError,
  enforceActorRateLimit,
} from '@/lib/security/actor-rate-limit';

const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
});

const dropPointLineClient = process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT
  ? new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT,
      channelSecret: process.env.LINE_CHANNEL_SECRET_DROPPOINT || '',
    })
  : null;

const ALLOWED_STATUSES = ['AMOUNT_VERIFIED', 'PREPARING_ITEM', 'IN_TRANSIT'];
const BAG_NUMBER_REGEX = /^[A-Z0-9-]{4,32}$/;

function sanitizedPinPayload(payload: Record<string, unknown>) {
  return {
    error: typeof payload.error === 'string' ? payload.error : 'กรุณายืนยัน PIN ใหม่',
    pinRequired: Boolean(payload.pinRequired),
    pinSetupRequired: Boolean(payload.pinSetupRequired),
    pinLocked: Boolean(payload.pinLocked),
    lockRemainingSeconds: Number(payload.lockRemainingSeconds || 0),
  };
}

function validDatabaseNumber(value: unknown, options: { min: number; max: number }): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < options.min || parsed > options.max) {
    throw new Error('invalid database amount');
  }
  return parsed;
}

function validDatabaseDate(value: unknown): Date {
  if (typeof value !== 'string') throw new Error('invalid database date');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('invalid database date');
  return parsed;
}

export async function POST(request: NextRequest) {
  let releaseRedemptionLock: (() => Promise<void>) | null = null;
  let releaseContractLock: (() => Promise<void>) | null = null;
  let releaseBagLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request);
    const redemptionId = requireUuid(body.redemptionId);
    const pinToken = boundedText(body.pinToken, 256, true) || '';
    const resolvedBagNumber = (boundedText(body.bagNumber, 32, true) || '').toUpperCase();
    if (!BAG_NUMBER_REGEX.test(resolvedBagNumber)) {
      throw new TransactionRequestError('INVALID_FIELD', 400, 'หมายเลขถุงไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
    }

    if (!Array.isArray(body.returnPhotos) || body.returnPhotos.length !== 2) {
      throw new TransactionRequestError('INVALID_FIELD', 400, 'กรุณาถ่ายรูปสินค้าคืนให้ครบ 2 รูป');
    }
    const returnPhotos = body.returnPhotos.map((url) => requireOwnedBlobUrl(url, ['drop-point-returns/']));
    if (new Set(returnPhotos).size !== 2) {
      throw new TransactionRequestError('INVALID_FIELD', 400, 'รูปสินค้าคืนต้องเป็นคนละรูปกัน');
    }

    const identity = await requireLiffIdentity(request, 'DROP_POINT');
    const lineId = identity.lineId;
    await enforceActorRateLimit({
      scope: 'drop-point-return-confirm',
      actor: lineId,
      limit: 12,
      windowSeconds: 5 * 60,
    });
    const pinCheck = await requirePinToken('DROP_POINT', lineId, pinToken);
    if (!pinCheck.ok) {
      return NextResponse.json(sanitizedPinPayload(pinCheck.payload), {
        status: pinCheck.status,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    releaseRedemptionLock = await acquireTransactionLock('drop-point-return', redemptionId, 120);

    const supabase = supabaseAdmin();

    const { data: dropPoint, error: dropPointError } = await supabase
      .from('drop_points')
      .select('drop_point_id, drop_point_name')
      .eq('line_id', identity.lineId)
      .single();

    if (dropPointError || !dropPoint) {
      return NextResponse.json(
        { error: 'Drop point not found' },
        { status: 404 }
      );
    }

    const { data: redemption, error: redemptionError } = await supabase
      .from('redemption_requests')
      .select(`
        redemption_id,
        contract_id,
        request_status,
        item_return_confirmed_at,
        total_amount,
        delivery_method,
        contract:contract_id (
          contract_id,
          contract_number,
          contract_status,
          redemption_status,
          item_delivery_status,
          completed_at,
          contract_start_date,
          contract_end_date,
          contract_duration_days,
          loan_principal_amount,
          investor_rate,
          investor_id,
          drop_point_id,
          platform_fee_amount,
          items:item_id (
            item_id,
            brand,
            model
          ),
          pawners:customer_id (
            firstname,
            lastname,
            line_id,
            phone_number
          ),
          investors:investor_id (
            firstname,
            lastname,
            line_id,
            investor_tier
          )
        )
      `)
      .eq('redemption_id', redemptionId)
      .single();

    if (redemptionError || !redemption) {
      return NextResponse.json(
        { error: 'Redemption not found' },
        { status: 404 }
      );
    }

    const contract = Array.isArray(redemption.contract) ? redemption.contract[0] : redemption.contract;
    const item = Array.isArray(contract?.items) ? contract.items[0] : contract?.items;
    const pawner = Array.isArray(contract?.pawners) ? contract.pawners[0] : contract?.pawners;
    const investor = Array.isArray(contract?.investors) ? contract.investors[0] : contract?.investors;
    const normalizedRedemption = {
      ...redemption,
      contract: { ...contract, items: item, pawners: pawner, investors: investor },
    };

    if (!contract?.contract_id || contract.drop_point_id !== dropPoint.drop_point_id) {
      return NextResponse.json(
        { error: 'Unauthorized drop point' },
        { status: 403 }
      );
    }

    if (redemption.request_status === 'COMPLETED' || redemption.item_return_confirmed_at) {
      return NextResponse.json(
        { success: true, alreadyCompleted: true },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (!ALLOWED_STATUSES.includes(redemption.request_status)) {
      return NextResponse.json(
        { error: 'Redemption is not in a returnable state' },
        { status: 409 }
      );
    }

    if (!['ACTIVE', 'CONFIRMED', 'COMPLETED'].includes(contract.contract_status)) {
      return NextResponse.json(
        { error: 'สถานะสัญญาไม่สามารถยืนยันการส่งคืนได้ กรุณาติดต่อฝ่ายสนับสนุน' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    releaseContractLock = await acquireTransactionLock('redemption-contract', contract.contract_id, 120);
    releaseBagLock = await acquireTransactionLock('drop-point-return-bag', resolvedBagNumber, 120);
    await Promise.all(returnPhotos.map((photo) => fingerprintOwnedBlob(photo)));

    const { data: existingBagAssignment, error: existingBagAssignmentError } = await supabase
      .from('drop_point_bag_assignments')
      .select('bag_number')
      .eq('contract_id', contract.contract_id)
      .maybeSingle();

    if (existingBagAssignmentError) {
      return NextResponse.json(
        { error: 'ไม่สามารถตรวจสอบหมายเลขถุงได้ กรุณาลองใหม่' },
        { status: 500 }
      );
    }

    const { data: storageBoxAssignment, error: storageBoxAssignmentError } = await supabase
      .from('drop_point_storage_boxes')
      .select('box_code')
      .eq('contract_id', contract.contract_id)
      .order('last_updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (storageBoxAssignmentError) {
      return NextResponse.json(
        { error: 'ไม่สามารถตรวจสอบกล่องเก็บสินค้าได้ กรุณาลองใหม่' },
        { status: storageBoxAssignmentError.code === 'PGRST205' ? 503 : 500 }
      );
    }

    const expectedBagNumber = existingBagAssignment?.bag_number || storageBoxAssignment?.box_code || null;

    if (
      expectedBagNumber &&
      expectedBagNumber !== resolvedBagNumber
    ) {
      return NextResponse.json(
        { error: `หมายเลขถุงไม่ตรงกับข้อมูลเดิม (${expectedBagNumber})` },
        { status: 400 }
      );
    }

    const { data: duplicateBagAssignment, error: duplicateBagAssignmentError } = await supabase
      .from('drop_point_bag_assignments')
      .select('contract_id, bag_number')
      .eq('bag_number', resolvedBagNumber)
      .maybeSingle();

    if (duplicateBagAssignmentError) {
      return NextResponse.json(
        { error: 'ไม่สามารถตรวจสอบหมายเลขถุงได้ กรุณาลองใหม่' },
        { status: 500 }
      );
    }

    if (
      duplicateBagAssignment?.contract_id &&
      duplicateBagAssignment.contract_id !== contract.contract_id
    ) {
      return NextResponse.json(
        { error: `หมายเลขถุง ${resolvedBagNumber} ถูกใช้กับรายการอื่นแล้ว` },
        { status: 400 }
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const msPerDay = 1000 * 60 * 60 * 24;
    const startDate = validDatabaseDate(contract.contract_start_date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = validDatabaseDate(contract.contract_end_date);
    endDate.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const storedDuration = validDatabaseNumber(contract.contract_duration_days, { min: 0, max: 3_650 });
    const rawDaysInContract = storedDuration
      || Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay);
    if (rawDaysInContract <= 0) throw new Error('invalid contract duration');
    const daysInContract = Math.max(1, rawDaysInContract);
    const rawDaysElapsed = Math.floor((today.getTime() - startDate.getTime()) / msPerDay) + 1;
    const daysElapsed = Math.min(daysInContract, Math.max(1, rawDaysElapsed));

    const investorRate = validDatabaseNumber(
      getInvestorRateForContract({
        investor_rate: contract.investor_rate === null ? null : Number(contract.investor_rate),
        investor_tier: investor?.investor_tier,
      }),
      { min: 0, max: 1 },
    );
    const principal = validDatabaseNumber(contract.loan_principal_amount, { min: 0.01, max: 100_000_000 });
    const interestEarned = Math.round(principal * investorRate * (daysElapsed / 30) * 100) / 100;
    const platformFee = contract.platform_fee_amount === null || contract.platform_fee_amount === undefined
      ? 0
      : validDatabaseNumber(contract.platform_fee_amount, { min: 0, max: 100_000_000 });
    const netProfit = Math.max(0, interestEarned - platformFee);

    let bagAssignmentError: { code?: string } | null = null;
    if (existingBagAssignment) {
      const { data: updatedBag, error } = await supabase
        .from('drop_point_bag_assignments')
        .update({
          drop_point_id: dropPoint.drop_point_id,
          item_id: item?.item_id,
          assigned_by_line_id: identity.lineId,
          assigned_at: nowIso,
        })
        .eq('contract_id', contract.contract_id)
        .eq('bag_number', resolvedBagNumber)
        .select('assignment_id')
        .maybeSingle();
      bagAssignmentError = error;
      if (!error && !updatedBag) bagAssignmentError = { code: 'BAG_ASSIGNMENT_CHANGED' };
    } else {
      const { error } = await supabase
        .from('drop_point_bag_assignments')
        .insert({
        drop_point_id: dropPoint.drop_point_id,
        contract_id: contract.contract_id,
        item_id: item?.item_id,
        bag_number: resolvedBagNumber,
        assigned_by_line_id: identity.lineId,
        assigned_at: nowIso,
        });
      bagAssignmentError = error;
    }

    if (bagAssignmentError) {
      return NextResponse.json(
        {
          error: bagAssignmentError.code === '23505'
            ? 'หมายเลขถุงนี้ถูกใช้กับรายการอื่นแล้ว'
            : 'ไม่สามารถบันทึกหมายเลขถุงได้ กรุณาลองใหม่',
        },
        { status: bagAssignmentError.code === '23505' ? 409 : 500 }
      );
    }

    if (item?.item_id) {
      const { data: updatedItem, error: itemUpdateError } = await supabase
        .from('items')
        .update({ item_status: 'RETURNED', updated_at: nowIso })
        .eq('item_id', item.item_id)
        .select('item_id')
        .maybeSingle();
      if (itemUpdateError || !updatedItem) {
        return NextResponse.json(
          { error: 'ไม่สามารถอัปเดตสถานะสินค้าได้ กรุณาลองใหม่' },
          { status: 500, headers: { 'Cache-Control': 'no-store' } },
        );
      }
    }

    if (contract.contract_status !== 'COMPLETED') {
      const { data: updatedContract, error: contractUpdateError } = await supabase
        .from('contracts')
        .update({
          contract_status: 'COMPLETED',
          redemption_status: 'COMPLETED',
          item_delivery_status: 'RETURNED',
          completed_at: nowIso,
          updated_at: nowIso,
        })
        .eq('contract_id', contract.contract_id)
        .in('contract_status', ['ACTIVE', 'CONFIRMED'])
        .select('contract_id')
        .maybeSingle();
      if (contractUpdateError || !updatedContract) {
        return NextResponse.json(
          { error: 'สถานะสัญญาเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลใหม่' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        );
      }
    }

    if (storageBoxAssignment?.box_code) {
      const { data: releasedBox, error: releaseBoxError } = await supabase
        .from('drop_point_storage_boxes')
        .update({
          box_status: 'AVAILABLE',
          contract_id: null,
          item_id: null,
          customer_id: null,
          contract_number: null,
          item_brand: null,
          item_model: null,
          item_type: null,
          item_snapshot: {},
          assigned_by_line_id: null,
          occupied_at: null,
          released_at: nowIso,
          last_updated_at: nowIso,
        })
        .eq('contract_id', contract.contract_id)
        .eq('box_code', storageBoxAssignment.box_code)
        .select('box_code')
        .maybeSingle();
      if (releaseBoxError || !releasedBox) {
        return NextResponse.json(
          { error: 'ไม่สามารถคืนสถานะกล่องเก็บสินค้าได้ กรุณาลองใหม่' },
          { status: 500, headers: { 'Cache-Control': 'no-store' } },
        );
      }
    }

    const { data: completedRedemption, error: updateError } = await supabase
      .from('redemption_requests')
      .update({
        request_status: 'COMPLETED',
        item_return_confirmed_at: nowIso,
        item_return_confirmed_by_drop_point_id: dropPoint.drop_point_id,
        item_return_confirmed_by_line_id: identity.lineId,
        drop_point_return_photos: returnPhotos,
        drop_point_return_photos_uploaded_at: nowIso,
        final_completion_at: nowIso,
        investor_interest_earned: interestEarned,
        platform_fee_deducted: platformFee,
        investor_net_profit: netProfit,
        updated_at: nowIso,
      })
      .eq('redemption_id', redemptionId)
      .in('request_status', ALLOWED_STATUSES)
      .select('redemption_id')
      .maybeSingle();

    if (updateError || !completedRedemption) {
      return NextResponse.json(
        { error: 'สถานะคำขอเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลใหม่' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (pawner?.line_id) {
      try {
        await pawnerLineClient.pushMessage(pawner.line_id, createPawnerReturnAcknowledgementCard({
          redemptionId,
          redemption: normalizedRedemption,
          bagNumber: resolvedBagNumber,
        }));
      } catch {
        console.error('[drop-point:return] seller notification failed');
      }
    }

    if (investor?.line_id) {
      try {
        await investorLineClient.pushMessage(investor.line_id, {
          type: 'text',
          text: `ส่งคืนเรียบร้อย\n\nสัญญา: ${contract.contract_number}\nกำไรสุทธิ: +${netProfit.toLocaleString()} บาท\n\nขอบคุณที่เป็นส่วนหนึ่งของ Pawnly`
        });
      } catch {
        console.error('[drop-point:return] asset funding notification failed');
      }
    }

    if (dropPointLineClient) {
      try {
        await dropPointLineClient.pushMessage(lineId, {
          type: 'text',
          text: `ส่งคืนเรียบร้อย\n\nสัญญา: ${contract.contract_number}\nสินค้า: ${item?.brand || '-'} ${item?.model || ''}`.trim(),
        });
      } catch {
        console.error('[drop-point:return] drop point notification failed');
      }
    }

    if (contract.investor_id) {
      try {
        await refreshInvestorTierAndTotals(contract.investor_id);
      } catch {
        console.error('[drop-point:return] investor totals refresh failed');
      }
    }

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    if (error instanceof ActorRateLimitError) {
      return NextResponse.json(
        {
          error: error.status === 429
            ? 'ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่'
            : 'ระบบจำกัดคำขอยังไม่พร้อม กรุณาลองใหม่',
          code: error.code,
        },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(error.retryAfterSeconds),
          },
        },
      );
    }
    console.error('[drop-point:return] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return sanitizedServerError('ไม่สามารถยืนยันการส่งคืนสินค้าได้ กรุณาลองใหม่');
  } finally {
    if (releaseBagLock) await releaseBagLock();
    if (releaseContractLock) await releaseContractLock();
    if (releaseRedemptionLock) await releaseRedemptionLock();
  }
}

function createPawnerReturnAcknowledgementCard(params: {
  redemptionId: string;
  redemption: any;
  bagNumber: string;
}) {
  const { redemptionId, redemption, bagNumber } = params;
  const itemName = [redemption.contract?.items?.brand, redemption.contract?.items?.model]
    .filter(Boolean)
    .join(' ')
    .trim() || 'สินค้า';

  return {
    type: 'flex' as const,
    altText: 'สินค้าถูกส่งคืนแล้ว กรุณายืนยันการรับของ',
    contents: {
      type: 'bubble' as const,
      header: {
        type: 'box' as const,
        layout: 'vertical' as const,
        contents: [
          {
            type: 'text' as const,
            text: 'สินค้าถูกส่งคืนแล้ว',
            weight: 'bold' as const,
            size: 'lg' as const,
            color: '#ffffff',
            align: 'center' as const,
          },
          {
            type: 'text' as const,
            text: 'กรุณาถ่ายรูปสินค้าที่ได้รับคืนทุกครั้ง',
            size: 'sm' as const,
            color: '#ffffff',
            align: 'center' as const,
            margin: 'sm' as const,
            wrap: true,
          },
        ],
        backgroundColor: '#B85C38',
        paddingAll: 'lg',
      },
      body: {
        type: 'box' as const,
        layout: 'vertical' as const,
        spacing: 'md' as const,
        contents: [
          {
            type: 'box' as const,
            layout: 'baseline' as const,
            spacing: 'sm' as const,
            contents: [
              { type: 'text' as const, text: 'สัญญา:', color: '#666666', size: 'sm' as const, flex: 2 },
              { type: 'text' as const, text: redemption.contract?.contract_number || '-', color: '#333333', size: 'sm' as const, flex: 5, weight: 'bold' as const },
            ],
          },
          {
            type: 'box' as const,
            layout: 'baseline' as const,
            spacing: 'sm' as const,
            contents: [
              { type: 'text' as const, text: 'สินค้า:', color: '#666666', size: 'sm' as const, flex: 2 },
              { type: 'text' as const, text: itemName, color: '#333333', size: 'sm' as const, flex: 5, weight: 'bold' as const, wrap: true },
            ],
          },
          {
            type: 'box' as const,
            layout: 'baseline' as const,
            spacing: 'sm' as const,
            contents: [
              { type: 'text' as const, text: 'หมายเลขถุง:', color: '#666666', size: 'sm' as const, flex: 2 },
              { type: 'text' as const, text: bagNumber, color: '#B85C38', size: 'sm' as const, flex: 5, weight: 'bold' as const },
            ],
          },
          {
            type: 'separator' as const,
            margin: 'md' as const,
          },
          {
            type: 'text' as const,
            text: '1. ถ่ายรูปสินค้าก่อนแกะซองให้ชัดเจน',
            size: 'sm' as const,
            color: '#333333',
            wrap: true,
          },
          {
            type: 'text' as const,
            text: '2. ถ่ายรูปสินค้าหลังแกะซองให้ชัดเจน',
            size: 'sm' as const,
            color: '#333333',
            wrap: true,
          },
          {
            type: 'text' as const,
            text: 'หากไม่กดปุ่มภายใน 48 ชั่วโมง ระบบจะถือว่าได้รับสินค้าแล้วโดยอัตโนมัติ',
            size: 'xs' as const,
            color: '#666666',
            wrap: true,
            margin: 'md' as const,
          },
        ],
      },
      footer: {
        type: 'box' as const,
        layout: 'vertical' as const,
        spacing: 'sm' as const,
        contents: [
          {
            type: 'button' as const,
            style: 'primary' as const,
            color: '#B85C38',
            action: {
              type: 'postback' as const,
              label: 'ได้รับของคืนแล้ว',
              data: `action=pawner_confirm_received&redemptionId=${redemptionId}`,
              displayText: 'ได้รับของคืนแล้ว',
            },
          },
          {
            type: 'button' as const,
            style: 'secondary' as const,
            action: {
              type: 'postback' as const,
              label: 'ยังไม่ได้รับของ',
              data: `action=pawner_report_not_received&redemptionId=${redemptionId}`,
              displayText: 'ยังไม่ได้รับของ',
            },
          },
        ],
      },
    },
  };
}
