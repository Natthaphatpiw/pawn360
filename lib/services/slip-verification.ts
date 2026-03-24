import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase/client';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const LEGACY_MODEL = 'gpt-4.1-mini';
const SLIPOK_PROVIDER = 'slipok';
const SLIPOK_BASE_URL = 'https://api.slipok.com/api/line/apikey';

function getResponseText(response: any): string {
  if (typeof response?.output_text === 'string') {
    return response.output_text;
  }

  if (!Array.isArray(response?.output)) {
    return '';
  }

  return response.output
    .filter((item: any) => item?.type === 'message')
    .flatMap((item: any) => item?.content || [])
    .filter((part: any) => part?.type === 'output_text' && typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('\n');
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

function buildBaseRawResponse(extra: Record<string, any>) {
  return {
    provider: SLIPOK_PROVIDER,
    ...extra,
  };
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
  const fileResponse = await fetch(slipUrl, { cache: 'no-store' });

  if (!fileResponse.ok) {
    throw new Error(`Failed to fetch slip image (${fileResponse.status})`);
  }

  const contentType = fileResponse.headers.get('content-type') || 'image/jpeg';
  const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
  const formData = new FormData();
  const extension = getFileExtension(contentType);

  formData.append('files', new Blob([fileBuffer], { type: contentType }), `slip.${extension}`);
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
    });

    httpStatus = response.status;
    const responseText = await response.text();

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
        error: error?.message || 'SlipOK request failed',
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

async function verifyWithLegacyVision(
  slipUrl: string,
  expectedAmount: number,
  tolerance: number,
): Promise<SlipVerificationResult> {
  try {
    if (!openai) {
      return {
        success: false,
        result: 'UNREADABLE',
        detectedAmount: null,
        expectedAmount,
        difference: null,
        confidenceScore: 0,
        message: 'OpenAI API key not configured',
        rawResponse: { error: 'OPENAI_API_KEY not set' },
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

    const response = await openai.responses.create({
      model: LEGACY_MODEL,
      input: [
        {
          role: 'system',
          content: [
            { type: 'input_text', text: systemPrompt },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Please analyze this bank transfer slip and extract the transfer amount. Expected amount is ${expectedAmount.toLocaleString()} THB.`,
            },
            {
              type: 'input_image',
              image_url: slipUrl,
              detail: 'high',
            },
          ],
        },
      ],
      max_output_tokens: 500,
      text: {
        format: {
          type: 'json_schema',
          name: 'slip_verification',
          strict: true,
          schema: {
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
          },
        },
      },
    });

    const content = getResponseText(response);

    let parsed: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch {
      console.error('Failed to parse AI response:', content);
      return {
        success: false,
        result: 'UNREADABLE',
        detectedAmount: null,
        expectedAmount,
        difference: null,
        confidenceScore: 0,
        message: 'ไม่สามารถอ่านข้อมูลจากสลิปได้ กรุณาถ่ายรูปใหม่ให้ชัดเจน',
        rawResponse: {
          provider: LEGACY_MODEL,
          content,
        },
      };
    }

    const rawResponse = {
      provider: LEGACY_MODEL,
      data: parsed,
    };

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

    const amountResult = buildAmountResult(detectedAmount, expectedAmount, tolerance, rawResponse);
    return {
      ...amountResult,
      confidenceScore: parsed.confidence || amountResult.confidenceScore,
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
        error: error.message,
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
        error: 'Missing slip url or expected amount',
      },
    };
  }

  const config = getSlipOkConfig();
  if (config.enabled) {
    return verifyWithSlipOk(slipUrl, normalizedExpectedAmount, options);
  }

  return verifyWithLegacyVision(slipUrl, normalizedExpectedAmount, options.tolerance);
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
  const provider = typeof result.rawResponse?.provider === 'string'
    ? result.rawResponse.provider
    : (getSlipOkConfig().enabled ? SLIPOK_PROVIDER : LEGACY_MODEL);
  const rawResponseText = (() => {
    if (typeof result.rawResponse === 'string') {
      return result.rawResponse;
    }
    try {
      return JSON.stringify(result.rawResponse ?? null);
    } catch {
      return null;
    }
  })();

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
      ai_response: result.rawResponse,
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
