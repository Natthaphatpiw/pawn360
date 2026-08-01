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
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EkycPublicError(code, 503, 'ระบบยืนยันตัวตนยังไม่พร้อมใช้งาน', true, 60);
  }

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.port && url.port !== '443')
    || !allowedHosts.has(url.hostname.toLowerCase())
  ) {
    throw new EkycPublicError(code, 503, 'ระบบยืนยันตัวตนยังไม่พร้อมใช้งาน', true, 60);
  }
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
