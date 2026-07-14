import { NextRequest, NextResponse } from 'next/server';
import {
  getConditionJobWorkerSecret,
  processConditionJob,
} from '@/lib/services/analyze-condition-jobs';

// QStash worker endpoint (JOB_DISPATCHER=qstash). QStash forwards our shared
// secret via Upstash-Forward-X-Job-Worker-Secret → x-job-worker-secret header.
// Not used in the default 'waituntil' mode.
export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = getConditionJobWorkerSecret();
  if (!secret) {
    return NextResponse.json({ error: 'Worker endpoint disabled' }, { status: 503 });
  }
  if (request.headers.get('x-job-worker-secret') !== secret) {
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

  await processConditionJob(jobId);
  return NextResponse.json({ ok: true, jobId });
}
