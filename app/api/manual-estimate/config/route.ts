import { NextResponse } from 'next/server';
import { parseBoolEnv } from '@/lib/utils/env';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const isManualEstimateEnabled = () => parseBoolEnv(process.env.MANUAL_ESTIMATE_ENABLED);

export async function GET() {
  return NextResponse.json({ enabled: isManualEstimateEnabled() });
}
