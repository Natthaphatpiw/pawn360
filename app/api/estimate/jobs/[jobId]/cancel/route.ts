import { NextRequest, NextResponse } from 'next/server';
import { cancelEstimateJob } from '@/lib/services/estimate-jobs';

// Cancel a queued/processing estimate job. The pipeline run cannot be
// aborted mid-LLM-call, but the job is marked CANCELLED so its result is
// discarded and the client stops polling. (The internal estimate cache still
// gets warmed, so a re-run of the same item is fast.)
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  const { jobId } = await context.params;
  if (!jobId || !/^[0-9a-f-]{16,64}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const job = await cancelEstimateJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  return NextResponse.json({ jobId: job.jobId, status: job.status });
}
