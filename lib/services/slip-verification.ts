import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase/client';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

export async function verifyPaymentSlip(
  slipUrl: string,
  expectedAmount: number,
  tolerance: number = 0 // ยอมรับความคลาดเคลื่อน (บาท)
): Promise<SlipVerificationResult> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: `You are a Thai bank transfer slip analyzer. Your task is to:
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
}`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Please analyze this bank transfer slip and extract the transfer amount. Expected amount is ${expectedAmount.toLocaleString()} THB.`
            },
            {
              type: 'image_url',
              image_url: {
                url: slipUrl,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '';

    // Parse JSON response
    let parsed: any;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      return {
        success: false,
        result: 'UNREADABLE',
        detectedAmount: null,
        expectedAmount,
        difference: null,
        confidenceScore: 0,
        message: 'ไม่สามารถอ่านข้อมูลจากสลิปได้ กรุณาถ่ายรูปใหม่ให้ชัดเจน',
        rawResponse: content,
      };
    }

    // Check if valid slip
    if (!parsed.is_valid_slip) {
      return {
        success: false,
        result: 'INVALID',
        detectedAmount: null,
        expectedAmount,
        difference: null,
        confidenceScore: parsed.confidence || 0,
        message: 'รูปภาพนี้ไม่ใช่สลิปการโอนเงิน กรุณาอัพโหลดสลิปการโอนเงินที่ถูกต้อง',
        rawResponse: parsed,
      };
    }

    const detectedAmount = parsed.detected_amount;

    // Check if amount was detected
    if (detectedAmount === null || detectedAmount === undefined) {
      return {
        success: false,
        result: 'UNREADABLE',
        detectedAmount: null,
        expectedAmount,
        difference: null,
        confidenceScore: parsed.confidence || 0,
        message: 'ไม่สามารถอ่านจำนวนเงินจากสลิปได้ กรุณาถ่ายรูปใหม่ให้ชัดเจน',
        rawResponse: parsed,
      };
    }

    const difference = detectedAmount - expectedAmount;

    // Check if amount matches (within tolerance)
    if (Math.abs(difference) <= tolerance) {
      return {
        success: true,
        result: 'MATCHED',
        detectedAmount,
        expectedAmount,
        difference: 0,
        confidenceScore: parsed.confidence || 0.9,
        message: 'ยอดเงินถูกต้อง',
        rawResponse: parsed,
      };
    }

    // Check if overpaid (acceptable)
    if (difference > 0) {
      return {
        success: true,
        result: 'OVERPAID',
        detectedAmount,
        expectedAmount,
        difference,
        confidenceScore: parsed.confidence || 0.9,
        message: `ยอดเงินที่โอนมากกว่าที่กำหนด ${difference.toLocaleString()} บาท`,
        rawResponse: parsed,
      };
    }

    // Underpaid
    return {
      success: false,
      result: 'UNDERPAID',
      detectedAmount,
      expectedAmount,
      difference,
      confidenceScore: parsed.confidence || 0.9,
      message: `ยอดเงินที่โอนขาดไป ${Math.abs(difference).toLocaleString()} บาท`,
      rawResponse: parsed,
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
      rawResponse: { error: error.message },
    };
  }
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
      ai_model: 'gpt-4.1-mini',
      ai_response: result.rawResponse,
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
    slipAmountDetected?: number;
    slipVerificationResult?: string;
    slipVerificationDetails?: any;
    performedByName?: string;
    description?: string;
    metadata?: any;
    errorMessage?: string;
  }
) {
  const supabase = supabaseAdmin();

  // Get contract details
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
    // Return hardcoded default if not in database
    return {
      bank_name: 'พร้อมเพย์',
      bank_account_no: '0626092941',
      bank_account_name: 'ณัฐภัทร ต้อยจัตุรัส',
      promptpay_number: '0626092941',
    };
  }

  return data;
}
