import { NextRequest, NextResponse } from 'next/server';
import { cancelEstimateJob, getEstimateJob } from '@/lib/services/estimate-jobs';
import { jobAuthErrorResponse, requirePawnerJobOwner } from '@/lib/security/job-owner';

// Cancel a queued/processing estimate job. The pipeline run cannot be
// aborted mid-LLM-call, but the job is marked CANCELLED so its result is
// discarded and the client stops polling. (The internal estimate cache still
// gets warmed, so a re-run of the same item is fast.)
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  const { jobId } = await context.params;
  if (!jobId || !/^[0-9a-f-]{16,64}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const existing = await getEstimateJob(jobId);
  if (!existing) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  try {
    await requirePawnerJobOwner(request, existing.lineId);
  } catch (error) {
    const failure = jobAuthErrorResponse(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }

  const job = await cancelEstimateJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  return NextResponse.json({ jobId: job.jobId, status: job.status });
}
