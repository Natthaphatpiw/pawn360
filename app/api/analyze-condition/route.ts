import { NextRequest, NextResponse } from 'next/server';
import {
  AnalyzeConditionRequest,
  runAnalyzeConditionPipeline,
} from '@/lib/services/analyze-condition-pipeline';
import { validateConditionJobInput } from '@/lib/security/ai-job-input';
import {
  MAX_QUEUE_REQUEST_BODY_BYTES,
  validateQueuedImageUrls,
} from '@/lib/security/queued-images';
import { readBoundedJsonObject, transactionRequestErrorResponse } from '@/lib/security/transaction-request';

// Precheck + condition scoring use OpenAI gpt-5.6-luna (none/low reasoning),
// with Claude vision retained as the provider fallback.
// can take 30-60s. Prefer the async job flow (POST /api/analyze-condition/jobs)
// from UIs — this synchronous route remains for back-compat and scripts.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (
    (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production')
    && process.env.ALLOW_SYNCHRONOUS_AI_ROUTES !== 'true'
  ) {
    return NextResponse.json(
      {
        error: 'กรุณาส่งงานผ่านระบบคิววิเคราะห์สภาพ',
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
  const validation = validateConditionJobInput(rawBody);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error, code: validation.code },
      { status: validation.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const body: AnalyzeConditionRequest = validation.value;
  const imageValidation = validateQueuedImageUrls(body.images);
  if (!imageValidation.ok) {
    return NextResponse.json(
      { error: imageValidation.error, code: imageValidation.code },
      { status: imageValidation.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  body.images = imageValidation.images;

  const result = await runAnalyzeConditionPipeline(body);
  if (result.ok) {
    return NextResponse.json(result.payload);
  }
  return NextResponse.json(
    { error: result.error, ...(result.code ? { code: result.code } : {}) },
    { status: result.status }
  );
}
