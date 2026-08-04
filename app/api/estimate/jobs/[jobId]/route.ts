import { NextRequest, NextResponse } from 'next/server';
import { getEstimateJob } from '@/lib/services/estimate-jobs';
import { jobAuthErrorResponse, requirePawnerJobOwner } from '@/lib/security/job-owner';
import {
  estimateRequiresManualReview,
  EstimateAttestationError,
  estimateAttestationErrorResponse,
  issueEstimateAttestation,
} from '@/lib/security/estimate-attestation';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };

// Poll an estimate job. Terminal states: COMPLETED (with result),
// FAILED (with error/code), CANCELLED.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  const { jobId } = await context.params;
  if (!jobId || !/^[0-9a-f-]{16,64}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const job = await getEstimateJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404, headers: PRIVATE_HEADERS });
  }

  try {
    await requirePawnerJobOwner(request, job.lineId);
  } catch (error) {
    const failure = jobAuthErrorResponse(error);
    return NextResponse.json(failure.body, { status: failure.status, headers: PRIVATE_HEADERS });
  }

  let completedResult = job.result;
  if (job.status === 'COMPLETED' && (!job.result || !job.request || !job.lineId)) {
    return NextResponse.json(
      {
        error: 'ไม่สามารถยืนยันผลประเมินได้ กรุณาประเมินสินค้าใหม่อีกครั้ง',
        code: 'estimate_attestation_source_missing',
        retryable: false,
      },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (job.status === 'COMPLETED' && job.result && job.request && job.lineId) {
    try {
      completedResult = {
        ...job.result,
        jobId: job.jobId,
        estimateAttestation: issueEstimateAttestation({
          referenceId: job.jobId,
          lineId: job.lineId,
          request: job.request,
          result: job.result,
          aiCondition: job.request.aiCondition,
          source: 'AI',
        }),
        // Kept in the response for observability only - the pricing ladder
        // always yields a quotable number now, so nothing gates submission on
        // it. See lib/services/fallback-pricing.ts.
        requiresManualReview: false,
      };
    } catch (error) {
      if (error instanceof EstimateAttestationError) {
        return NextResponse.json(estimateAttestationErrorResponse(error), {
          status: error.status,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
        });
      }
      throw error;
    }
  }

  return NextResponse.json({
    jobId: job.jobId,
    status: job.status,
    createdAtMs: job.createdAtMs,
    startedAtMs: job.startedAtMs ?? null,
    finishedAtMs: job.finishedAtMs ?? null,
    attempts: job.attempts,
    ...(job.status === 'RETRYING'
      ? {
          message: 'ผู้ให้บริการกำลังมีผู้ใช้งานจำนวนมาก งานของคุณยังอยู่ในคิวและระบบจะลองใหม่อัตโนมัติ',
          nextRetryAtMs: job.nextRetryAtMs ?? null,
          pollAfterMs: 10_000,
        }
      : { pollAfterMs: job.status === 'QUEUED' ? 5_000 : 3_000 }),
    ...(job.status === 'COMPLETED' ? { result: completedResult } : {}),
    ...(job.status === 'FAILED'
      ? { error: job.error, code: job.errorCode ?? null, httpStatus: job.httpStatus ?? null }
      : {}),
  }, { headers: PRIVATE_HEADERS });
}
