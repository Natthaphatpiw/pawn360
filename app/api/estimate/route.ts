import { NextRequest, NextResponse } from 'next/server';
import {
  EstimateRequest,
  EstimateResponse,
  runEstimatePipeline,
} from '@/lib/services/estimate-pipeline';

// The pipeline does live web search + several LLM calls (~1-2 minutes for
// notebooks). Allow up to 5 minutes on Vercel. Prefer the async job flow
// (POST /api/estimate/jobs) from UIs — this synchronous route remains for
// backward compatibility and scripts.
export const maxDuration = 300;

export async function POST(
  request: NextRequest
): Promise<NextResponse<EstimateResponse | { error: string; code?: string }>> {
  let body: EstimateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await runEstimatePipeline(body);
  if (result.ok) {
    return NextResponse.json(result.payload);
  }
  return NextResponse.json(
    { error: result.error, ...(result.code ? { code: result.code } : {}) },
    { status: result.status }
  );
}
