import { NextRequest, NextResponse } from 'next/server';
import {
  EstimateRequest,
  EstimateResponse,
  runEstimatePipeline,
} from '@/lib/services/estimate-pipeline';
import { validateEstimateJobInput } from '@/lib/security/ai-job-input';
import {
  MAX_QUEUE_REQUEST_BODY_BYTES,
  validateQueuedImageUrls,
} from '@/lib/security/queued-images';
import { readBoundedJsonObject, transactionRequestErrorResponse } from '@/lib/security/transaction-request';

// The pipeline does live web search + several LLM calls (~1-2 minutes for
// notebooks). Allow up to 5 minutes on Vercel. Prefer the async job flow
// (POST /api/estimate/jobs) from UIs — this synchronous route remains for
// backward compatibility and scripts.
export const maxDuration = 300;

export async function POST(
  request: NextRequest
): Promise<NextResponse<EstimateResponse | { error: string; code?: string }>> {
  if (
    (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production')
    && process.env.ALLOW_SYNCHRONOUS_AI_ROUTES !== 'true'
  ) {
    return NextResponse.json(
      {
        error: 'กรุณาส่งงานผ่านระบบคิวประเมินราคา',
        code: 'queue_required',
      },
      { status: 409, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await readBoundedJsonObject(request, MAX_QUEUE_REQUEST_BODY_BYTES);
  } catch (error) {
    const failure = transactionRequestErrorResponse(error);
    if (failure) {
      return new NextResponse(failure.body, { status: failure.status, headers: failure.headers });
    }
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const validation = validateEstimateJobInput(rawBody);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error, code: validation.code },
      { status: validation.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const body: EstimateRequest = validation.value;
  const imageValidation = validateQueuedImageUrls(body.images);
  if (!imageValidation.ok) {
    return NextResponse.json(
      { error: imageValidation.error, code: imageValidation.code },
      { status: imageValidation.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  body.images = imageValidation.images;

  const result = await runEstimatePipeline(body);
  if (result.ok) {
    return NextResponse.json(result.payload);
  }
  return NextResponse.json(
    { error: result.error, ...(result.code ? { code: result.code } : {}) },
    { status: result.status }
  );
}
