import { NextRequest, NextResponse } from 'next/server';
import { getPinStatus, normalizeRole } from '@/lib/security/pin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const role = normalizeRole(body?.role);
    const lineId = typeof body?.lineId === 'string' ? body.lineId.trim() : '';

    if (!role || !lineId) {
      return NextResponse.json(
        { error: 'Role and LINE ID are required' },
        { status: 400 }
      );
    }

    const result = await getPinStatus(role, lineId);
    if (!result.ok) {
      if (result.status === 404) {
        return NextResponse.json({
          success: false,
          registered: false,
          pinSet: false,
          pinSetupRequired: true,
          ...result.payload,
        });
      }
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
