import { NextRequest, NextResponse, after } from 'next/server';
import { EstimateRequest } from '@/lib/services/estimate-pipeline';
import {
  createEstimateJob,
  dispatchEstimateJobViaVercel,
  dispatchEstimateJobViaQstash,
  failEstimateJobDispatch,
  getEstimateJobDispatchMode,
  isEstimateJobStoreAvailable,
  processEstimateJob,
} from '@/lib/services/estimate-jobs';
import { jobAuthErrorResponse, requirePawnerJobIdentity } from '@/lib/security/job-owner';
import { getConditionJob } from '@/lib/services/analyze-condition-jobs';
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
import { validateEstimateJobInput } from '@/lib/security/ai-job-input';

// In 'waituntil' mode the job is processed in this function's background time
// (after the 202 goes out), so it needs the full pipeline budget.
export const maxDuration = 300;

function normalized(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function sameImages(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const a = left.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).sort();
  const b = right.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

// Enqueue an estimate job. Responds immediately with a jobId; the client
// polls GET /api/estimate/jobs/[jobId]. If the job store (Redis) is not
// configured, responds 503 so the client can fall back to the synchronous
// POST /api/estimate.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_QUEUE_REQUEST_BODY_BYTES) {
    return NextResponse.json(
      { error: 'กรุณาอัพโหลดรูปภาพก่อนส่งคำขอประเมิน', code: 'image_upload_required' },
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
  const inputValidation = validateEstimateJobInput(rawBody);
  if (!inputValidation.ok) {
    return NextResponse.json(
      { error: inputValidation.error, code: inputValidation.code },
      { status: inputValidation.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const body: EstimateRequest = inputValidation.value;

  try {
    const identity = await requirePawnerJobIdentity(request, body?.lineId);
    body.lineId = identity.lineId;
    await enforceAIJobRateLimit(identity.lineId, 'estimate');
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

  // Fail fast on the same required fields as the pipeline, before queueing.
  if (!body || !body.itemType || !body.brand || !body.model || !body.lineId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  const imageValidation = validateQueuedImageUrls(body.images);
  if (!imageValidation.ok) {
    return NextResponse.json(
      { error: imageValidation.error, code: imageValidation.code },
      { status: imageValidation.status }
    );
  }
  body.images = imageValidation.images;

  // The browser must not be authoritative for the paid condition score. Bind
  // the estimate to a completed condition job owned by the same LIFF subject
  // and covering the same product/images, then overwrite the client value.
  const conditionJobId = typeof body.conditionJobId === 'string'
    ? body.conditionJobId.trim()
    : '';
  const conditionBindingRequired = process.env.NODE_ENV === 'production'
    || process.env.VERCEL_ENV === 'production';
  if (!conditionJobId || !/^[0-9a-f-]{16,64}$/i.test(conditionJobId)) {
    if (conditionBindingRequired) {
      return NextResponse.json(
        {
          error: 'กรุณาวิเคราะห์สภาพสินค้าใหม่ก่อนประเมินราคา',
          code: 'condition_job_required',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  } else {
    const conditionJob = await getConditionJob(conditionJobId);
    const conditionResult = conditionJob?.status === 'COMPLETED' ? conditionJob.result : null;
    const bindingMatches = Boolean(
      conditionJob
      && conditionResult
      && conditionJob.lineId === body.lineId
      && conditionJob.request
      && normalized(conditionJob.request.itemType) === normalized(body.itemType)
      && normalized(conditionJob.request.brand) === normalized(body.brand)
      && normalized(conditionJob.request.model) === normalized(body.model)
      && sameImages(conditionJob.request.images, body.images)
    );
    if (!bindingMatches) {
      return NextResponse.json(
        {
          error: 'ผลวิเคราะห์สภาพไม่ตรงกับสินค้าที่กำลังประเมิน กรุณาวิเคราะห์ใหม่อีกครั้ง',
          code: 'condition_job_mismatch',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    body.aiCondition = Number(conditionResult!.score);
  }

  if (!isEstimateJobStoreAvailable()) {
    return NextResponse.json(
      { error: 'Estimate job queue unavailable', code: 'job_store_unavailable' },
      { status: 503 }
    );
  }

  const rawIdempotencyKey = request.headers.get('idempotency-key')?.trim();
  const idempotencyKey = rawIdempotencyKey && rawIdempotencyKey.length <= 128
    ? rawIdempotencyKey
    : undefined;
  const job = await createEstimateJob(body, idempotencyKey);
  if (!job) {
    return NextResponse.json(
      { error: 'Failed to enqueue estimate job', code: 'job_store_unavailable' },
      { status: 503 }
    );
  }

  let mode = getEstimateJobDispatchMode();
  if (mode === 'vercel') {
    try {
      await dispatchEstimateJobViaVercel(job.jobId, body);
    } catch (error) {
      console.error('Vercel Queue estimate dispatch failed:', error);
      await failEstimateJobDispatch(job.jobId).catch(() => {});
      return NextResponse.json(
        {
          error: 'ระบบคิวประเมินราคาไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง',
          code: 'queue_unavailable',
          retryAfterSeconds: 30,
        },
        { status: 503, headers: { 'Retry-After': '30' } }
      );
    }
  } else if (mode === 'qstash') {
    try {
      await dispatchEstimateJobViaQstash(job.jobId);
    } catch (error) {
      console.error('QStash estimate dispatch failed:', error);
      if (process.env.VERCEL_ENV === 'production') {
        await failEstimateJobDispatch(job.jobId).catch(() => {});
        return NextResponse.json(
          { error: 'ระบบคิวประเมินราคาไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง', code: 'queue_unavailable' },
          { status: 503, headers: { 'Retry-After': '30' } }
        );
      }
      mode = 'waituntil';
    }
  }
  if (mode === 'waituntil') {
    after(() => processEstimateJob(job.jobId));
  }

  return NextResponse.json({ jobId: job.jobId, status: job.status, dispatcher: mode }, { status: 202 });
}
