import { NextRequest, NextResponse, after } from 'next/server';
import { EstimateRequest } from '@/lib/services/estimate-pipeline';
import {
  createEstimateJob,
  dispatchEstimateJobViaQstash,
  getEstimateJobDispatchMode,
  isEstimateJobStoreAvailable,
  processEstimateJob,
} from '@/lib/services/estimate-jobs';

// In 'waituntil' mode the job is processed in this function's background time
// (after the 202 goes out), so it needs the full pipeline budget.
export const maxDuration = 300;

// Enqueue an estimate job. Responds immediately with a jobId; the client
// polls GET /api/estimate/jobs/[jobId]. If the job store (Redis) is not
// configured, responds 503 so the client can fall back to the synchronous
// POST /api/estimate.
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: EstimateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Fail fast on the same required fields as the pipeline, before queueing.
  if (!body || !body.itemType || !body.brand || !body.model || !body.lineId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!Array.isArray(body.images) || body.images.length === 0) {
    return NextResponse.json({ error: 'Missing required image data' }, { status: 400 });
  }

  if (!isEstimateJobStoreAvailable()) {
    return NextResponse.json(
      { error: 'Estimate job queue unavailable', code: 'job_store_unavailable' },
      { status: 503 }
    );
  }

  const job = await createEstimateJob(body);
  if (!job) {
    return NextResponse.json(
      { error: 'Failed to enqueue estimate job', code: 'job_store_unavailable' },
      { status: 503 }
    );
  }

  let mode = getEstimateJobDispatchMode();
  if (mode === 'qstash') {
    try {
      await dispatchEstimateJobViaQstash(job.jobId);
    } catch (error) {
      console.warn('⚠️ QStash dispatch failed — falling back to waituntil:', error);
      mode = 'waituntil';
    }
  }
  if (mode === 'waituntil') {
    after(() => processEstimateJob(job.jobId));
  }

  return NextResponse.json({ jobId: job.jobId, status: job.status, dispatcher: mode }, { status: 202 });
}
