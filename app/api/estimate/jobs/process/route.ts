import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getEstimateJobWorkerSecret, processEstimateJob } from '@/lib/services/estimate-jobs';
import { readBoundedJsonObject } from '@/lib/security/transaction-request';

// QStash worker endpoint (JOB_DISPATCHER=qstash). QStash forwards our shared
// secret via Upstash-Forward-X-Job-Worker-Secret, which arrives here as the
// x-job-worker-secret header. Not used in the default 'waituntil' mode (the
// enqueue route processes jobs in-process).
export const maxDuration = 300;

function secretMatches(provided: string, expected: string): boolean {
  const left = crypto.createHash('sha256').update(provided).digest();
  const right = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(left, right);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = getEstimateJobWorkerSecret();
  if (!secret || secret.length < 24) {
    return NextResponse.json({ error: 'Worker endpoint disabled' }, { status: 503 });
  }
  if (!secretMatches(request.headers.get('x-job-worker-secret') || '', secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let jobId: string | undefined;
  try {
    const body = await readBoundedJsonObject(request, 8 * 1024);
    jobId = typeof body?.jobId === 'string' ? body.jobId : undefined;
  } catch {
    // fallthrough
  }
  if (!jobId || !/^[0-9a-f-]{16,64}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  // Always 200 after an attempt: business failures are recorded on the job
  // (FAILED) and must not trigger a QStash redelivery loop. QStash retries
  // still fire on crashes/timeouts (no response), where the stale-claim logic
  // lets the retry re-claim the job.
  await processEstimateJob(jobId);
  return NextResponse.json({ ok: true, jobId });
}
