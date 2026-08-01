import crypto from 'crypto';
import { EkycActorType } from '@/lib/ekyc/types';

export class EkycWebhookConfigurationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'EkycWebhookConfigurationError';
  }
}

type WebhookAuthMode = 'basic' | 'legacy_hmac';

function roleEnv(actorType: EkycActorType, baseName: string): string {
  return actorType === 'INVESTOR' ? `${baseName}_INVEST` : baseName;
}

function configuredMode(actorType: EkycActorType): WebhookAuthMode {
  const value = String(process.env[roleEnv(actorType, 'UPPASS_WEBHOOK_AUTH_MODE')] || 'basic')
    .trim()
    .toLowerCase();
  if (value !== 'basic' && value !== 'legacy_hmac') {
    throw new EkycWebhookConfigurationError('UPPASS_WEBHOOK_AUTH_MODE_INVALID');
  }
  return value;
}

function safeStringEqual(left: string, right: string): boolean {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function verifyBasic(request: Request, actorType: EkycActorType): boolean {
  const username = String(process.env[roleEnv(actorType, 'UPPASS_WEBHOOK_BASIC_USERNAME')] || '');
  const password = String(process.env[roleEnv(actorType, 'UPPASS_WEBHOOK_BASIC_PASSWORD')] || '');
  if (!username || !password || username.length > 512 || password.length > 512) {
    throw new EkycWebhookConfigurationError('UPPASS_WEBHOOK_BASIC_CONFIG_MISSING');
  }

  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Basic ') || authorization.length > 2_048) return false;
  try {
    const decoded = Buffer.from(authorization.slice(6).trim(), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    return safeStringEqual(decoded.slice(0, separator), username)
      && safeStringEqual(decoded.slice(separator + 1), password);
  } catch {
    return false;
  }
}

function verifyLegacyHmac(request: Request, rawBody: string, actorType: EkycActorType): boolean {
  const secret = String(process.env[roleEnv(actorType, 'UPPASS_WEBHOOK_SECRET')] || '');
  if (secret.length < 32) {
    throw new EkycWebhookConfigurationError('UPPASS_WEBHOOK_HMAC_CONFIG_MISSING');
  }
  const rawSignature = String(request.headers.get('x-uppass-signature') || '').trim();
  const signature = rawSignature.startsWith('sha256=') ? rawSignature.slice(7) : rawSignature;
  if (!/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

/**
 * UpPass' documented webhook security is Basic Auth. The legacy HMAC mode is
 * retained only for accounts with a separately confirmed provider contract;
 * it must be selected explicitly and never falls back to unauthenticated mode.
 */
export function verifyUpPassWebhook(request: Request, rawBody: string, actorType: EkycActorType): boolean {
  return configuredMode(actorType) === 'basic'
    ? verifyBasic(request, actorType)
    : verifyLegacyHmac(request, rawBody, actorType);
}
