import { NextRequest, NextResponse } from 'next/server';
import { normalizeRole, verifyPinAndIssueToken } from '@/lib/security/pin';

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
  } catch (error: any) {
    console.error('Error verifying PIN:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
