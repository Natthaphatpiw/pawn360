// Shared Anthropic (Claude) client for the LLM steps that previously ran on OpenAI GPT.
//
// Used by:
//  - app/api/estimate/route.ts        (input normalization, SerpAPI filter, web-search prices)
//  - app/api/analyze-condition/route.ts (image precheck — vision)
//  - lib/services/slip-verification.ts  (bank-slip vision fallback)
//
// Calls the Anthropic Messages REST API directly (no SDK dependency) with key rotation
// on rate-limit / overloaded / network errors, mirroring the OpenAI fallback pattern.

import { collectEnvKeys } from '@/lib/utils/env';
import {
  normalizeProviderError,
  ProviderError,
} from '@/lib/services/provider-error';
import {
  recordAIUsageEvent,
  reserveAIBudget,
} from '@/lib/services/ai-usage';
import { withProviderCapacity } from '@/lib/services/provider-capacity';

const ANTHROPIC_KEYS = collectEnvKeys([
  process.env.ANTHROPIC_API_KEY,
  process.env.ANTHROPIC_API_KEY_2,
  process.env.ANTHROPIC_API_KEY_3,
  process.env.ANTHROPIC_API_KEY_4,
]);

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';
// Vision steps (image precheck, slip OCR) use a smaller/faster/cheaper model by default.
const DEFAULT_ANTHROPIC_VISION_MODEL = 'claude-haiku-4-5-20251001';
const MAX_ANTHROPIC_RESPONSE_BYTES = 2 * 1024 * 1024;

const ANTHROPIC_MODEL_PRICING: Readonly<Record<string, { input: number; output: number }>> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export const hasAnthropicKeys = () => ANTHROPIC_KEYS.length > 0;

// Default Claude model for text steps. Override globally with ANTHROPIC_MODEL.
export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

// Model for vision steps (analyze-condition image precheck, slip verification).
// Override with ANTHROPIC_VISION_MODEL.
export function getAnthropicVisionModel(): string {
  return process.env.ANTHROPIC_VISION_MODEL?.trim() || DEFAULT_ANTHROPIC_VISION_MODEL;
}

// Calls the Anthropic Messages API over the configured keys, rotating to the next
// key on rate-limit / overloaded / network failures.
function anthropicPricing(model: string): { input: number; output: number } | null {
  return ANTHROPIC_MODEL_PRICING[model]
    || Object.entries(ANTHROPIC_MODEL_PRICING).find(([name]) => model.startsWith(name))?.[1]
    || null;
}

function estimateAnthropicInputTokens(payload: Record<string, any>): number {
  let images = 0;
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    if (record.type === 'image') {
      images += 1;
      return { type: 'image', source: '[image omitted]' };
    }
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, visit(item)]));
  };
  const textTokens = Math.ceil(JSON.stringify(visit(payload)).length / 3);
  return textTokens + images * 4_000;
}

function anthropicCostUsd(model: string, usage: any): number {
  const pricing = anthropicPricing(model);
  if (!pricing) {
    throw new ProviderError('Anthropic pricing is not configured for the resolved model', {
      provider: 'anthropic',
      kind: 'INVALID_RESPONSE',
      retryable: false,
      operation: 'messages_create',
    });
  }
  const input = Number(usage?.input_tokens || 0)
    + Number(usage?.cache_creation_input_tokens || 0);
  const cached = Number(usage?.cache_read_input_tokens || 0);
  const output = Number(usage?.output_tokens || 0);
  // Cache reads are 10% of normal input. Current fallback requests do not set
  // cache_control, but account for provider-side usage fields defensively.
  return ((input * pricing.input) + (cached * pricing.input * 0.1) + (output * pricing.output)) / 1_000_000;
}

function validTokenCount(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && Number.isInteger(value);
}

function validateAnthropicSuccess(data: unknown, status: number): asserts data is {
  id: string;
  type: 'message';
  model: string;
  content: unknown[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
} {
  const record = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, any>
    : null;
  const usage = record?.usage && typeof record.usage === 'object' && !Array.isArray(record.usage)
    ? record.usage as Record<string, unknown>
    : null;
  const optionalUsageValid = ['cache_creation_input_tokens', 'cache_read_input_tokens']
    .every((field) => usage?.[field] === undefined || validTokenCount(usage[field]));
  if (
    !record
    || typeof record.id !== 'string'
    || record.id.length === 0
    || record.type !== 'message'
    || typeof record.model !== 'string'
    || record.model.length === 0
    || !Array.isArray(record.content)
    || !usage
    || !validTokenCount(usage.input_tokens)
    || !validTokenCount(usage.output_tokens)
    || !optionalUsageValid
    || !anthropicPricing(record.model)
  ) {
    throw new ProviderError('Anthropic returned a malformed success response', {
      provider: 'anthropic',
      kind: 'INVALID_RESPONSE',
      retryable: false,
      status,
      operation: 'messages_create',
    });
  }
}

function anthropicTotalTokens(usage: Record<string, unknown>): number {
  return [
    usage.input_tokens,
    usage.output_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_read_input_tokens,
  ].reduce((sum: number, value) => sum + (validTokenCount(value) ? value : 0), 0);
}

async function readBoundedAnthropicJson(response: Response): Promise<any> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_ANTHROPIC_RESPONSE_BYTES) {
    throw new ProviderError('Anthropic response exceeded the size limit', {
      provider: 'anthropic',
      kind: 'INVALID_RESPONSE',
      retryable: true,
      status: response.status,
      operation: 'messages_create',
    });
  }
  if (!response.body) {
    throw new ProviderError('Anthropic returned an empty response', {
      provider: 'anthropic',
      kind: 'INVALID_RESPONSE',
      retryable: true,
      status: response.status,
      operation: 'messages_create',
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_ANTHROPIC_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ProviderError('Anthropic response exceeded the size limit', {
          provider: 'anthropic',
          kind: 'INVALID_RESPONSE',
          retryable: true,
          status: response.status,
          operation: 'messages_create',
        });
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new ProviderError('Anthropic returned invalid JSON', {
      provider: 'anthropic',
      kind: 'INVALID_RESPONSE',
      retryable: true,
      status: response.status,
      operation: 'messages_create',
      cause: error,
    });
  }
}

export async function callAnthropicMessages(
  payload: Record<string, any>,
  label = 'messages_create',
): Promise<any> {
  if (!hasAnthropicKeys()) {
    throw new ProviderError('Anthropic is not configured', {
      provider: 'anthropic',
      kind: 'CONFIGURATION',
      retryable: false,
      operation: 'messages_create',
    });
  }

  const model = String(payload.model || getAnthropicModel());
  const pricing = anthropicPricing(model);
  if (!pricing) {
    throw new ProviderError('Anthropic pricing is not configured for the requested model', {
      provider: 'anthropic',
      kind: 'CONFIGURATION',
      retryable: false,
      operation: label,
    });
  }
  const estimatedInput = estimateAnthropicInputTokens(payload);
  const estimatedCostUsd = (
    estimatedInput * pricing.input
    + Math.max(0, Number(payload.max_tokens || 1024)) * pricing.output
  ) / 1_000_000;
  const reservation = await reserveAIBudget(estimatedCostUsd, 'anthropic', label);
  const startedAt = Date.now();
  let lastError: ProviderError | null = null;
  const timeoutMs = (() => {
    const parsed = Number(process.env.ANTHROPIC_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 90_000;
  })();
  for (let i = 0; i < ANTHROPIC_KEYS.length; i++) {
    const apiKey = ANTHROPIC_KEYS[i];
    let attempt: { res: Response; data: any };
    try {
      attempt = await withProviderCapacity(
        {
          provider: 'anthropic',
          model,
          operation: label,
          estimatedTokens: estimatedInput + Math.max(0, Number(payload.max_tokens || 1024)),
          leaseMs: timeoutMs + 30_000,
        },
        async () => {
          const res = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': ANTHROPIC_VERSION,
              'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(timeoutMs),
            cache: 'no-store',
            redirect: 'error',
          });
          const data = await readBoundedAnthropicJson(res);
          if (res.ok) validateAnthropicSuccess(data, res.status);
          return { res, data };
        },
        ({ res, data }) => res.ok ? anthropicTotalTokens(data.usage) : 0,
        (error) => {
          const failure = normalizeProviderError('anthropic', error, 'messages_create');
          return failure.status !== undefined && failure.status < 500 ? 0 : undefined;
        },
      );
    } catch (error) {
      const failure = normalizeProviderError('anthropic', error, 'messages_create');
      lastError = failure;
      // A successful HTTP response with unusable content, timeout, or network
      // loss may still be billed. Do not rotate keys for ambiguous requests.
      const ambiguousBilling = failure.kind === 'TIMEOUT'
        || failure.kind === 'UNKNOWN'
        || (failure.status !== undefined && failure.status >= 200 && failure.status < 300)
        || (failure.kind === 'UPSTREAM_UNAVAILABLE' && failure.status === undefined);
      const failureCostUsd = ambiguousBilling ? reservation.reservedCostUsd : 0;
      await reservation.settle(failureCostUsd);
      await recordAIUsageEvent({
        provider: 'anthropic', operation: label, model, costUsd: failureCostUsd,
        costBasis: ambiguousBilling ? 'upper_bound' : 'known_zero',
        latencyMs: Date.now() - startedAt, success: false, errorKind: failure.kind,
      });
      throw failure;
    }
    const { res, data } = attempt;
    if (res.ok) {
      const resolvedModel = String(data.model);
      const costUsd = anthropicCostUsd(resolvedModel, data.usage);
      await reservation.settle(costUsd);
      await recordAIUsageEvent({
        provider: 'anthropic',
        operation: label,
        model: resolvedModel,
        inputTokens: Number(data?.usage?.input_tokens || 0),
        cachedInputTokens: Number(data?.usage?.cache_read_input_tokens || 0),
        cacheWriteTokens: Number(data?.usage?.cache_creation_input_tokens || 0),
        outputTokens: Number(data?.usage?.output_tokens || 0),
        costUsd,
        costBasis: 'provider_usage',
        requestId: res.headers.get('request-id') || undefined,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: true,
        success: true,
      });
      console.log('Anthropic fallback usage:', {
        label,
        model: resolvedModel,
        inputTokens: Number(data?.usage?.input_tokens || 0),
        outputTokens: Number(data?.usage?.output_tokens || 0),
        estimatedCostUsd: costUsd,
      });
      return data;
    }

    const failure = normalizeProviderError('anthropic', {
      status: res.status,
      error: data?.error,
      headers: res.headers,
    }, 'messages_create');
    if (failure.kind === 'RATE_LIMITED' && i < ANTHROPIC_KEYS.length - 1) {
      console.warn(`⚠️ Anthropic rate limit (key ${i + 1}). Switching to fallback key ${i + 2}.`);
      lastError = failure;
      continue;
    }
    await reservation.settle(0);
    await recordAIUsageEvent({
      provider: 'anthropic', operation: label, model, costUsd: 0,
      costBasis: 'known_zero',
      requestId: res.headers.get('request-id') || undefined,
      latencyMs: Date.now() - startedAt, success: false, errorKind: failure.kind,
    });
    throw failure;
  }

  const failure = lastError || new ProviderError('Anthropic request failed', {
    provider: 'anthropic',
    kind: 'UNKNOWN',
    retryable: false,
    operation: 'messages_create',
  });
  await reservation.settle(0);
  await recordAIUsageEvent({
    provider: 'anthropic', operation: label, model, costUsd: 0,
    costBasis: 'known_zero',
    latencyMs: Date.now() - startedAt, success: false, errorKind: failure.kind,
  });
  throw failure;
}

// Concatenates the text of all `text` content blocks in a Messages response.
export function getAnthropicResponseText(content: any): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((block: any) => block?.type === 'text' && typeof block?.text === 'string')
    .map((block: any) => block.text)
    .join('\n');
}

export function parseJsonFromText<T>(text: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

// Builds an Anthropic image content block from a `data:` URL (base64) or a remote URL.
function toAnthropicImageBlock(image: string): any | null {
  if (!image || typeof image !== 'string') return null;
  if (image.startsWith('data:')) {
    const match = image.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) return null;
    return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
  }
  return { type: 'image', source: { type: 'url', url: image } };
}

export interface AnthropicStructuredOptions {
  // JSON Schema describing the expected object (reuse the OpenAI json_schema `schema`).
  schema: Record<string, any>;
  userText: string;
  system?: string;
  // Optional image inputs (data: URLs or remote URLs) for vision tasks.
  images?: string[];
  toolName?: string;
  toolDescription?: string;
  model?: string;
  maxTokens?: number;
  label?: string;
}

// Structured output via tool-use: forces Claude to call a single tool whose
// `input_schema` is the desired JSON Schema, then returns the validated input object.
// Returns null if the model produced no usable structured output.
export async function anthropicStructured<T>(opts: AnthropicStructuredOptions): Promise<T | null> {
  const toolName = opts.toolName || 'respond';

  const content: any[] = [{ type: 'text', text: opts.userText }];
  for (const image of opts.images || []) {
    const block = toAnthropicImageBlock(image);
    if (block) content.push(block);
  }

  const data = await callAnthropicMessages({
    model: opts.model || getAnthropicModel(),
    max_tokens: opts.maxTokens || 1024,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: 'user', content }],
    tools: [
      {
        name: toolName,
        description: opts.toolDescription || 'Return the structured result.',
        input_schema: opts.schema,
      },
    ],
    tool_choice: { type: 'tool', name: toolName },
  }, opts.label || opts.toolName || 'anthropic_structured');

  const block = Array.isArray(data?.content)
    ? data.content.find((b: any) => b?.type === 'tool_use' && b?.name === toolName)
    : null;

  if (block && block.input && typeof block.input === 'object') {
    return block.input as T;
  }

  // Fallback: some responses may put JSON in a text block instead of tool input.
  return parseJsonFromText<T>(getAnthropicResponseText(data?.content));
}
