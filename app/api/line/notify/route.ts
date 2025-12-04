import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lineId, message } = body;

    if (!lineId || !message) {
      return NextResponse.json(
        { error: 'Line ID and message are required' },
        { status: 400 }
      );
    }

    // Send push message to user
    await client.pushMessage(lineId, {
      type: 'text',
      text: message
    });

    return NextResponse.json({
      success: true,
      message: 'Notification sent'
    });

  } catch (error: any) {
    console.error('Error sending LINE notification:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send notification' },
      { status: 500 }
    );
  }
}
