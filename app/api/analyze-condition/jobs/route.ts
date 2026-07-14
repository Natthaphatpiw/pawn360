import { NextRequest, NextResponse, after } from 'next/server';
import { AnalyzeConditionRequest } from '@/lib/services/analyze-condition-pipeline';
import {
  createConditionJob,
  dispatchConditionJobViaQstash,
  getConditionJobDispatchMode,
  isConditionJobStoreAvailable,
  processConditionJob,
} from '@/lib/services/analyze-condition-jobs';

// In 'waituntil' mode the job runs in this function's background time (after
// the 202 goes out), so it needs the full pipeline budget.
export const maxDuration = 300;

// Enqueue a condition-scoring job. Responds immediately with a jobId; the
// client polls GET /api/analyze-condition/jobs/[jobId]. If the job store
// (Redis) is unavailable, responds 503 so the client can fall back to the
// synchronous POST /api/analyze-condition.
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: AnalyzeConditionRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || !Array.isArray(body.images) || body.images.length === 0) {
    return NextResponse.json({ error: 'กรุณาอัพโหลดรูปภาพอย่างน้อย 1 รูป' }, { status: 400 });
  }
  if (!body.itemType || typeof body.itemType !== 'string') {
    return NextResponse.json({ error: 'กรุณาเลือกประเภทสินค้าให้ถูกต้อง' }, { status: 400 });
  }

  if (!isConditionJobStoreAvailable()) {
    return NextResponse.json(
      { error: 'Condition job queue unavailable', code: 'job_store_unavailable' },
      { status: 503 }
    );
  }

  const job = await createConditionJob(body);
  if (!job) {
    return NextResponse.json(
      { error: 'Failed to enqueue condition job', code: 'job_store_unavailable' },
      { status: 503 }
    );
  }

  let mode = getConditionJobDispatchMode();
  if (mode === 'qstash') {
    try {
      await dispatchConditionJobViaQstash(job.jobId);
    } catch (error) {
      console.warn('⚠️ QStash dispatch failed — falling back to waituntil:', error);
      mode = 'waituntil';
    }
  }
  if (mode === 'waituntil') {
    after(() => processConditionJob(job.jobId));
  }

  return NextResponse.json({ jobId: job.jobId, status: job.status, dispatcher: mode }, { status: 202 });
}
