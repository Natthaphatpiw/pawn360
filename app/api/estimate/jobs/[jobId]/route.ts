import { NextRequest, NextResponse } from 'next/server';
import { getEstimateJob } from '@/lib/services/estimate-jobs';

// Poll an estimate job. Terminal states: COMPLETED (with result),
// FAILED (with error/code), CANCELLED.
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  const { jobId } = await context.params;
  if (!jobId || !/^[0-9a-f-]{16,64}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const job = await getEstimateJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.jobId,
    status: job.status,
    createdAtMs: job.createdAtMs,
    startedAtMs: job.startedAtMs ?? null,
    finishedAtMs: job.finishedAtMs ?? null,
    attempts: job.attempts,
    ...(job.status === 'COMPLETED' ? { result: job.result } : {}),
    ...(job.status === 'FAILED'
      ? { error: job.error, code: job.errorCode ?? null, httpStatus: job.httpStatus ?? null }
      : {}),
  });
}
