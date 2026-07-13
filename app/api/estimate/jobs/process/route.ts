import { NextRequest, NextResponse } from 'next/server';
import { processEstimateJob } from '@/lib/services/estimate-jobs';

// QStash worker endpoint (ESTIMATE_JOB_DISPATCHER=qstash). QStash forwards
// our shared secret via Upstash-Forward-X-Estimate-Worker-Secret, which
// arrives here as the X-Estimate-Worker-Secret header. Not used in the
// default 'waituntil' mode (the enqueue route processes jobs in-process).
export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.ESTIMATE_JOB_WORKER_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Worker endpoint disabled' }, { status: 503 });
  }
  const provided = request.headers.get('x-estimate-worker-secret');
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let jobId: string | undefined;
  try {
    const body = await request.json();
    jobId = typeof body?.jobId === 'string' ? body.jobId : undefined;
  } catch {
    // fallthrough
  }
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  // Always 200 after an attempt: business failures are recorded on the job
  // (FAILED) and must not trigger a QStash redelivery loop. QStash retries
  // still fire on crashes/timeouts (no response), where the stale-claim
  // logic lets the retry re-claim the job.
  await processEstimateJob(jobId);
  return NextResponse.json({ ok: true, jobId });
}
