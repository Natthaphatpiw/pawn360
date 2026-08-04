import dotenv from 'dotenv';

// Local operators normally keep real values in .env.local. Vercel injects
// project variables directly, so these calls are no-ops in deployed builds.
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const errors: string[] = [];

function value(name: string): string {
  return String(process.env[name] || '').trim();
}

function configured(name: string): boolean {
  const current = value(name);
  return Boolean(
    current
    && !/^your[_-]/i.test(current)
    && !/^generate[_-]/i.test(current)
    && !/YOUR_PROJECT/i.test(current)
    && !/your-production-domain/i.test(current)
  );
}

function requireValue(name: string): void {
  if (!configured(name)) errors.push(`${name}: missing or still a placeholder`);
}

function requireExact(name: string, expected: string): void {
  if (value(name) !== expected) errors.push(`${name}: must be ${expected}`);
}

function requirePositive(name: string): void {
  const parsed = Number(value(name));
  if (!Number.isFinite(parsed) || parsed <= 0) errors.push(`${name}: must be greater than zero`);
}

function requireSecret(name: string, minimumLength = 32): void {
  if (!configured(name) || value(name).length < minimumLength) {
    errors.push(`${name}: must be a non-placeholder secret of at least ${minimumLength} characters`);
  }
}

// Some controls are safe when unset. Assert only that they are not switched on,
// so an absent variable is a pass and an accidental "true" is a hard failure.
function forbidTruthy(name: string, why: string): void {
  if (['1', 'true', 'yes', 'on'].includes(value(name).toLowerCase())) {
    errors.push(`${name}: must not be enabled in production (${why})`);
  }
}

function requireHttps(name: string): void {
  try {
    const parsed = new URL(value(name));
    if (parsed.protocol !== 'https:') throw new Error('not https');
  } catch {
    errors.push(`${name}: must be an absolute HTTPS URL`);
  }
}

/**
 * Asserts the invariant lib/ekyc/config.ts enforces at request time: the API
 * URL's host must be a member of the host allowlist. Checking each variable in
 * isolation cannot catch this - both can be individually well-formed and still
 * disagree, which takes the whole eKYC flow down with a 503 that only shows up
 * once deployed. An allowlist pasted with a scheme, a trailing slash or a
 * :443 suffix matches nothing and is caught here too, since config.ts only
 * trims and lowercases the entries.
 */
function requireHostAllowlisted(urlName: string, allowlistName: string): void {
  const rawUrl = value(urlName);
  const rawAllowlist = value(allowlistName);
  if (!rawUrl || !rawAllowlist) return; // absence is already reported elsewhere

  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return; // requireHttps already reports an unparseable URL
  }

  const entries = rawAllowlist.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const malformed = entries.filter((entry) => entry !== entry.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, ''));
  if (malformed.length > 0) {
    errors.push(`${allowlistName}: entries must be bare hostnames (no scheme, path or port) - got ${malformed.join(', ')}`);
    return;
  }
  if (!entries.includes(host)) {
    errors.push(`${allowlistName}: does not include ${urlName}'s host "${host}" (allowlist: ${entries.join(', ') || 'empty'}) - eKYC will fail with EKYC_PROVIDER_URL_INVALID`);
  }
}

[
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'PARALLEL_API_KEY',
  'EXA_API_KEY',
  'BLOB_READ_WRITE_TOKEN',
  'BLOB_STORE_ID',
  'MONGODB_URI',
  'UPPASS_API_KEY',
  'UPPASS_API_KEY_INVEST',
  'UPPASS_FORM_SLUG',
  'UPPASS_FORM_SLUG_INVEST',
  'UPPASS_WEBHOOK_BASIC_USERNAME',
  'UPPASS_WEBHOOK_BASIC_USERNAME_INVEST',
  'UPPASS_ALLOWED_HOSTS',
  'UPPASS_FORM_ALLOWED_HOSTS',
  'UPPASS_FORM_ALLOWED_HOSTS_INVEST',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN_INVEST',
  'LINE_CHANNEL_SECRET_INVEST',
  'LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT',
  'LINE_CHANNEL_SECRET_DROPPOINT',
  'LINE_STORE_CHANNEL_ACCESS_TOKEN',
  'LINE_STORE_CHANNEL_SECRET',
  'LINE_LOGIN_CHANNEL_ID',
  'LINE_LOGIN_CHANNEL_ID_INVEST',
  'LINE_LOGIN_CHANNEL_ID_STORE',
  'LINE_LOGIN_CHANNEL_ID_DROPPOINT',
  'LINE_LOGIN_CHANNEL_ID_ADMIN',
  'ADMIN_LINE_IDS',
  'SHOP_SYSTEM_URL',
  'SHOP_SYSTEM_API_TOKEN',
].forEach(requireValue);

const redisPairA = configured('KV_REST_API_URL') && configured('KV_REST_API_TOKEN');
const redisPairB = configured('UPSTASH_REDIS_REST_URL') && configured('UPSTASH_REDIS_REST_TOKEN');
if (!redisPairA && !redisPairB) {
  errors.push('Redis: configure one complete KV_REST_API_* or UPSTASH_REDIS_REST_* pair');
}

[
  'AI_MONTHLY_BUDGET_USD',
  'AI_MAX_JOB_COST_USD',
  'AI_MAX_OWNER_DAILY_COST_USD',
  'JOB_CONCURRENCY_ESTIMATE_GENERIC',
  'JOB_CONCURRENCY_ESTIMATE_NOTEBOOK',
  'JOB_CONCURRENCY_CONDITION',
].forEach(requirePositive);

[
  'AI_SAFETY_IDENTIFIER_SECRET',
  'RATE_LIMIT_IDENTIFIER_SECRET',
  'ESTIMATE_ATTESTATION_SECRET',
  'JOB_WORKER_SECRET',
  'CRON_SECRET',
  'INTERNAL_API_SECRET',
  'WEBHOOK_SECRET',
  'UPPASS_WEBHOOK_BASIC_PASSWORD',
  'UPPASS_WEBHOOK_BASIC_PASSWORD_INVEST',
].forEach((name) => requireSecret(name));

// The privacy documentation states that responses are not retained provider-side.
// Keep that a mechanically enforced claim rather than a convention.
forbidTruthy('OPENAI_STORE_RESPONSES', 'item photos and bank slips would be retained provider-side');

requireExact('JOB_DISPATCHER', 'vercel');
requireExact('OPENAI_LUNA_MODEL', 'gpt-5.6-luna');
requireExact('OPENAI_TERRA_MODEL', 'gpt-5.6-terra');
requireExact('ALLOW_SYNCHRONOUS_AI_ROUTES', 'false');
requireExact('ALLOW_CLIENT_IMAGE_HASHES', 'false');
requireExact('ALLOW_AI_SLIP_AUTO_APPROVAL', 'false');
requireExact('UPPASS_WEBHOOK_AUTH_MODE', 'basic');
requireExact('UPPASS_WEBHOOK_AUTH_MODE_INVEST', 'basic');
requireExact('UPPASS_ALLOW_LEGACY_ACCEPTED', 'false');
requireExact('LINE_STORE_ALLOW_SHARED_CHANNEL', 'false');
requireExact('SHOP_WEBHOOK_SIGNATURE_MODE', 'body-hmac-v2');
requireExact('SHOP_WEBHOOK_ALLOW_LEGACY_HMAC', 'false');
requireExact('NEXT_PUBLIC_LIFF_MOCK', 'false');
requireExact('NEXT_PUBLIC_DROPPOINT_MOCK', 'false');

[
  'UPPASS_API_URL',
  'UPPASS_API_URL_INVEST',
  'NEXT_PUBLIC_BASE_URL',
  'JOB_CALLBACK_BASE_URL',
  'SHOP_SYSTEM_URL',
].forEach(requireHttps);

// Payment-slip verification silently downgrades to a vision model when SlipOK
// is unset, and a vision model cannot tell a real transfer from a picture of
// one. Production must not verify money on that path without knowing.
(() => {
  const branchRaw = value('SLIPOK_BRANCH_ID') || value('SLIPOK_API_URL');
  const branchId = /apikey\/(\d+)/i.exec(branchRaw)?.[1]
    || (/^\d+$/.test(branchRaw.trim()) ? branchRaw.trim() : '');
  const apiKey = value('SLIPOK_API_KEY') || value('SLIPOK_PASSWORD');
  if (!branchId || !apiKey) {
    errors.push(
      'SlipOK is not configured (need a numeric SLIPOK_BRANCH_ID and SLIPOK_API_KEY). '
      + 'Payment slips would be verified by the vision fallback, which cannot detect a forged or reused slip.',
    );
  }
})();

requireHostAllowlisted('UPPASS_API_URL', 'UPPASS_ALLOWED_HOSTS');
requireHostAllowlisted('UPPASS_API_URL_INVEST', 'UPPASS_ALLOWED_HOSTS');

if (value('UPPASS_API_KEY') === value('UPPASS_API_KEY_INVEST')) {
  errors.push('UPPASS_API_KEY and UPPASS_API_KEY_INVEST must be role-separated');
}
if (value('UPPASS_WEBHOOK_BASIC_PASSWORD') === value('UPPASS_WEBHOOK_BASIC_PASSWORD_INVEST')) {
  errors.push('UpPass Seller and Asset Funding webhook passwords must be distinct');
}
if (value('LINE_CHANNEL_ACCESS_TOKEN') === value('LINE_CHANNEL_ACCESS_TOKEN_INVEST')) {
  errors.push('Seller and Asset Funding LINE channel tokens must be distinct');
}

for (const name of [
  'LINE_LOGIN_CHANNEL_ID',
  'LINE_LOGIN_CHANNEL_ID_INVEST',
  'LINE_LOGIN_CHANNEL_ID_STORE',
  'LINE_LOGIN_CHANNEL_ID_DROPPOINT',
  'LINE_LOGIN_CHANNEL_ID_ADMIN',
]) {
  if (!/^\d{6,20}$/.test(value(name))) errors.push(`${name}: must be a LINE Login channel ID`);
}
const adminIds = value('ADMIN_LINE_IDS').split(',').map((item) => item.trim()).filter(Boolean);
if (adminIds.length === 0 || adminIds.some((item) => !/^U[A-Za-z0-9]{20,64}$/.test(item))) {
  errors.push('ADMIN_LINE_IDS: must contain only explicit LINE user IDs');
}

// Environment variables alone do not make a deploy safe: the queue inbox/outbox,
// the estimate attestation binding, and the price-evidence ledger all fail closed
// at runtime when their migration has not been applied. Probe the live schema so
// an unapplied migration is caught before deploy instead of at the first webhook.
const SCHEMA_PROBES: Array<{ migration: string; table: string; columns: string }> = [
  { migration: '2026_08_01_harden_ekyc.sql', table: 'ekyc_attempts', columns: 'id,status,uppass_slug' },
  { migration: '2026_08_01_harden_ekyc.sql', table: 'ekyc_webhook_events', columns: 'id,event_key,processing_status' },
  { migration: '2026_08_01_harden_ekyc_delivery_ordering.sql', table: 'ekyc_webhook_events', columns: 'processing_generation,notification_generation' },
  { migration: '2026_08_01_harden_ekyc_delivery_ordering.sql', table: 'ekyc_attempts', columns: 'provider_request_key,provider_form_url' },
  { migration: '2026_08_01_harden_ekyc_delivery_ordering.sql', table: 'pawners', columns: 'kyc_last_provider_event_at,kyc_last_provider_event_key' },
  { migration: '2026_08_01_harden_ekyc_delivery_ordering.sql', table: 'investors', columns: 'kyc_last_provider_event_at,kyc_last_provider_event_key' },
  { migration: '2026_08_01_harden_estimate_integrity.sql', table: 'items', columns: 'estimate_job_id,estimate_attestation' },
  { migration: '2026_08_01_harden_estimate_integrity.sql', table: 'loan_requests', columns: 'estimate_reference_id' },
  { migration: '2026_08_01_harden_price_observation_evidence.sql', table: 'price_observations', columns: 'evidence_status,evidence_fingerprint,evidence_provider,evidence_verified_at,is_outlier' },
];

function skipSchemaCheck(): boolean {
  return process.argv.includes('--skip-schema')
    || ['1', 'true', 'yes', 'on'].includes(value('PREFLIGHT_SKIP_SCHEMA').toLowerCase());
}

async function verifySupabaseSchema(): Promise<void> {
  if (skipSchemaCheck()) {
    console.warn('Schema probe skipped: rerun without --skip-schema before deploying.');
    return;
  }
  const baseUrl = value('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = value('SUPABASE_SERVICE_ROLE_KEY');
  if (!baseUrl || !serviceKey) return; // Already reported as a missing variable.

  const pending = new Set<string>();
  for (const probe of SCHEMA_PROBES) {
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/rest/v1/${probe.table}`
      + `?select=${encodeURIComponent(probe.columns)}&limit=1`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      errors.push(`Supabase schema probe could not reach ${probe.table}`);
      return;
    }
    if (response.ok) continue;
    // 401/403 means the probe itself is misconfigured; do not report it as a
    // missing migration.
    if (response.status === 401 || response.status === 403) {
      errors.push('SUPABASE_SERVICE_ROLE_KEY: rejected by the Supabase REST endpoint');
      return;
    }
    pending.add(probe.migration);
  }
  for (const migration of [...pending].sort()) {
    errors.push(`Supabase migration not applied: database/migrations/${migration}`);
  }
  if (pending.size === 0) {
    console.log('Supabase schema probe passed: all hardening migrations are applied.');
  }
}

void verifySupabaseSchema().then(() => {
  if (errors.length > 0) {
    console.error('Production preflight failed:');
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log('Production preflight passed: required controls are configured.');
});
