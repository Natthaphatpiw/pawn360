export async function pushLineTextMessage(params: {
  channelAccessToken?: string | null;
  to?: string | null;
  text: string;
}) {
  const token = String(params.channelAccessToken || '').trim();
  const to = String(params.to || '').trim();

  if (!token || !to || !params.text) {
    return { success: false, skipped: true };
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to,
      messages: [
        {
          type: 'text',
          text: params.text,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE push failed (${response.status}): ${body}`);
  }

  return { success: true };
}
