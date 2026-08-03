import { EkycActorType, EkycPublicError } from '@/lib/ekyc/types';

const DEFAULT_UPPASS_HOSTS = ['app.uppass.io', 'api.uppass.io'];

function configuredHosts(name: string, fallbacks: string[]): Set<string> {
  const configured = String(process.env[name] || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured.length > 0 ? configured : fallbacks);
}

function validateHttpsUrl(value: string, allowedHosts: Set<string>, code: string): URL {
  // Five different misconfigurations used to collapse into one opaque error
  // code, so a production failure said only "the URL is invalid" - not which
  // of two similarly-named env vars was wrong, nor how. The public response is
  // deliberately unchanged (same code, status and message); only the server log
  // gains the reason.
  //
  // The raw value is never logged: it can carry embedded credentials. The
  // reason is a fixed enum, the host is a vendor DNS name already published in
  // .env.example and visible in outbound traffic, and the allowlist is reported
  // only as a size.
  const reject = (reason: string, host?: string): never => {
    console.error('eKYC provider URL rejected', {
      code,
      reason,
      ...(host ? { host } : {}),
      allowlistSize: allowedHosts.size,
    });
    throw new EkycPublicError(code, 503, 'ระบบยืนยันตัวตนยังไม่พร้อมใช้งาน', true, 60);
  };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Typically a value stored without a scheme, or pasted into the hosting
    // dashboard wrapped in quotes.
    return reject('URL_UNPARSEABLE');
  }

  if (url.protocol !== 'https:') return reject('NOT_HTTPS', url.hostname);
  if (url.username || url.password) return reject('EMBEDDED_CREDENTIALS');
  if (url.port && url.port !== '443') return reject('NON_443_PORT', url.hostname);
  if (!allowedHosts.has(url.hostname.toLowerCase())) return reject('HOST_NOT_ALLOWLISTED', url.hostname);
  return url;
}

export interface UpPassRuntimeConfig {
  apiBaseUrl: URL;
  apiKey: string;
  formSlug: string;
  allowedFormHosts: Set<string>;
}

export function getUpPassRuntimeConfig(actorType: EkycActorType): UpPassRuntimeConfig {
  const isInvestor = actorType === 'INVESTOR';
  const apiKey = String(process.env[isInvestor ? 'UPPASS_API_KEY_INVEST' : 'UPPASS_API_KEY'] || '').trim();
  const formSlug = String(process.env[isInvestor ? 'UPPASS_FORM_SLUG_INVEST' : 'UPPASS_FORM_SLUG'] || '').trim();
  const apiUrl = String(process.env[isInvestor ? 'UPPASS_API_URL_INVEST' : 'UPPASS_API_URL'] || '').trim();

  // Investor credentials deliberately do not fall back to the seller flow. A
  // missing role-specific form can silently apply the wrong verification rules.
  if (!apiKey || !formSlug || !apiUrl || !/^[A-Za-z0-9_-]{1,255}$/.test(formSlug)) {
    throw new EkycPublicError(
      'EKYC_PROVIDER_CONFIG_MISSING',
      503,
      'ระบบยืนยันตัวตนยังไม่พร้อมใช้งาน',
      true,
      60,
    );
  }

  const allowedApiHosts = configuredHosts('UPPASS_ALLOWED_HOSTS', DEFAULT_UPPASS_HOSTS);
  const roleFormHostName = isInvestor ? 'UPPASS_FORM_ALLOWED_HOSTS_INVEST' : 'UPPASS_FORM_ALLOWED_HOSTS';
  const allowedFormHosts = configuredHosts(roleFormHostName, [...allowedApiHosts]);

  return {
    apiBaseUrl: validateHttpsUrl(apiUrl, allowedApiHosts, 'EKYC_PROVIDER_URL_INVALID'),
    apiKey,
    formSlug,
    allowedFormHosts,
  };
}

export function validateUpPassFormUrl(value: unknown, allowedHosts: Set<string>): string {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new EkycPublicError('EKYC_PROVIDER_RESPONSE_INVALID', 502, 'ผู้ให้บริการยืนยันตัวตนตอบกลับไม่สมบูรณ์', true, 30);
  }
  return validateHttpsUrl(value, allowedHosts, 'EKYC_PROVIDER_RESPONSE_INVALID').toString();
}

export function getActorDatabaseConfig(actorType: EkycActorType) {
  return actorType === 'INVESTOR'
    ? { table: 'investors', idColumn: 'investor_id', lineTokenRole: 'INVESTOR' as const }
    : { table: 'pawners', idColumn: 'customer_id', lineTokenRole: 'PAWNER' as const };
}
