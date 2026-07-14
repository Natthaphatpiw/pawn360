import { NextRequest, NextResponse } from 'next/server';
import { cancelConditionJob } from '@/lib/services/analyze-condition-jobs';

// Cancel a queued/processing condition job. The vision call cannot be aborted
// mid-flight, but the job is marked CANCELLED so its result is discarded and
// the client stops polling.
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  const { jobId } = await context.params;
  if (!jobId || !/^[0-9a-f-]{16,64}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const job = await cancelConditionJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  return NextResponse.json({ jobId: job.jobId, status: job.status });
}
