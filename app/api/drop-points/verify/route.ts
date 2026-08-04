import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client, FlexMessage } from '@line/bot-sdk';
import { requirePinToken } from '@/lib/security/pin';
import { refreshInvestorTierAndTotals } from '@/lib/services/investor-tier';
import { splitItemNotesAndPasscode } from '@/lib/utils/item-private-notes';
import { requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  acquireTransactionLock,
  transactionLockErrorResponse,
} from '@/lib/security/transaction-lock';
import {
  boundedText,
  finiteNumber,
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

const CONDITION_CHECK_KEYS = [
  'screenCrack',
  'screenLineDeadPixel',
  'touchIssue',
  'batteryIssue',
  'bodyDamage',
  'cameraIssue',
  'portButtonIssue',
  'waterIssue',
] as const;

type ConditionCheckKey = (typeof CONDITION_CHECK_KEYS)[number];

const hasStoredConditionChecklist = (checklist: unknown): checklist is Record<ConditionCheckKey, boolean> => {
  if (!checklist || typeof checklist !== 'object') return false;
  return CONDITION_CHECK_KEYS.every((key) => typeof (checklist as Record<string, unknown>)[key] === 'boolean');
};

const isConditionChecklistMatch = (
  pawnerChecklist: unknown,
  dropPointChecklist: unknown
) => {
  if (!hasStoredConditionChecklist(pawnerChecklist)) {
    return true;
  }

  if (!hasStoredConditionChecklist(dropPointChecklist)) {
    return false;
  }

  return CONDITION_CHECK_KEYS.every(
    (key) => pawnerChecklist[key] === dropPointChecklist[key]
  );
};

// Investor LINE OA client
const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
});

// Pawner LINE OA client
const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

const STORAGE_BOX_CODE_REGEX = /^[A-Z0-9-]{2,64}$/;
const MAX_VERIFICATION_PHOTOS = 5;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TransactionRequestError('INVALID_FIELD', 400, 'ข้อมูลการตรวจสอบไม่ถูกต้อง');
  }
  return value as Record<string, unknown>;
}

function optionalBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') {
    throw new TransactionRequestError('INVALID_FIELD', 400, 'ข้อมูลการตรวจสอบไม่ถูกต้อง');
  }
  return value;
}

function sanitizedPinPayload(payload: Record<string, unknown>) {
  return {
    error: typeof payload.error === 'string' ? payload.error : 'กรุณายืนยัน PIN ใหม่',
    pinRequired: Boolean(payload.pinRequired),
    pinSetupRequired: Boolean(payload.pinSetupRequired),
    pinLocked: Boolean(payload.pinLocked),
    lockRemainingSeconds: Number(payload.lockRemainingSeconds || 0),
  };
}

export async function POST(request: NextRequest) {
  let releaseContractLock: (() => Promise<void>) | null = null;
  let releaseStorageBoxLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request);
    const contractId = requireUuid(body.contractId);
    const verificationResult = boundedText(body.verificationResult, 16, true) || '';
    if (verificationResult !== 'APPROVED' && verificationResult !== 'REJECTED') {
      return NextResponse.json(
        { error: 'ผลการตรวจสอบไม่ถูกต้อง' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const verificationData = asObject(body.verificationData);
    const pinToken = boundedText(body.pinToken, 256, true) || '';
    const identity = await requireLiffIdentity(request, 'DROP_POINT');
    const lineId = identity.lineId;
    await enforceActorRateLimit({
      scope: 'drop-point-verification',
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

    const checks = Object.fromEntries(
      ['brand_correct', 'model_correct', 'capacity_correct', 'color_match', 'functionality_ok', 'mdm_lock_status']
        .map((field) => [field, optionalBoolean(verificationData[field])]),
    ) as Record<string, boolean | null>;
    const actualConditionScore = finiteNumber(verificationData.condition_score, {
      min: 0,
      max: 100,
      required: true,
    }) as number;
    if (!Number.isInteger(actualConditionScore)) {
      throw new TransactionRequestError('INVALID_FIELD', 400, 'คะแนนสภาพสินค้าไม่ถูกต้อง');
    }

    const checklistInput = asObject(verificationData.condition_checklist);
    const conditionChecklist = Object.fromEntries(
      CONDITION_CHECK_KEYS.map((key) => [key, optionalBoolean(checklistInput[key])]),
    ) as Record<ConditionCheckKey, boolean | null>;
    if (Object.values(conditionChecklist).some((value) => value === null)) {
      throw new TransactionRequestError('INVALID_FIELD', 400, 'กรุณาตรวจสอบสภาพสินค้าให้ครบถ้วน');
    }

    const notes = boundedText(verificationData.notes, 1_000) || null;
    const rawPhotos = verificationData.verification_photos;
    if (!Array.isArray(rawPhotos) || rawPhotos.length > MAX_VERIFICATION_PHOTOS) {
      throw new TransactionRequestError('INVALID_FIELD', 400, 'รูปยืนยันสินค้าไม่ถูกต้อง');
    }
    if (verificationResult === 'APPROVED' && rawPhotos.length === 0) {
      throw new TransactionRequestError('FIELD_REQUIRED', 400, 'กรุณาถ่ายรูปสินค้าอย่างน้อย 1 รูปก่อนยืนยัน');
    }
    const verificationPhotos = rawPhotos.map((url) => requireOwnedBlobUrl(url, ['droppoint-verification/']));
    if (new Set(verificationPhotos).size !== verificationPhotos.length) {
      throw new TransactionRequestError('INVALID_FIELD', 400, 'พบรูปยืนยันสินค้าซ้ำ กรุณาตรวจสอบอีกครั้ง');
    }

    const storageCandidate = body.storageBoxCode
      ?? verificationData.storage_box_code
      ?? body.bagNumber
      ?? verificationData.bag_number;
    const resolvedStorageBoxCode = boundedText(storageCandidate, 64)?.toUpperCase() || '';
    if (verificationResult === 'APPROVED' && !STORAGE_BOX_CODE_REGEX.test(resolvedStorageBoxCode)) {
      throw new TransactionRequestError('INVALID_FIELD', 400, 'หมายเลขกล่องเก็บของไม่ถูกต้อง');
    }

    releaseContractLock = await acquireTransactionLock('drop-point-verification', contractId, 120);

    const supabase = supabaseAdmin();

    // Get drop point by LINE ID
    const { data: dropPoint, error: dpError } = await supabase
      .from('drop_points')
      .select('drop_point_id, drop_point_name, phone_number')
      .eq('line_id', identity.lineId)
      .single();

    if (dpError || !dropPoint) {
      return NextResponse.json(
        { error: 'Drop point not found' },
        { status: 404 }
      );
    }

    // Same optional column as the detail screen: items.condition_checklist may
    // not exist yet (2026_06_24_add_condition_checklists.sql). Without this the
    // whole select is rejected with 42703 and the operator cannot verify an
    // item at all - the checklist is only used to compare against what the
    // pawner declared, so losing it must not block intake.
    const selectContract = (withChecklist: boolean) => supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        contract_status,
        item_id,
        customer_id,
        investor_id,
        drop_point_id,
        loan_principal_amount,
        item_delivery_status,
        item_received_at,
        item_verified_at,
        items:item_id (
          item_id,
          item_type,
          brand,
          model,
          capacity,
          item_condition,
          ${withChecklist ? 'condition_checklist,' : ''}
          serial_number,
          notes,
          image_urls,
          verified_by_drop_point,
          drop_point_verified_at,
          drop_point_photos,
          drop_point_condition_score,
          drop_point_verification_notes,
          item_status
        ),
        pawners:customer_id (
          firstname,
          lastname,
          line_id,
          bank_name,
          bank_account_name,
          bank_account_no
        ),
        investors:investor_id (line_id)
      `)
      .eq('contract_id', contractId)
      .single();

    let { data: contract, error: contractError } = await selectContract(true);
    if (contractError && `${contractError.message || ''}`.toLowerCase().includes('condition_checklist')) {
      console.warn('items.condition_checklist is missing; run 2026_06_24_add_condition_checklists.sql. Verifying without it.');
      ({ data: contract, error: contractError } = await selectContract(false));
    }

    if (contractError) {
      // A rejected query is not a missing contract - say which, so a schema
      // problem cannot masquerade as bad data again.
      console.error('[drop-points:verify] contract query failed', {
        code: (contractError as { code?: string })?.code || 'QUERY_FAILED',
        column: /column ([a-z_."]+) does not exist/i.exec(contractError.message || '')?.[1],
      });
      return NextResponse.json(
        { error: 'ไม่สามารถโหลดข้อมูลสัญญาได้ กรุณาลองใหม่อีกครั้ง', code: 'CONTRACT_LOOKUP_FAILED' },
        { status: 503 }
      );
    }
    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    if (contract.drop_point_id !== dropPoint.drop_point_id) {
      return NextResponse.json(
        { error: 'Unauthorized drop point' },
        { status: 403 }
      );
    }

    const item = Array.isArray(contract.items) ? contract.items[0] : contract.items;
    const pawner = Array.isArray(contract.pawners) ? contract.pawners[0] : contract.pawners;
    const investor = Array.isArray(contract.investors) ? contract.investors[0] : contract.investors;
    const normalizedContract = { ...contract, items: item, pawners: pawner, investors: investor };

    const completedStatus = verificationResult === 'APPROVED' ? 'VERIFIED' : 'RETURNED';
    if (contract.item_delivery_status !== 'RECEIVED_AT_DROP_POINT'
      && contract.item_delivery_status !== completedStatus) {
      return NextResponse.json(
        { error: 'สถานะสินค้าปัจจุบันไม่สามารถตรวจสอบได้ กรุณาโหลดข้อมูลใหม่' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const hasIncompleteChecks = Object.values(checks).some((value) => value === null);
    const hasAnyMismatch = Object.values(checks).some((value) => value === false);
    const expectedConditionScore = item?.item_condition === null || item?.item_condition === undefined
      ? null
      : Number(item.item_condition);
    // Absent when the column has not been migrated yet, in which case there is
    // nothing to compare the operator's checklist against.
    const pawnerConditionChecklist = (item as { condition_checklist?: unknown } | null)?.condition_checklist;
    const dropPointConditionChecklist = conditionChecklist as Record<ConditionCheckKey, boolean>;
    const hasChecklistMismatch = !isConditionChecklistMatch(pawnerConditionChecklist, dropPointConditionChecklist);
    const isConditionGapTooHigh = expectedConditionScore !== null && Number.isFinite(expectedConditionScore)
      ? actualConditionScore < (expectedConditionScore - 10)
      : false;

    if (verificationResult === 'APPROVED' && (hasIncompleteChecks || hasAnyMismatch || isConditionGapTooHigh || hasChecklistMismatch)) {
      return NextResponse.json(
        {
          error: 'พบข้อมูลไม่ตรงหรือสภาพต่ำกว่าที่กำหนด ต้องส่งคืนเท่านั้น',
          requiredResult: 'REJECTED',
          hasIncompleteChecks,
          hasAnyMismatch,
          isConditionGapTooHigh,
          hasChecklistMismatch,
        },
        { status: 400 }
      );
    }

    // Rows superseded by an approved reconciliation are retained evidence, not
    // the current verification, and must not drive the conflict check below.
    const { data: existingVerification, error: existingVerificationError } = await supabase
      .from('drop_point_verifications')
      .select('verification_id, verification_result')
      .eq('contract_id', contractId)
      .is('superseded_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingVerificationError) throw existingVerificationError;
    if (existingVerification && existingVerification.verification_result !== verificationResult) {
      return NextResponse.json(
        { error: 'รายการนี้มีผลตรวจสอบที่ขัดแย้งกัน กรุณาติดต่อผู้ดูแลระบบ' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (existingVerification && contract.item_delivery_status === completedStatus) {
      return NextResponse.json(
        {
          success: true,
          alreadyCompleted: true,
          storageBoxCode: verificationResult === 'APPROVED' ? resolvedStorageBoxCode : null,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    await Promise.all(verificationPhotos.map((photo) => fingerprintOwnedBlob(photo)));

    let insertedVerificationId: string | null = null;
    let storageWasNewlyAssigned = false;
    let itemWasUpdated = false;
    const verificationPayload = {
      contract_id: contractId,
      drop_point_id: dropPoint.drop_point_id,
      item_id: contract.item_id,
      ...checks,
      condition_score: actualConditionScore,
      condition_checklist: conditionChecklist,
      verification_photos: verificationPhotos,
      notes,
      verification_result: verificationResult,
      rejection_reason: verificationResult === 'REJECTED' ? notes : null,
      verified_by_line_id: identity.lineId,
    };

    const restoreItem = async () => {
      if (!itemWasUpdated || !item?.item_id) return;
      await supabase
        .from('items')
        .update({
          item_status: item.item_status,
          verified_by_drop_point: item.verified_by_drop_point,
          drop_point_verified_at: item.drop_point_verified_at,
          drop_point_photos: item.drop_point_photos,
          drop_point_condition_score: item.drop_point_condition_score,
          drop_point_verification_notes: item.drop_point_verification_notes,
        })
        .eq('item_id', item.item_id);
    };

    const removeInsertedVerification = async () => {
      if (!insertedVerificationId) return;
      await supabase
        .from('drop_point_verifications')
        .delete()
        .eq('verification_id', insertedVerificationId);
    };

    if (verificationResult === 'APPROVED') {
      releaseStorageBoxLock = await acquireTransactionLock('drop-point-storage-box', resolvedStorageBoxCode, 120);
      const { data: storageBox, error: storageBoxError } = await supabase
        .from('drop_point_storage_boxes')
        .select('box_code, drop_point_id, contract_id, box_status')
        .eq('box_code', resolvedStorageBoxCode)
        .maybeSingle();

      if (storageBoxError) {
        console.error('[drop-point:verify] storage lookup failed');
        return NextResponse.json(
          {
            error: storageBoxError.code === 'PGRST205'
              ? 'ยังไม่ได้สร้างตารางกล่องเก็บสินค้า (drop_point_storage_boxes)'
              : 'ไม่สามารถตรวจสอบหมายเลขกล่องเก็บของได้'
          },
          { status: storageBoxError.code === 'PGRST205' ? 500 : 400 }
        );
      }

      if (!storageBox) {
        return NextResponse.json(
          { error: 'ไม่พบหมายเลขกล่องเก็บของนี้ในระบบ' },
          { status: 400 }
        );
      }

      if (storageBox.drop_point_id !== dropPoint.drop_point_id) {
        return NextResponse.json(
          { error: 'หมายเลขกล่องนี้ไม่ใช่ของสาขาที่คุณรับผิดชอบ' },
          { status: 403 }
        );
      }

      if (storageBox.contract_id && storageBox.contract_id !== contractId) {
        return NextResponse.json(
          { error: 'กล่องเก็บของนี้ถูกใช้งานอยู่ กรุณาเลือกกล่องอื่น' },
          { status: 409 }
        );
      }

      const notesPayload = splitItemNotesAndPasscode(item?.notes);
      const nowIso = new Date().toISOString();
      storageWasNewlyAssigned = !storageBox.contract_id;
      let storageUpdate = supabase
        .from('drop_point_storage_boxes')
        .update({
          box_status: 'OCCUPIED',
          contract_id: contractId,
          item_id: contract.item_id,
          customer_id: contract.customer_id,
          contract_number: contract.contract_number,
          item_brand: item?.brand || null,
          item_model: item?.model || null,
          item_type: item?.item_type || null,
          item_snapshot: {
            item_id: contract.item_id,
            item_type: item?.item_type || null,
            brand: item?.brand || null,
            model: item?.model || null,
            capacity: item?.capacity || null,
            item_condition: item?.item_condition ?? null,
            serial_number: item?.serial_number || null,
            device_passcode: notesPayload.devicePasscode,
          },
          assigned_by_line_id: identity.lineId,
          occupied_at: nowIso,
          released_at: null,
          last_updated_at: nowIso,
        })
        .eq('box_code', resolvedStorageBoxCode)
        .eq('drop_point_id', dropPoint.drop_point_id);
      storageUpdate = storageWasNewlyAssigned
        ? storageUpdate.is('contract_id', null)
        : storageUpdate.eq('contract_id', contractId);
      const { data: assignedStorageBox, error: storageUpdateError } = await storageUpdate
        .select('box_code')
        .maybeSingle();

      if (storageUpdateError || !assignedStorageBox) {
        return NextResponse.json(
          { error: storageUpdateError ? 'ไม่สามารถบันทึกหมายเลขกล่องเก็บของได้' : 'กล่องเก็บของถูกใช้งานแล้ว กรุณาเลือกกล่องอื่น' },
          { status: storageUpdateError ? 500 : 409, headers: { 'Cache-Control': 'no-store' } },
        );
      }

      if (!existingVerification) {
        const { data: createdVerification, error: verificationError } = await supabase
          .from('drop_point_verifications')
          .insert(verificationPayload)
          .select('verification_id')
          .single();
        if (verificationError || !createdVerification) {
          if (storageWasNewlyAssigned) {
            await releaseStorageAssignment(supabase, resolvedStorageBoxCode, contractId, nowIso);
          }
          throw verificationError || new Error('verification insert failed');
        }
        insertedVerificationId = createdVerification.verification_id;
      }

      const { data: updatedItem, error: itemUpdateError } = await supabase
        .from('items')
        .update({
          verified_by_drop_point: true,
          drop_point_verified_at: item?.drop_point_verified_at || nowIso,
          drop_point_photos: verificationPhotos,
          drop_point_condition_score: actualConditionScore,
          drop_point_verification_notes: notes,
        })
        .eq('item_id', contract.item_id)
        .select('item_id')
        .maybeSingle();
      if (itemUpdateError || !updatedItem) {
        await removeInsertedVerification();
        if (storageWasNewlyAssigned) {
          await releaseStorageAssignment(supabase, resolvedStorageBoxCode, contractId, nowIso);
        }
        throw itemUpdateError || new Error('item update failed');
      }
      itemWasUpdated = true;

      if (contract.item_delivery_status !== 'VERIFIED') {
        const { data: updatedContract, error: contractUpdateError } = await supabase
          .from('contracts')
          .update({
            item_delivery_status: 'VERIFIED',
            item_received_at: contract.item_received_at || nowIso,
            item_verified_at: contract.item_verified_at || nowIso,
            updated_at: nowIso,
          })
          .eq('contract_id', contractId)
          .eq('item_delivery_status', 'RECEIVED_AT_DROP_POINT')
          .select('contract_id')
          .maybeSingle();
        if (contractUpdateError || !updatedContract) {
          await restoreItem();
          await removeInsertedVerification();
          if (storageWasNewlyAssigned) {
            await releaseStorageAssignment(supabase, resolvedStorageBoxCode, contractId, nowIso);
          }
          return NextResponse.json(
            { error: 'สถานะสินค้าเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลใหม่' },
            { status: 409, headers: { 'Cache-Control': 'no-store' } },
          );
        }
      }

      // Send notification to investor with payment instructions
      if (investor?.line_id) {
        const paymentCard = createPaymentInstructionCard(normalizedContract);
        try {
          await investorLineClient.pushMessage(investor.line_id, paymentCard);
        } catch {
          console.error('[drop-point:verify] investor notification failed');
        }
      }

    } else if (verificationResult === 'REJECTED') {
      const nowIso = new Date().toISOString();
      if (!existingVerification) {
        const { data: createdVerification, error: verificationError } = await supabase
          .from('drop_point_verifications')
          .insert(verificationPayload)
          .select('verification_id')
          .single();
        if (verificationError || !createdVerification) {
          throw verificationError || new Error('verification insert failed');
        }
        insertedVerificationId = createdVerification.verification_id;
      }

      const { data: updatedItem, error: itemUpdateError } = await supabase
        .from('items')
        .update({
          item_status: 'RETURNED',
          verified_by_drop_point: true,
          drop_point_verified_at: item?.drop_point_verified_at || nowIso,
          drop_point_photos: verificationPhotos,
          drop_point_condition_score: actualConditionScore,
          drop_point_verification_notes: notes,
        })
        .eq('item_id', contract.item_id)
        .select('item_id')
        .maybeSingle();
      if (itemUpdateError || !updatedItem) {
        await removeInsertedVerification();
        throw itemUpdateError || new Error('item update failed');
      }
      itemWasUpdated = true;

      if (contract.item_delivery_status !== 'RETURNED') {
        const { data: updatedContract, error: contractUpdateError } = await supabase
          .from('contracts')
          .update({
            item_delivery_status: 'RETURNED',
            contract_status: 'TERMINATED',
            updated_at: nowIso,
          })
          .eq('contract_id', contractId)
          .eq('item_delivery_status', 'RECEIVED_AT_DROP_POINT')
          .select('contract_id')
          .maybeSingle();
        if (contractUpdateError || !updatedContract) {
          await restoreItem();
          await removeInsertedVerification();
          return NextResponse.json(
            { error: 'สถานะสินค้าเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลใหม่' },
            { status: 409, headers: { 'Cache-Control': 'no-store' } },
          );
        }
      }

      // Notify pawner about rejection
      if (pawner?.line_id) {
        try {
          await pawnerLineClient.pushMessage(pawner.line_id, {
            type: 'text',
            text: `สินค้าของคุณถูกปฏิเสธจาก Drop Point\n\nเหตุผล: ${notes || 'สินค้าไม่ตรงตามข้อมูลที่ระบุ'}\n\nกรุณาติดต่อ Drop Point เพื่อรับสินค้าคืนหรือจัดส่งกลับ\nจุดรับฝาก: ${dropPoint.drop_point_name}\nเบอร์ติดต่อ: ${dropPoint.phone_number || 'ไม่ระบุ'}`
          });
        } catch {
          console.error('[drop-point:verify] seller notification failed');
        }
      }

      // Notify investor
      if (investor?.line_id) {
        try {
          await investorLineClient.pushMessage(investor.line_id, {
            type: 'text',
            text: `สินค้าถูกปฏิเสธจาก Drop Point\n\nหมายเลขสัญญา: ${contract.contract_number}\nเหตุผล: ${notes || 'สินค้าไม่ตรงตามข้อมูลที่ระบุ'}\n\nสัญญานี้ถูกยกเลิก`
          });
        } catch {
          console.error('[drop-point:verify] asset funding notification failed');
        }
      }

      if (contract.investor_id) {
        try {
          await refreshInvestorTierAndTotals(contract.investor_id);
        } catch {
          console.error('[drop-point:verify] investor totals refresh failed');
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: verificationResult === 'APPROVED' ? 'Verification approved' : 'Verification rejected',
      storageBoxCode: verificationResult === 'APPROVED' ? resolvedStorageBoxCode : null,
    }, { headers: { 'Cache-Control': 'no-store' } });

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
    console.error('[drop-point:verify] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return sanitizedServerError('ไม่สามารถบันทึกผลตรวจสอบสินค้าได้ กรุณาลองใหม่');
  } finally {
    if (releaseStorageBoxLock) await releaseStorageBoxLock();
    if (releaseContractLock) await releaseContractLock();
  }
}

async function releaseStorageAssignment(
  supabase: ReturnType<typeof supabaseAdmin>,
  boxCode: string,
  contractId: string,
  nowIso: string,
) {
  await supabase
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
    .eq('box_code', boxCode)
    .eq('contract_id', contractId);
}

function createPaymentInstructionCard(contract: any): FlexMessage {
  const itemName = [contract.items?.brand, contract.items?.model].filter(Boolean).join(' ').trim() || '-';
  const accountName = contract.pawners?.bank_account_name
    || [contract.pawners?.firstname, contract.pawners?.lastname].filter(Boolean).join(' ').trim()
    || 'ไม่ระบุ';

  return {
    type: 'flex',
    altText: 'สินค้าผ่านการตรวจสอบแล้ว - กรุณาโอนเงิน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'สินค้าผ่านการตรวจสอบแล้ว',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }, {
          type: 'text',
          text: 'กรุณาโอนเงินให้ผู้ขาย',
          size: 'sm',
          color: '#ffffff',
          align: 'center',
          margin: 'sm'
        }],
        backgroundColor: '#1E3A8A',
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
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'text',
              text: 'ข้อมูลบัญชีผู้รับเงิน',
              weight: 'bold',
              margin: 'lg',
              color: '#1E3A8A'
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              margin: 'md',
              contents: [
                { type: 'text', text: 'ธนาคาร:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: contract.pawners?.bank_name || 'ไม่ระบุ', color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ชื่อบัญชี:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: accountName, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'เลขบัญชี:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: contract.pawners?.bank_account_no || 'ไม่ระบุ', color: '#1E3A8A', size: 'md', flex: 5, weight: 'bold' }
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
                { type: 'text', text: 'ยอดโอน:', color: '#666666', size: 'md', flex: 2 },
                { type: 'text', text: `${contract.loan_principal_amount?.toLocaleString()} บาท`, color: '#1E3A8A', size: 'xl', flex: 5, weight: 'bold' }
              ]
            }
          ]
        }]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [{
          type: 'button',
          action: {
            type: 'uri',
            label: 'ส่งหลักฐานการชำระเงิน',
            uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_INVEST_PAYMENT || '2008641671-MPKmDQ1y'}?contractId=${contract.contract_id}`
          },
          style: 'primary',
          color: '#1E3A8A'
        }]
      }
    }
  };
}
