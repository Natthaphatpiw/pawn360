export type ProviderName =
  | 'openai'
  | 'anthropic'
  | 'parallel'
  | 'exa'
  | 'serpapi'
  | 'unknown';

export type ProviderErrorKind =
  | 'CONFIGURATION'
  | 'AUTHENTICATION'
  | 'BUDGET_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'INVALID_REQUEST'
  | 'CONTENT_REJECTED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'EMPTY_RESULT'
  | 'INVALID_RESPONSE'
  | 'QUALITY_REJECTED'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface ProviderErrorDetails {
  provider: ProviderName;
  kind: ProviderErrorKind;
  retryable: boolean;
  status?: number;
  retryAfterMs?: number;
  requestId?: string;
  operation?: string;
  cause?: unknown;
}

/**
 * A provider-neutral error safe to route through queues and API handlers.
 * `message` must never contain credentials or full request/response bodies.
 */
export class ProviderError extends Error {
  readonly provider: ProviderName;
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly requestId?: string;
  readonly operation?: string;

  constructor(message: string, details: ProviderErrorDetails) {
    super(message, { cause: details.cause });
    this.name = 'ProviderError';
    this.provider = details.provider;
    this.kind = details.kind;
    this.retryable = details.retryable;
    this.status = details.status;
    this.retryAfterMs = details.retryAfterMs;
    this.requestId = details.requestId;
    this.operation = details.operation;
  }
}

export const isProviderError = (error: unknown): error is ProviderError =>
  error instanceof ProviderError;

function readHeader(error: any, name: string): string | null {
  const headers = error?.headers ?? error?.response?.headers;
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const value = headers[name] ?? headers[name.toLowerCase()];
  return typeof value === 'string' ? value : null;
}

function parseRetryAfterMs(error: any): number | undefined {
  const retryAfter = readHeader(error, 'retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }

  const reset = readHeader(error, 'x-ratelimit-reset-requests')
    || readHeader(error, 'x-ratelimit-reset-tokens');
  if (!reset) return undefined;
  const match = reset.match(/([\d.]+)\s*(ms|s|m)?/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  const unit = (match[2] || 's').toLowerCase();
  return Math.round(amount * (unit === 'ms' ? 1 : unit === 'm' ? 60_000 : 1000));
}

function readRequestId(error: any): string | undefined {
  const value = error?.requestId
    ?? error?.request_id
    ?? error?._request_id
    ?? error?.error?.requestId
    ?? error?.error?.request_id
    ?? readHeader(error, 'x-request-id');
  return value ? String(value) : undefined;
}

function readStatus(error: any): number | undefined {
  const raw = error?.status ?? error?.statusCode ?? error?.response?.status;
  const status = Number(raw);
  return Number.isFinite(status) ? status : undefined;
}

function readCodeAndMessage(error: any): string {
  return [
    error?.code,
    error?.type,
    error?.tag,
    error?.error?.code,
    error?.error?.type,
    error?.error?.tag,
    error?.message,
    error?.error?.message,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function normalizeProviderError(
  provider: ProviderName,
  error: unknown,
  operation?: string
): ProviderError {
  if (isProviderError(error)) return error;

  const raw = error as any;
  const status = readStatus(raw);
  const descriptor = readCodeAndMessage(raw);
  const retryAfterMs = parseRetryAfterMs(raw);
  const requestId = readRequestId(raw);

  let kind: ProviderErrorKind = 'UNKNOWN';
  let retryable = false;

  if (
    raw?.name === 'AbortError'
    || descriptor.includes('timeout')
    || descriptor.includes('timed out')
    || status === 408
  ) {
    kind = 'TIMEOUT';
    retryable = true;
  } else if (descriptor.includes('abort')) {
    kind = 'CANCELLED';
  } else if (
    descriptor.includes('content_filter')
    || descriptor.includes('content policy')
    || descriptor.includes('prohibited_content')
  ) {
    kind = 'CONTENT_REJECTED';
  } else if (
    status === 401
    || status === 403
    || descriptor.includes('invalid_api_key')
    || descriptor.includes('unauthorized')
  ) {
    kind = 'AUTHENTICATION';
  } else if (
    status === 402
    || descriptor.includes('insufficient_quota')
    || descriptor.includes('no_more_credits')
    || descriptor.includes('credit_balance_exhausted')
    || descriptor.includes('organization_spend_limit_exceeded')
    || descriptor.includes('project_spend_limit_exceeded')
    || descriptor.includes('organization_usage_limit_exceeded')
    || descriptor.includes('billing_hard_limit_reached')
    || descriptor.includes('budget_exceeded')
    || descriptor.includes('payment required')
    // Anthropic reports credit exhaustion as a 400 invalid_request_error whose
    // only distinguishing mark is this wording; without it the failure is
    // classified as a malformed request and reads like a code bug in the logs.
    || descriptor.includes('credit balance is too low')
    || descriptor.includes('credit balance')
  ) {
    kind = 'BUDGET_EXHAUSTED';
  } else if (
    status === 429
    || descriptor.includes('rate_limit')
    || descriptor.includes('rate limit')
    || descriptor.includes('too many requests')
  ) {
    kind = 'RATE_LIMITED';
    retryable = true;
  } else if (status === 400 || status === 404 || status === 409 || status === 422) {
    kind = 'INVALID_REQUEST';
  } else if (
    (status !== undefined && status >= 500)
    || descriptor.includes('overloaded')
    || descriptor.includes('connection')
    || descriptor.includes('network')
    || descriptor.includes('fetch failed')
  ) {
    kind = 'UPSTREAM_UNAVAILABLE';
    retryable = true;
  }

  return new ProviderError(`${provider} ${operation || 'request'} failed (${kind})`, {
    provider,
    kind,
    retryable,
    status,
    retryAfterMs,
    requestId,
    operation,
    cause: error,
  });
}

export function providerErrorCode(error: ProviderError): string {
  return `provider_${error.provider}_${error.kind.toLowerCase()}`;
}
