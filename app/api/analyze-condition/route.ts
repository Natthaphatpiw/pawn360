import { NextRequest, NextResponse } from 'next/server';
import {
  AnalyzeConditionRequest,
  runAnalyzeConditionPipeline,
} from '@/lib/services/analyze-condition-pipeline';

// Precheck (Claude) + condition scoring (OpenAI gpt-5.6-luna, Claude fallback)
// can take 30-60s. Prefer the async job flow (POST /api/analyze-condition/jobs)
// from UIs — this synchronous route remains for back-compat and scripts.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: AnalyzeConditionRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await runAnalyzeConditionPipeline(body);
  if (result.ok) {
    return NextResponse.json(result.payload);
  }
  return NextResponse.json(
    { error: result.error, ...(result.code ? { code: result.code } : {}) },
    { status: result.status }
  );
}
