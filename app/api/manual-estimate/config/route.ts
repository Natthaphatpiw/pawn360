import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const isManualEstimateEnabled = () => {
  const value = (process.env.MANUAL_ESTIMATE_ENABLED || '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes' || value === 'on';
};

export async function GET() {
  return NextResponse.json({ enabled: isManualEstimateEnabled() });
}
