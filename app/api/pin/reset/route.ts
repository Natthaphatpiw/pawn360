import { NextRequest, NextResponse } from 'next/server';
import { normalizeRole, resetPin } from '@/lib/security/pin';
import { pinAccessErrorResponse, requirePinActor } from '@/lib/security/pin-access';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const role = normalizeRole(body?.role);
    const lineId = body?.lineId as string | undefined;
    const pin = body?.pin as string | undefined;

    if (!role || !lineId || !pin) {
      return NextResponse.json(
        { error: 'Role, LINE ID, and PIN are required' },
        { status: 400 }
      );
    }

    try {
      await requirePinActor(request, role, lineId, 'reset', 5, 60 * 60);
    } catch (error) {
      return pinAccessErrorResponse(error);
    }

    const identity = {
      phoneNumber: body?.phoneNumber as string | undefined,
      nationalId: body?.nationalId as string | undefined,
      dropPointCode: body?.dropPointCode as string | undefined,
    };

    const result = await resetPin(role, lineId, pin, identity);
    if (!result.ok) {
      return NextResponse.json(result.payload, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      pinToken: result.token,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    console.error('[pin:reset] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Failed to reset PIN', code: 'PIN_RESET_FAILED' },
      { status: 500 }
    );
  }
}
