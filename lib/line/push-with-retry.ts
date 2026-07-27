import { Client, Message } from '@line/bot-sdk';

const wait = (milliseconds: number) => (
  new Promise((resolve) => setTimeout(resolve, milliseconds))
);

export async function pushLineMessageWithRetry(
  client: Client,
  lineId: string,
  message: Message,
  maxAttempts: number = 3,
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await client.pushMessage(lineId, message);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await wait(attempt * 250);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('LINE push message failed');
}
