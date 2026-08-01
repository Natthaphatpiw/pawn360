import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/client';
import { anthropicStructured, hasAnthropicKeys, getAnthropicVisionModel } from '@/lib/services/anthropic-llm';
import {
  getOpenAILunaModel,
  getOpenAIReasoningEffortForTask,
  hasOpenAIKeys,
  openaiStructuredJson,
} from '@/lib/services/openai-llm';

// Internal label for the Anthropic fallback path, stored in rawResponse.
const LEGACY_MODEL = 'anthropic-vision';
const SLIPOK_PROVIDER = 'slipok';
const SLIPOK_BASE_URL = 'https://api.slipok.com/api/line/apikey';
const MAX_SLIP_IMAGE_BYTES = 4 * 1024 * 1024;

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new Error('Slip image response has no body');
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('Slip image is too large');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Slip image is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

export interface SlipVerificationResult {
  success: boolean;
  result: 'MATCHED' | 'UNDERPAID' | 'OVERPAID' | 'UNREADABLE' | 'INVALID';
  detectedAmount: number | null;
  expectedAmount: number;
  difference: number | null;
  confidenceScore: number;
  message: string;
  rawResponse?: any;
}

export interface VerifyPaymentSlipOptions {
  tolerance?: number;
  receiverAccountNo?: string | null;
  receiverPromptpay?: string | null;
  receiverName?: string | null;
  useSlipOkLogCheck?: boolean;
}

function toRoundedAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function parseVerifyOptions(optionsOrTolerance?: number | VerifyPaymentSlipOptions) {
  if (typeof optionsOrTolerance === 'number') {
    return {
      tolerance: optionsOrTolerance,
      receiverAccountNo: null,
      receiverPromptpay: null,
      receiverName: null,
      useSlipOkLogCheck: false,
    } satisfies Required<VerifyPaymentSlipOptions>;
  }

  return {
    tolerance: optionsOrTolerance?.tolerance ?? 0,
    receiverAccountNo: optionsOrTolerance?.receiverAccountNo ?? null,
    receiverPromptpay: optionsOrTolerance?.receiverPromptpay ?? null,
    receiverName: optionsOrTolerance?.receiverName ?? null,
    useSlipOkLogCheck: optionsOrTolerance?.useSlipOkLogCheck ?? false,
  } satisfies Required<VerifyPaymentSlipOptions>;
}

function extractBranchId(rawValue?: string | null) {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return '';
  }

  const match = trimmed.match(/apikey\/(\d+)/i);
  return match?.[1] || trimmed;
}

function getSlipOkConfig() {
  const branchId = extractBranchId(process.env.SLIPOK_BRANCH_ID || process.env.SLIPOK_API_URL || '');
  const apiKey = (process.env.SLIPOK_API_KEY || process.env.SLIPOK_PASSWORD || '').trim();

  return {
    branchId,
    apiKey,
    enabled: Boolean(branchId && apiKey),
  };
}

function normalizeIdentifier(value?: string | null) {
  return (value || '')
    .trim()
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase();
}

function normalizeMaskedIdentifier(value?: string | null) {
  return (value || '')
    .trim()
    .replace(/[^0-9A-Za-zXx*]/g, '')
    .toUpperCase();
}

function maskedIdentifierMatches(expected?: string | null, masked?: string | null) {
  const normalizedExpected = normalizeIdentifier(expected);
  const normalizedMasked = normalizeMaskedIdentifier(masked);

  if (!normalizedExpected || !normalizedMasked) {
    return false;
  }

  const visibleChars = normalizedMasked.replace(/[X*]/g, '');
  if (!visibleChars) {
    return false;
  }

  if (normalizedExpected.length === normalizedMasked.length) {
    for (let index = 0; index < normalizedMasked.length; index += 1) {
      const maskChar = normalizedMasked[index];
      if (maskChar === 'X' || maskChar === '*') {
        continue;
      }
      if (normalizedExpected[index] !== maskChar) {
        return false;
      }
    }
    return true;
  }

  return visibleChars.length >= 4 && normalizedExpected.includes(visibleChars);
}

function normalizeName(value?: string | null) {
  return (value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z\u0E00-\u0E7F]/g, '');
}

function receiverNameMatches(expected?: string | null, actual?: string | null) {
  const normalizedExpected = normalizeName(expected);
  const normalizedActual = normalizeName(actual);

  if (!normalizedExpected || !normalizedActual) {
    return false;
  }

  if (normalizedExpected === normalizedActual) {
    return true;
  }

  if (normalizedExpected.includes(normalizedActual) || normalizedActual.includes(normalizedExpected)) {
    return true;
  }

  const tokens = (expected || '')
    .split(/\s+/)
    .map((token) => normalizeName(token))
    .filter((token) => token.length >= 3);

  return tokens.some((token) => normalizedActual.includes(token));
}

function getFileExtension(contentType?: string | null) {
  const normalizedType = (contentType || '').toLowerCase();

  if (normalizedType.includes('png')) {
    return 'png';
  }
  if (normalizedType.includes('webp')) {
    return 'webp';
  }
  if (normalizedType.includes('gif')) {
    return 'gif';
  }

  return 'jpg';
}

function parseNumericAmount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return toRoundedAmount(value);
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    if (Number.isFinite(parsed)) {
      return toRoundedAmount(parsed);
    }
  }

  return null;
}

function safeProviderName(value: unknown): string {
  const normalized = String(value || '').trim().slice(0, 100);
  return /^[a-z0-9:._-]+$/i.test(normalized) ? normalized : 'unknown';
}

function safeProviderCode(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const normalized = value.trim().slice(0, 50);
    if (/^[a-z0-9._-]+$/i.test(normalized)) return normalized;
  }
  return null;
}

function providerReferenceHash(data: any): string | null {
  const value = data?.transRef
    ?? data?.trans_ref
    ?? data?.transactionId
    ?? data?.transaction_id
    ?? data?.reference;
  if (typeof value !== 'string' || !value.trim()) return null;
  return crypto.createHash('sha256').update(value.trim()).digest('hex');
}

function buildBaseRawResponse(extra: Record<string, any>) {
  const response: Record<string, unknown> = { provider: SLIPOK_PROVIDER };
  if (Number.isInteger(extra.httpStatus) && extra.httpStatus >= 100 && extra.httpStatus <= 599) {
    response.httpStatus = extra.httpStatus;
  }
  const code = safeProviderCode(extra.code);
  if (code !== null) response.code = code;
  const referenceHash = providerReferenceHash(extra.data);
  if (referenceHash) response.transactionReferenceHash = referenceHash;
  if (extra.data && typeof extra.data === 'object') {
    response.hasReceiverEvidence = Boolean(
      extra.data?.receiver?.account?.value
      || extra.data?.receiver?.proxy?.value
      || extra.data?.receiver?.displayName
      || extra.data?.receiver?.name
    );
  }
  if (extra.errorKind) response.errorKind = safeProviderCode(extra.errorKind);
  return response;
}

function buildAiRawResponse(provider: string, parsed: any, requiresManualReview = false) {
  return {
    provider: safeProviderName(provider),
    isValidSlip: parsed?.is_valid_slip === true,
    confidence: Math.max(0, Math.min(1, Number(parsed?.confidence) || 0)),
    amountPresent: parseNumericAmount(parsed?.detected_amount) !== null,
    requiresManualReview,
  };
}

function sanitizePersistedRawResponse(value: unknown): Record<string, unknown> {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const output: Record<string, unknown> = {
    provider: safeProviderName(raw.provider),
  };
  const code = safeProviderCode(raw.code);
  if (code !== null) output.code = code;
  if (typeof raw.httpStatus === 'number' && Number.isInteger(raw.httpStatus)) {
    output.httpStatus = Math.min(599, Math.max(100, raw.httpStatus));
  }
  if (typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)) {
    output.confidence = Math.max(0, Math.min(1, raw.confidence));
  }
  for (const key of ['isValidSlip', 'amountPresent', 'requiresManualReview', 'hasReceiverEvidence'] as const) {
    if (typeof raw[key] === 'boolean') output[key] = raw[key];
  }
  for (const key of ['transactionReferenceHash', 'evidenceFingerprint'] as const) {
    const candidate = typeof raw[key] === 'string' ? raw[key].toLowerCase() : '';
    if (/^[0-9a-f]{64}$/.test(candidate)) output[key] = candidate;
  }
  const fingerprint = typeof raw.fingerprint === 'string' ? raw.fingerprint.toLowerCase() : '';
  if (/^(?:sha256:)?[0-9a-f]{64}$/.test(fingerprint)) output.fingerprint = fingerprint;
  const errorKind = safeProviderCode(raw.errorKind);
  if (errorKind !== null) output.errorKind = errorKind;
  return output;
}

function buildAmountResult(
  detectedAmount: number | null,
  expectedAmount: number,
  tolerance: number,
  rawResponse: any,
): SlipVerificationResult {
  if (detectedAmount === null) {
    return {
      success: false,
      result: 'UNREADABLE',
      detectedAmount: null,
      expectedAmount,
      difference: null,
      confidenceScore: 0,
      message: 'ไม่สามารถอ่านจำนวนเงินจากสลิปได้ กรุณาถ่ายรูปใหม่ให้ชัดเจน',
      rawResponse,
    };
  }

  const difference = toRoundedAmount(detectedAmount - expectedAmount);

  if (Math.abs(difference) <= tolerance) {
    return {
      success: true,
      result: 'MATCHED',
      detectedAmount,
      expectedAmount,
      difference: 0,
      confidenceScore: 1,
      message: 'ยอดเงินถูกต้อง',
      rawResponse,
    };
  }

  if (difference > 0) {
    return {
      success: false,
      result: 'OVERPAID',
      detectedAmount,
      expectedAmount,
      difference,
      confidenceScore: 1,
      message: `ยอดเงินที่โอนมากกว่าที่กำหนด ${difference.toLocaleString()} บาท`,
      rawResponse,
    };
  }

  return {
    success: false,
    result: 'UNDERPAID',
    detectedAmount,
    expectedAmount,
    difference,
    confidenceScore: 1,
    message: `ยอดเงินที่โอนขาดไป ${Math.abs(difference).toLocaleString()} บาท`,
    rawResponse,
  };
}

function validateReceiver(
  slipData: any,
  options: Required<VerifyPaymentSlipOptions>,
): { valid: boolean; reason?: string } {
  const expectedAccount = options.receiverAccountNo;
  const expectedPromptpay = options.receiverPromptpay;
  const expectedName = options.receiverName;

  if (!expectedAccount && !expectedPromptpay && !expectedName) {
    return { valid: true };
  }

  const receiver = slipData?.receiver || {};
  const accountValue = receiver?.account?.value || '';
  const proxyValue = receiver?.proxy?.value || '';
  const displayName = receiver?.displayName || receiver?.name || '';

  const accountMatched = expectedAccount
    ? maskedIdentifierMatches(expectedAccount, accountValue)
    : false;
  const promptpayMatched = expectedPromptpay
    ? maskedIdentifierMatches(expectedPromptpay, proxyValue)
    : false;
  const nameMatched = expectedName
    ? receiverNameMatches(expectedName, displayName)
    : false;

  if (expectedAccount && accountMatched) {
    return { valid: true };
  }

  if (expectedPromptpay && promptpayMatched) {
    return { valid: true };
  }

  if (!expectedAccount && !expectedPromptpay && expectedName && nameMatched) {
    return { valid: true };
  }

  if (nameMatched && (expectedAccount || expectedPromptpay)) {
    if ((expectedAccount && accountValue) || (expectedPromptpay && proxyValue)) {
      if (accountMatched || promptpayMatched) {
        return { valid: true };
      }
    }
  }

  return {
    valid: false,
    reason: 'บัญชีผู้รับเงินในสลิปไม่ตรงกับบัญชีที่ระบบคาดไว้ กรุณาตรวจสอบสลิปแล้วอัปโหลดใหม่อีกครั้ง',
  };
}

async function buildSlipOkRequestBody(slipUrl: string, expectedAmount: number, useLogCheck: boolean) {
  const timeoutMs = positiveNumber(process.env.SLIP_IMAGE_FETCH_TIMEOUT_MS, 8_000);
  const fileResponse = await fetch(slipUrl, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!fileResponse.ok) {
    throw new Error(`Failed to fetch slip image (${fileResponse.status})`);
  }

  const contentType = fileResponse.headers.get('content-type') || 'image/jpeg';
  const fileBuffer = await readBoundedResponse(fileResponse, MAX_SLIP_IMAGE_BYTES);
  const formData = new FormData();
  const extension = getFileExtension(contentType);

  formData.append(
    'files',
    new Blob([Uint8Array.from(fileBuffer)], { type: contentType }),
    `slip.${extension}`,
  );
  formData.append('log', useLogCheck ? 'true' : 'false');
  formData.append('amount', String(expectedAmount));

  return formData;
}

async function verifyWithSlipOk(
  slipUrl: string,
  expectedAmount: number,
  options: Required<VerifyPaymentSlipOptions>,
): Promise<SlipVerificationResult> {
  const config = getSlipOkConfig();
  const requestUrl = `${SLIPOK_BASE_URL}/${config.branchId}`;

  let payload: any = null;
  let httpStatus = 500;

  try {
    const requestBody = await buildSlipOkRequestBody(slipUrl, expectedAmount, options.useSlipOkLogCheck);
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'x-authorization': config.apiKey,
      },
      body: requestBody,
      redirect: 'error',
      signal: AbortSignal.timeout(
        positiveNumber(process.env.SLIPOK_REQUEST_TIMEOUT_MS, 15_000),
      ),
    });

    httpStatus = response.status;
    const responseText = (await readBoundedResponse(response, 512 * 1024)).toString('utf8');

    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = {
        message: responseText || 'Invalid SlipOK response',
      };
    }
  } catch (error: any) {
    console.error('SlipOK request failed:', error);
    return {
      success: false,
      result: 'UNREADABLE',
      detectedAmount: null,
      expectedAmount,
      difference: null,
      confidenceScore: 0,
      message: 'ระบบตรวจสอบสลิปขัดข้อง กรุณาลองใหม่อีกครั้ง',
      rawResponse: buildBaseRawResponse({
        errorKind: error?.name || 'SLIPOK_REQUEST_FAILED',
      }),
    };
  }

  const slipData = payload?.data && typeof payload.data === 'object' ? payload.data : null;
  const detectedAmount = parseNumericAmount(slipData?.amount ?? payload?.amount);
  const rawResponse = buildBaseRawResponse({
    httpStatus,
    code: payload?.code ?? null,
    message: payload?.message ?? null,
    data: slipData,
  });

  if (httpStatus >= 200 && httpStatus < 300) {
    if (!options.useSlipOkLogCheck) {
      const receiverValidation = validateReceiver(slipData, options);
      if (!receiverValidation.valid) {
        return {
          success: false,
          result: 'INVALID',
          detectedAmount,
          expectedAmount,
          difference: detectedAmount === null ? null : toRoundedAmount(detectedAmount - expectedAmount),
          confidenceScore: 1,
          message: receiverValidation.reason || 'บัญชีผู้รับเงินไม่ตรงกับที่ระบบคาดไว้',
          rawResponse,
        };
      }
    }

    return buildAmountResult(detectedAmount, expectedAmount, options.tolerance, rawResponse);
  }

  if (payload?.code === 1012) {
    return {
      success: false,
      result: 'INVALID',
      detectedAmount,
      expectedAmount,
      difference: detectedAmount === null ? null : toRoundedAmount(detectedAmount - expectedAmount),
      confidenceScore: 1,
      message: 'สลิปนี้ถูกใช้ในระบบแล้ว กรุณาใช้สลิปที่ยังไม่เคยส่งเข้าระบบ',
      rawResponse,
    };
  }

  if (payload?.code === 1014) {
    return {
      success: false,
      result: 'INVALID',
      detectedAmount,
      expectedAmount,
      difference: detectedAmount === null ? null : toRoundedAmount(detectedAmount - expectedAmount),
      confidenceScore: 1,
      message: 'บัญชีผู้รับเงินในสลิปไม่ตรงกับบัญชีปลายทางที่กำหนด กรุณาตรวจสอบแล้วอัปโหลดใหม่',
      rawResponse,
    };
  }

  if (payload?.code === 1013) {
    if (!options.useSlipOkLogCheck) {
      const receiverValidation = validateReceiver(slipData, options);
      if (!receiverValidation.valid) {
        return {
          success: false,
          result: 'INVALID',
          detectedAmount,
          expectedAmount,
          difference: detectedAmount === null ? null : toRoundedAmount(detectedAmount - expectedAmount),
          confidenceScore: 1,
          message: receiverValidation.reason || 'บัญชีผู้รับเงินไม่ตรงกับที่ระบบคาดไว้',
          rawResponse,
        };
      }
    }

    return buildAmountResult(detectedAmount, expectedAmount, options.tolerance, rawResponse);
  }

  if (payload?.code === 1005 || payload?.code === 1006) {
    return {
      success: false,
      result: 'INVALID',
      detectedAmount: null,
      expectedAmount,
      difference: null,
      confidenceScore: 0,
      message: 'รูปภาพนี้ไม่ใช่สลิปการโอนเงิน กรุณาอัปโหลดสลิปที่ถูกต้อง',
      rawResponse,
    };
  }

  if (payload?.code === 1002 || payload?.code === 1003 || payload?.code === 1004) {
    return {
      success: false,
      result: 'UNREADABLE',
      detectedAmount: null,
      expectedAmount,
      difference: null,
      confidenceScore: 0,
      message: 'ระบบตรวจสอบสลิปยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง',
      rawResponse,
    };
  }

  return {
    success: false,
    result: 'UNREADABLE',
    detectedAmount,
    expectedAmount,
    difference: detectedAmount === null ? null : toRoundedAmount(detectedAmount - expectedAmount),
    confidenceScore: 0,
    message: payload?.message || 'ไม่สามารถตรวจสอบสลิปได้ กรุณาลองใหม่อีกครั้ง',
    rawResponse,
  };
}

async function verifyWithAIVision(
  slipUrl: string,
  expectedAmount: number,
  tolerance: number,
): Promise<SlipVerificationResult> {
  try {
    if (!hasOpenAIKeys() && !hasAnthropicKeys()) {
      return {
        success: false,
        result: 'UNREADABLE',
        detectedAmount: null,
        expectedAmount,
        difference: null,
        confidenceScore: 0,
        message: 'AI provider is not configured',
        rawResponse: { provider: 'unknown', errorKind: 'CONFIGURATION' },
      };
    }

    const systemPrompt = `You are a Thai bank transfer slip analyzer. Your task is to:
1. Extract the transfer amount from the slip image
2. Verify if it matches the expected amount
3. Return the result in JSON format

Important:
- Focus on finding the main transfer amount (not fees or balance)
- Thai bank slips usually show amount in Thai Baht (THB/บาท)
- Look for keywords like "จำนวนเงิน", "Amount", "ยอดโอน", "Transfer Amount"
- If you cannot read the amount clearly, return UNREADABLE
- If the image is not a bank slip, return INVALID

Return ONLY a JSON object with this exact structure:
{
  "detected_amount": <number or null>,
  "confidence": <0.0 to 1.0>,
  "is_valid_slip": <true or false>,
  "bank_name": "<detected bank name or null>",
  "transaction_date": "<detected date or null>",
  "notes": "<any relevant notes>"
}`;

    const userText = `Please analyze this bank transfer slip and extract the transfer amount. Expected amount is ${expectedAmount.toLocaleString()} THB.`;
    const schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
          detected_amount: {
            anyOf: [
              { type: 'number' },
              { type: 'null' },
            ],
          },
          confidence: { type: 'number' },
          is_valid_slip: { type: 'boolean' },
          bank_name: {
            anyOf: [
              { type: 'string' },
              { type: 'null' },
            ],
          },
          transaction_date: {
            anyOf: [
              { type: 'string' },
              { type: 'null' },
            ],
          },
          notes: {
            anyOf: [
              { type: 'string' },
              { type: 'null' },
            ],
          },
        },
        required: [
          'detected_amount',
          'confidence',
          'is_valid_slip',
          'bank_name',
          'transaction_date',
          'notes',
        ],
      };

    let parsed: any = null;
    let provider = LEGACY_MODEL;
    if (hasOpenAIKeys()) {
      try {
        parsed = await openaiStructuredJson<any>({
          system: systemPrompt,
          userText,
          images: [slipUrl],
          imageDetail: 'high',
          model: getOpenAILunaModel(),
          effort: getOpenAIReasoningEffortForTask('slip_verification'),
          schemaName: 'slip_verification',
          maxOutputTokens: 4000,
          schema,
          label: 'slip_verification',
          promptCacheKey: 'slip_verification',
        });
        if (parsed) provider = `openai:${getOpenAILunaModel()}`;
      } catch (error) {
        console.warn('🔁 OpenAI slip verification failed — falling back to Claude:', error);
      }
    }

    if (!parsed && hasAnthropicKeys()) {
      parsed = await anthropicStructured<any>({
        system: systemPrompt,
        userText,
        images: [slipUrl],
        model: getAnthropicVisionModel(),
        toolName: 'slip_verification',
        toolDescription: 'Return the extracted bank-slip details.',
        maxTokens: 700,
        schema,
      });
      provider = LEGACY_MODEL;
    }

    if (!parsed) {
      console.error('Failed to parse AI slip response');
      return {
        success: false,
        result: 'UNREADABLE',
        detectedAmount: null,
        expectedAmount,
        difference: null,
        confidenceScore: 0,
        message: 'ไม่สามารถอ่านข้อมูลจากสลิปได้ กรุณาถ่ายรูปใหม่ให้ชัดเจน',
        rawResponse: buildAiRawResponse(provider, null, true),
      };
    }

    const rawResponse = buildAiRawResponse(provider, parsed);

    if (!parsed.is_valid_slip) {
      return {
        success: false,
        result: 'INVALID',
        detectedAmount: null,
        expectedAmount,
        difference: null,
        confidenceScore: parsed.confidence || 0,
        message: 'รูปภาพนี้ไม่ใช่สลิปการโอนเงิน กรุณาอัพโหลดสลิปการโอนเงินที่ถูกต้อง',
        rawResponse,
      };
    }

    const detectedAmount = parseNumericAmount(parsed.detected_amount);

    if (detectedAmount === null) {
      return {
        success: false,
        result: 'UNREADABLE',
        detectedAmount: null,
        expectedAmount,
        difference: null,
        confidenceScore: parsed.confidence || 0,
        message: 'ไม่สามารถอ่านจำนวนเงินจากสลิปได้ กรุณาถ่ายรูปใหม่ให้ชัดเจน',
        rawResponse,
      };
    }

    const confidenceScore = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    const minConfidence = Math.max(
      0,
      Math.min(1, positiveNumber(process.env.AI_SLIP_MIN_CONFIDENCE, 0.85)),
    );
    if (confidenceScore < minConfidence) {
      return {
        success: false,
        result: 'UNREADABLE',
        detectedAmount,
        expectedAmount,
        difference: toRoundedAmount(detectedAmount - expectedAmount),
        confidenceScore,
        message: 'ระบบอ่านข้อมูลจากสลิปได้ไม่ชัดเจน กรุณาอัปโหลดรูปใหม่หรือรอเจ้าหน้าที่ตรวจสอบ',
        rawResponse: buildAiRawResponse(provider, parsed, true),
      };
    }

    const amountResult = buildAmountResult(detectedAmount, expectedAmount, tolerance, rawResponse);
    const production = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    const allowAiAutoApproval = !production && process.env.ALLOW_AI_SLIP_AUTO_APPROVAL === 'true';
    if (amountResult.result === 'MATCHED' && !allowAiAutoApproval) {
      return {
        ...amountResult,
        success: false,
        result: 'UNREADABLE',
        confidenceScore,
        message: 'ระบบอ่านยอดเงินได้แล้ว แต่ AI ไม่สามารถยืนยันความแท้จริงของสลิปได้ กรุณารอเจ้าหน้าที่ตรวจสอบ',
        rawResponse: buildAiRawResponse(provider, parsed, true),
      };
    }
    return {
      ...amountResult,
      confidenceScore,
    };
  } catch (error: any) {
    console.error('Slip verification error:', error);
    return {
      success: false,
      result: 'UNREADABLE',
      detectedAmount: null,
      expectedAmount,
      difference: null,
      confidenceScore: 0,
      message: 'เกิดข้อผิดพลาดในการตรวจสอบสลิป กรุณาลองใหม่อีกครั้ง',
      rawResponse: {
        provider: LEGACY_MODEL,
        errorKind: safeProviderCode(error?.name) || 'AI_PROVIDER_FAILURE',
      },
    };
  }
}

export async function verifyPaymentSlip(
  slipUrl: string,
  expectedAmount: number,
  optionsOrTolerance: number | VerifyPaymentSlipOptions = 0,
): Promise<SlipVerificationResult> {
  const options = parseVerifyOptions(optionsOrTolerance);
  const normalizedExpectedAmount = toRoundedAmount(Number(expectedAmount || 0));

  if (!slipUrl || !normalizedExpectedAmount) {
    return {
      success: false,
      result: 'UNREADABLE',
      detectedAmount: null,
      expectedAmount: normalizedExpectedAmount,
      difference: null,
      confidenceScore: 0,
      message: 'ข้อมูลสลิปไม่ครบถ้วน',
      rawResponse: {
        provider: getSlipOkConfig().enabled ? SLIPOK_PROVIDER : LEGACY_MODEL,
        errorKind: 'INVALID_REQUEST',
      },
    };
  }

  const config = getSlipOkConfig();
  if (config.enabled) {
    return verifyWithSlipOk(slipUrl, normalizedExpectedAmount, options);
  }

  return verifyWithAIVision(slipUrl, normalizedExpectedAmount, options.tolerance);
}

// Save slip verification to database
export async function saveSlipVerification(
  actionRequestId: string | null,
  redemptionId: string | null,
  slipUrl: string,
  expectedAmount: number,
  result: SlipVerificationResult,
  attemptNumber: number = 1
) {
  const supabase = supabaseAdmin();
  const persistedRawResponse = sanitizePersistedRawResponse(result.rawResponse);
  const provider = typeof persistedRawResponse.provider === 'string'
    ? persistedRawResponse.provider
    : (getSlipOkConfig().enabled ? SLIPOK_PROVIDER : LEGACY_MODEL);
  const rawResponseText = JSON.stringify(persistedRawResponse);

  const { data, error } = await supabase
    .from('slip_verifications')
    .insert({
      action_request_id: actionRequestId,
      redemption_id: redemptionId,
      slip_url: slipUrl,
      expected_amount: expectedAmount,
      detected_amount: result.detectedAmount,
      amount_difference: result.difference,
      verification_result: result.result,
      confidence_score: result.confidenceScore,
      ai_model: provider,
      ai_response: persistedRawResponse,
      ai_raw_response: rawResponseText,
      attempt_number: attemptNumber,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving slip verification:', error);
  }

  return data;
}

// Log contract action
export async function logContractAction(
  contractId: string,
  actionType: string,
  actionStatus: string,
  performedBy: string,
  performedByLineId: string | null,
  options?: {
    actionRequestId?: string;
    amount?: number;
    principalBefore?: number;
    principalAfter?: number;
    interestBefore?: number;
    interestAfter?: number;
    contractEndDateBefore?: string;
    contractEndDateAfter?: string;
    slipUrl?: string;
    slipAmountDetected?: number | null;
    slipVerificationResult?: string;
    slipVerificationDetails?: any;
    performedByName?: string;
    description?: string;
    metadata?: any;
    errorMessage?: string;
    rejectionReason?: string;
  }
) {
  const supabase = supabaseAdmin();

  const { data: contract } = await supabase
    .from('contracts')
    .select('customer_id, investor_id, current_principal_amount')
    .eq('contract_id', contractId)
    .single();

  const { data, error } = await supabase
    .from('contract_action_logs')
    .insert({
      contract_id: contractId,
      customer_id: contract?.customer_id,
      investor_id: contract?.investor_id,
      action_request_id: options?.actionRequestId,
      action_type: actionType,
      action_status: actionStatus,
      amount: options?.amount,
      principal_before: options?.principalBefore || contract?.current_principal_amount,
      principal_after: options?.principalAfter,
      interest_before: options?.interestBefore,
      interest_after: options?.interestAfter,
      contract_end_date_before: options?.contractEndDateBefore,
      contract_end_date_after: options?.contractEndDateAfter,
      slip_url: options?.slipUrl,
      slip_amount_detected: options?.slipAmountDetected,
      slip_verification_result: options?.slipVerificationResult,
      slip_verification_details: options?.slipVerificationDetails,
      performed_by: performedBy,
      performed_by_line_id: performedByLineId,
      performed_by_name: options?.performedByName,
      description: options?.description,
      metadata: options?.metadata,
      error_message: options?.errorMessage,
    })
    .select()
    .single();

  if (error) {
    console.error('Error logging contract action:', error);
  }

  return data;
}

// Get company bank account
export async function getCompanyBankAccount() {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from('company_bank_accounts')
    .select('*')
    .eq('is_active', true)
    .eq('is_default', true)
    .single();

  if (error || !data) {
    return {
      bank_name: 'พร้อมเพย์',
      bank_account_no: '0626092941',
      bank_account_name: 'ณัฐภัทร ต้อยจัตุรัส',
      promptpay_number: '0626092941',
    };
  }

  return data;
}
