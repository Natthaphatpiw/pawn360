import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  InternalAuthError,
  internalAuthErrorResponse,
  requireInternalRequest,
} from '@/lib/security/request-auth';
import {
  readBoundedJsonObject,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

/**
 * API to trigger automatic loan contract generation when contract status becomes CONFIRMED
 * This will be called by Supabase webhook or database trigger
 */
export async function POST(request: NextRequest) {
  try {
    requireInternalRequest(request);
    const body = await readBoundedJsonObject(request, 16 * 1024);
    const contractId = requireUuid(body.contractId);

    const supabase = supabaseAdmin();

    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('contract_id, contract_status, contract_file_url')
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'ไม่พบสัญญา', code: 'CONTRACT_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Check if contract is CONFIRMED
    if (contract.contract_status !== 'CONFIRMED') {
      return NextResponse.json({
        success: false,
        message: 'Contract is not CONFIRMED yet',
        status: contract.contract_status
      });
    }

    // Check if loan contract already exists
    if (contract.contract_file_url) {
      return NextResponse.json({
        success: true,
        message: 'Pawn ticket already generated',
        url: contract.contract_file_url,
        skipped: true
      });
    }

    // Generate loan contract URL for frontend to access
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://astly.io';
    const ticketUrl = `${baseUrl}/pawn-ticket/${contractId}`;

    // Return instruction for manual generation (since we can't use Puppeteer on Vercel)
    // The frontend will need to access this URL to generate and upload the image
    return NextResponse.json({
      success: true,
      message: 'Contract confirmed. Pawn ticket can be generated.',
      contractId,
      ticketUrl,
      instruction: 'Frontend should access ticket URL and trigger save to generate image'
    });

  } catch (error: unknown) {
    if (error instanceof InternalAuthError) return internalAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    console.error('[contract:auto-generate-ticket] failed');
    return sanitizedServerError();
  }
}
