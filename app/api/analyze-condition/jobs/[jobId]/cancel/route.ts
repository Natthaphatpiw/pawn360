import { NextRequest, NextResponse } from 'next/server';
import { cancelConditionJob, getConditionJob } from '@/lib/services/analyze-condition-jobs';
import { jobAuthErrorResponse, requirePawnerJobOwner } from '@/lib/security/job-owner';

// Cancel a queued/processing condition job. The vision call cannot be aborted
// mid-flight, but the job is marked CANCELLED so its result is discarded and
// the client stops polling.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  const { jobId } = await context.params;
  if (!jobId || !/^[0-9a-f-]{16,64}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const existing = await getConditionJob(jobId);
  if (!existing) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  try {
    await requirePawnerJobOwner(request, existing.lineId);
  } catch (error) {
    const failure = jobAuthErrorResponse(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }

  const job = await cancelConditionJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  return NextResponse.json({ jobId: job.jobId, status: job.status });
}
