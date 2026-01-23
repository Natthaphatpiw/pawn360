import { Client, ClientConfig, Message } from '@line/bot-sdk';

let adminLineClient: Client | null = null;

const getAdminLineClient = () => {
  if (!adminLineClient) {
    const channelAccessToken = process.env.LINE_ADMIN_CHANNEL_ACCESS_TOKEN;
    const channelSecret = process.env.LINE_ADMIN_CHANNEL_SECRET;

    if (!channelAccessToken || !channelSecret) {
      throw new Error('LINE admin channel access token or secret not configured');
    }

    const config: ClientConfig = {
      channelAccessToken,
      channelSecret,
    };

    adminLineClient = new Client(config);
  }

  return adminLineClient;
};

const getAdminTargetIds = (): string[] => {
  const raw = process.env.LINE_ADMIN_TARGET_IDS || '';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
};

export async function sendAdminMessage(message: Message) {
  const client = getAdminLineClient();
  const targets = getAdminTargetIds();

  if (targets.length === 1) {
    await client.pushMessage(targets[0], message);
    return;
  }

  if (targets.length > 1) {
    await client.multicast(targets, message);
    return;
  }

  await client.broadcast(message);
}
