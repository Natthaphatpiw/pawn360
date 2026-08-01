import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  getConditionJobWorkerSecret,
  processConditionJob,
} from '@/lib/services/analyze-condition-jobs';
import { readBoundedJsonObject } from '@/lib/security/transaction-request';

// QStash worker endpoint (JOB_DISPATCHER=qstash). QStash forwards our shared
// secret via Upstash-Forward-X-Job-Worker-Secret → x-job-worker-secret header.
// Not used in the default 'waituntil' mode.
export const maxDuration = 300;

function secretMatches(provided: string, expected: string): boolean {
  const left = crypto.createHash('sha256').update(provided).digest();
  const right = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(left, right);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = getConditionJobWorkerSecret();
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

  await processConditionJob(jobId);
  return NextResponse.json({ ok: true, jobId });
}
