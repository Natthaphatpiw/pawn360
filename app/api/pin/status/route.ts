import { NextRequest, NextResponse } from 'next/server';
import { getPinStatus, normalizeRole } from '@/lib/security/pin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const role = normalizeRole(body?.role);
    const lineId = body?.lineId as string | undefined;

    if (!role || !lineId) {
      return NextResponse.json(
        { error: 'Role and LINE ID are required' },
        { status: 400 }
      );
    }

    const result = await getPinStatus(role, lineId);
    if (!result.ok) {
      return NextResponse.json(result.payload, { status: result.status });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error checking PIN status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
