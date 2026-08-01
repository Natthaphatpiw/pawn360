import { NextRequest, NextResponse } from 'next/server';
import { getConditionJob } from '@/lib/services/analyze-condition-jobs';
import { jobAuthErrorResponse, requirePawnerJobOwner } from '@/lib/security/job-owner';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };

// Poll a condition-scoring job. Terminal states: COMPLETED (with result),
// FAILED (with error/code), CANCELLED.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  const { jobId } = await context.params;
  if (!jobId || !/^[0-9a-f-]{16,64}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const job = await getConditionJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404, headers: PRIVATE_HEADERS });
  }

  try {
    await requirePawnerJobOwner(request, job.lineId);
  } catch (error) {
    const failure = jobAuthErrorResponse(error);
    return NextResponse.json(failure.body, { status: failure.status, headers: PRIVATE_HEADERS });
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
    ...(job.status === 'COMPLETED' ? { result: job.result } : {}),
    ...(job.status === 'FAILED'
      ? { error: job.error, code: job.errorCode ?? null, httpStatus: job.httpStatus ?? null }
      : {}),
  }, { headers: PRIVATE_HEADERS });
}
