import { NextRequest, NextResponse, after } from 'next/server';
import { AnalyzeConditionRequest } from '@/lib/services/analyze-condition-pipeline';
import {
  createConditionJob,
  dispatchConditionJobViaVercel,
  dispatchConditionJobViaQstash,
  failConditionJobDispatch,
  getConditionJobDispatchMode,
  isConditionJobStoreAvailable,
  processConditionJob,
} from '@/lib/services/analyze-condition-jobs';
import { jobAuthErrorResponse, requirePawnerJobIdentity } from '@/lib/security/job-owner';
import {
  aiJobRateLimitResponse,
  enforceAIJobRateLimit,
  JobRateLimitError,
} from '@/lib/security/job-rate-limit';
import {
  MAX_QUEUE_REQUEST_BODY_BYTES,
  validateQueuedImageUrls,
} from '@/lib/security/queued-images';
import {
  readBoundedJsonObject,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';
import { validateConditionJobInput } from '@/lib/security/ai-job-input';

// In 'waituntil' mode the job runs in this function's background time (after
// the 202 goes out), so it needs the full pipeline budget.
export const maxDuration = 300;

// Enqueue a condition-scoring job. Responds immediately with a jobId; the
// client polls GET /api/analyze-condition/jobs/[jobId]. If the job store
// (Redis) is unavailable, responds 503 so the client can fall back to the
// synchronous POST /api/analyze-condition.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_QUEUE_REQUEST_BODY_BYTES) {
    return NextResponse.json(
      { error: 'กรุณาอัพโหลดรูปภาพก่อนส่งคำขอวิเคราะห์', code: 'image_upload_required' },
      { status: 413 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await readBoundedJsonObject(
      request,
      MAX_QUEUE_REQUEST_BODY_BYTES,
    );
  } catch (error) {
    const boundedError = transactionRequestErrorResponse(error);
    if (boundedError) {
      return new NextResponse(boundedError.body, {
        status: boundedError.status,
        headers: boundedError.headers,
      });
    }
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const inputValidation = validateConditionJobInput(rawBody);
  if (!inputValidation.ok) {
    return NextResponse.json(
      { error: inputValidation.error, code: inputValidation.code },
      { status: inputValidation.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const body: AnalyzeConditionRequest = inputValidation.value;

  let verifiedLineId: string;
  try {
    const identity = await requirePawnerJobIdentity(request, body?.lineId);
    verifiedLineId = identity.lineId;
    await enforceAIJobRateLimit(identity.lineId, 'condition');
  } catch (error) {
    if (error instanceof JobRateLimitError) {
      const failure = aiJobRateLimitResponse(error);
      return NextResponse.json(failure.body, {
        status: failure.status,
        headers: failure.headers,
      });
    }
    const failure = jobAuthErrorResponse(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }
  body.lineId = verifiedLineId;

  const imageValidation = validateQueuedImageUrls(body.images);
  if (!imageValidation.ok) {
    return NextResponse.json(
      { error: imageValidation.error, code: imageValidation.code },
      { status: imageValidation.status }
    );
  }
  body.images = imageValidation.images;
  if (!body.itemType || typeof body.itemType !== 'string') {
    return NextResponse.json({ error: 'กรุณาเลือกประเภทสินค้าให้ถูกต้อง' }, { status: 400 });
  }

  if (!isConditionJobStoreAvailable()) {
    return NextResponse.json(
      { error: 'Condition job queue unavailable', code: 'job_store_unavailable' },
      { status: 503 }
    );
  }

  const rawIdempotencyKey = request.headers.get('idempotency-key')?.trim();
  const idempotencyKey = rawIdempotencyKey && rawIdempotencyKey.length <= 128
    ? rawIdempotencyKey
    : undefined;
  const job = await createConditionJob(body, idempotencyKey);
  if (!job) {
    return NextResponse.json(
      { error: 'Failed to enqueue condition job', code: 'job_store_unavailable' },
      { status: 503 }
    );
  }

  let mode = getConditionJobDispatchMode();
  if (mode === 'vercel') {
    try {
      await dispatchConditionJobViaVercel(job.jobId, body);
    } catch (error) {
      console.error('Vercel Queue condition dispatch failed:', error);
      await failConditionJobDispatch(job.jobId).catch(() => {});
      return NextResponse.json(
        {
          error: 'ระบบคิววิเคราะห์สภาพไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง',
          code: 'queue_unavailable',
          retryAfterSeconds: 30,
        },
        { status: 503, headers: { 'Retry-After': '30' } }
      );
    }
  } else if (mode === 'qstash') {
    try {
      await dispatchConditionJobViaQstash(job.jobId);
    } catch (error) {
      console.error('QStash condition dispatch failed:', error);
      if (process.env.VERCEL_ENV === 'production') {
        await failConditionJobDispatch(job.jobId).catch(() => {});
        return NextResponse.json(
          { error: 'ระบบคิววิเคราะห์สภาพไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง', code: 'queue_unavailable' },
          { status: 503, headers: { 'Retry-After': '30' } }
        );
      }
      mode = 'waituntil';
    }
  }
  if (mode === 'waituntil') {
    after(() => processConditionJob(job.jobId));
  }

  return NextResponse.json({ jobId: job.jobId, status: job.status, dispatcher: mode }, { status: 202 });
}
