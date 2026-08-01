import { NextRequest } from 'next/server';
import { ekycErrorResponse, initiateEkyc } from '@/lib/ekyc/initiate';
import { EkycPublicError } from '@/lib/ekyc/types';
import { LiffAuthError } from '@/lib/security/liff-auth';

export async function POST(request: NextRequest) {
  try {
    return await initiateEkyc(request, 'INVESTOR');
  } catch (error) {
    // Do not log request bodies, LINE tokens, provider responses, or identity data.
    console.error('Asset Funding eKYC initiation failed', {
      code: error instanceof EkycPublicError || error instanceof LiffAuthError
        ? error.code
        : 'EKYC_INTERNAL_ERROR',
    });
    return ekycErrorResponse(error);
  }
}
