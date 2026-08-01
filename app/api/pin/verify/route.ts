import { NextRequest, NextResponse } from 'next/server';
import { normalizeRole, verifyPinAndIssueToken } from '@/lib/security/pin';
import { pinAccessErrorResponse, requirePinActor } from '@/lib/security/pin-access';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const role = normalizeRole(body?.role);
    const lineId = typeof body?.lineId === 'string' ? body.lineId.trim() : '';
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';

    if (!role || !lineId || !pin) {
      return NextResponse.json(
        { error: 'Role, LINE ID, and PIN are required' },
        { status: 400 }
      );
    }

    try {
      await requirePinActor(request, role, lineId, 'verify', 20, 10 * 60);
    } catch (error) {
      return pinAccessErrorResponse(error);
    }

    const result = await verifyPinAndIssueToken(role, lineId, pin);
    if (!result.ok) {
      if (result.status === 404) {
        return NextResponse.json(
          { pinRequired: true, ...result.payload },
          { status: 403 }
        );
      }
      return NextResponse.json(result.payload, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      pinToken: result.token,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    console.error('[pin:verify] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Failed to verify PIN', code: 'PIN_VERIFY_FAILED' },
      { status: 500 }
    );
  }
}
