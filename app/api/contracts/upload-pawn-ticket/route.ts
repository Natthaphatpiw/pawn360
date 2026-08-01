import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { putPrivateBlob } from '@/lib/storage/blob';
import { requireContractParty } from '@/lib/security/contract-access';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  boundedText,
  readBoundedJsonObject,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const MAX_TICKET_BYTES = 2 * 1024 * 1024;

function decodePngDataUrl(value: unknown): Buffer {
  const dataUrl = boundedText(value, Math.ceil(MAX_TICKET_BYTES * 4 / 3) + 128, true) || '';
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error('INVALID_TICKET_IMAGE');
  const buffer = Buffer.from(match[1], 'base64');
  if (
    buffer.length === 0
    || buffer.length > MAX_TICKET_BYTES
    || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
  ) {
    throw new Error('INVALID_TICKET_IMAGE');
  }
  return buffer;
}

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    await requireLiffIdentity(request, 'INVESTOR');
    const body = await readBoundedJsonObject(request, 3 * 1024 * 1024);
    const contractId = requireUuid(body.contractId);
    const buffer = decodePngDataUrl(body.imageBase64);

    const supabase = supabaseAdmin();
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('contract_id, investors:investor_id (line_id)')
      .eq('contract_id', contractId)
      .maybeSingle();

    if (contractError || !contract) {
      return NextResponse.json({ error: 'ไม่พบสัญญา', code: 'CONTRACT_NOT_FOUND' }, { status: 404 });
    }
    await requireContractParty(request, contract, 'INVESTOR');
    releaseLock = await acquireFinancialLock(`contract:upload-ticket:${contractId}`);

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `pawn-ticket-${contractId}-${timestamp}.png`;
    const blob = await putPrivateBlob(`cont360/${fileName}`, buffer, 'image/png');

    // Update contract with contract_file_url
    const { error: updateError } = await supabase
      .from('contracts')
      .update({ contract_file_url: blob.signedUrl })
      .eq('contract_id', contractId);

    if (updateError) {
      console.error('[contract:upload-ticket] update failed');
      return NextResponse.json(
        { error: 'อัปเดตเอกสารไม่สำเร็จ', code: 'UPDATE_FAILED' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      url: blob.signedUrl,
      message: 'อัปโหลดเอกสารสัญญาเรียบร้อยแล้ว'
    });

  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    if (error instanceof Error && error.message === 'INVALID_TICKET_IMAGE') {
      return NextResponse.json(
        { error: 'ไฟล์รูปสัญญาไม่ถูกต้อง', code: 'INVALID_TICKET_IMAGE' },
        { status: 400 },
      );
    }
    console.error('[contract:upload-ticket] failed');
    return sanitizedServerError('ไม่สามารถอัปโหลดเอกสารได้ชั่วคราว กรุณาลองใหม่');
  } finally {
    await releaseLock?.();
  }
}
