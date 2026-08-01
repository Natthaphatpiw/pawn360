import { NextRequest, NextResponse } from 'next/server';
import { getPinStatus, normalizeRole } from '@/lib/security/pin';
import { pinAccessErrorResponse, requirePinActor } from '@/lib/security/pin-access';

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

    try {
      await requirePinActor(request, role, lineId, 'status', 60, 10 * 60);
    } catch (error) {
      return pinAccessErrorResponse(error);
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
  } catch (error) {
    console.error('[pin:status] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Failed to check PIN status', code: 'PIN_STATUS_FAILED' },
      { status: 500 }
    );
  }
}
