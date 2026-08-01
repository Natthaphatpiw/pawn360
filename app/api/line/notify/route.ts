import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';
import {
  internalAuthErrorResponse,
  requireInternalRequest,
} from '@/lib/security/request-auth';

export async function POST(request: NextRequest) {
  try {
    requireInternalRequest(request);
  } catch (error) {
    return internalAuthErrorResponse(error);
  }

  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 16 * 1024) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const body = await request.json();
    const { lineId, message } = body;

    if (
      typeof lineId !== 'string'
      || !/^U[A-Za-z0-9]{20,64}$/.test(lineId)
      || typeof message !== 'string'
      || !message.trim()
      || message.length > 5_000
    ) {
      return NextResponse.json(
        { error: 'Invalid LINE ID or message' },
        { status: 400 }
      );
    }

    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    const secret = process.env.LINE_CHANNEL_SECRET || '';
    if (!token || !secret) {
      return NextResponse.json(
        { error: 'Notification service is not configured' },
        { status: 503 }
      );
    }

    const client = new Client({ channelAccessToken: token, channelSecret: secret });

    // Send push message to user
    await client.pushMessage(lineId, {
      type: 'text',
      text: message
    });

    return NextResponse.json({
      success: true,
      message: 'Notification sent'
    });

  } catch (error) {
    console.error('[line:notify] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Failed to send notification', code: 'LINE_NOTIFY_FAILED' },
      { status: 500 }
    );
  }
}
