// Shared OpenAI Responses API client for text, vision, structured output, and
// hosted-tool workloads. OpenAI is the primary provider; callers keep their
// existing Anthropic implementations as fallbacks.

import crypto from 'node:crypto';
import OpenAI from 'openai';
import { collectEnvKeys } from '@/lib/utils/env';
import { parseJsonFromText } from '@/lib/services/anthropic-llm';
import {
  normalizeProviderError,
  ProviderError,
} from '@/lib/services/provider-error';
import {
  getAISafetyIdentifier,
  recordAIUsageEvent,
  reserveAIBudget,
} from '@/lib/services/ai-usage';
import {
  ProviderCapacityError,
  withProviderCapacity,
} from '@/lib/services/provider-capacity';

const OPENAI_KEYS = collectEnvKeys([
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_API_KEY_2,
  process.env.OPENAI_API_KEY_3,
  process.env.OPENAI_API_KEY_4,
]);

const openAITimeoutMs = (() => {
  const parsed = Number(process.env.OPENAI_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 90_000;
})();

// Retry/backoff belongs to the durable job queue. Disabling SDK retries avoids
// hidden duplicate spend and lets typed Retry-After metadata drive scheduling.
const openaiClients = OPENAI_KEYS.map((apiKey) => new OpenAI({
  apiKey,
  timeout: openAITimeoutMs,
  maxRetries: 0,
}));

export const hasOpenAIKeys = () => openaiClients.length > 0;

export type OpenAIReasoningEffort =
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export type OpenAITask =
  | 'condition_image_precheck'
  | 'condition_scoring'
  | 'notebook_vision_spec'
  | 'slip_verification'
  | 'generic_normalize_input'
  | 'notebook_normalize_input'
  | 'generic_serpapi_filter'
  | 'notebook_serpapi_filter'
  | 'notebook_canonical_spec'
  | 'generic_market_extract'
  | 'notebook_market_extract';

const OPENAI_REASONING_EFFORTS = new Set<OpenAIReasoningEffort>([
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

// Production defaults are intentionally task-specific. Cheap extraction and
// classification calls start at none/low; only a failed quality check should
// be retried at the task's retry effort. This avoids paying xhigh/max on every
// request while keeping a controlled escalation path.
const OPENAI_TASK_EFFORT_POLICY: Record<
  OpenAITask,
  { primary: OpenAIReasoningEffort; retry: OpenAIReasoningEffort }
> = {
  condition_image_precheck: { primary: 'none', retry: 'low' },
  condition_scoring: { primary: 'low', retry: 'medium' },
  notebook_vision_spec: { primary: 'none', retry: 'low' },
  slip_verification: { primary: 'low', retry: 'medium' },
  generic_normalize_input: { primary: 'none', retry: 'low' },
  notebook_normalize_input: { primary: 'none', retry: 'low' },
  generic_serpapi_filter: { primary: 'none', retry: 'low' },
  notebook_serpapi_filter: { primary: 'low', retry: 'medium' },
  notebook_canonical_spec: { primary: 'low', retry: 'medium' },
  generic_market_extract: { primary: 'low', retry: 'medium' },
  notebook_market_extract: { primary: 'low', retry: 'medium' },
};

const parseReasoningEffort = (
  value: string | undefined,
  fallback: OpenAIReasoningEffort
): OpenAIReasoningEffort => {
  const normalized = value?.trim().toLowerCase() as OpenAIReasoningEffort | undefined;
  return normalized && OPENAI_REASONING_EFFORTS.has(normalized) ? normalized : fallback;
};

export function getOpenAIReasoningEffortForTask(
  task: OpenAITask,
  stage: 'primary' | 'retry' = 'primary'
): OpenAIReasoningEffort {
  const envName = `OPENAI_EFFORT_${task.toUpperCase()}`;
  return parseReasoningEffort(process.env[envName], OPENAI_TASK_EFFORT_POLICY[task][stage]);
}

export interface OpenAIModelPricing {
  inputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
  cacheWritePerMillionUsd: number;
  outputPerMillionUsd: number;
}

// Standard short-context prices verified 2026-08-01. Cache writes are 1.25x
// normal input. Keep model pricing centralized so runtime logs and the smoke
// estimator cannot silently drift apart.
export const OPENAI_MODEL_PRICING: Readonly<Record<string, OpenAIModelPricing>> = {
  'gpt-5.6-luna': {
    inputPerMillionUsd: 0.2,
    cachedInputPerMillionUsd: 0.02,
    cacheWritePerMillionUsd: 0.25,
    outputPerMillionUsd: 1.2,
  },
  'gpt-5.6-terra': {
    inputPerMillionUsd: 2,
    cachedInputPerMillionUsd: 0.2,
    cacheWritePerMillionUsd: 2.5,
    outputPerMillionUsd: 12,
  },
};

export interface OpenAIUsageSnapshot {
  label: string;
  model: string;
  status: string;
  incompleteReason: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  webSearchCalls: number;
  requestId: string | null;
  estimatedTokenCostUsd: number | null;
}

export function getOpenAILunaModel(): string {
  return process.env.OPENAI_LUNA_MODEL?.trim()
    || process.env.OPENAI_VISION_MODEL?.trim()
    || 'gpt-5.6-luna';
}

export function getOpenAITerraModel(): string {
  return process.env.OPENAI_TERRA_MODEL?.trim() || 'gpt-5.6-terra';
}

export function getOpenAILunaReasoningEffort(): OpenAIReasoningEffort {
  return parseReasoningEffort(
    process.env.OPENAI_LUNA_REASONING_EFFORT
      || process.env.OPENAI_VISION_REASONING_EFFORT,
    'low'
  );
}

export function getOpenAITerraReasoningEffort(): OpenAIReasoningEffort {
  return parseReasoningEffort(process.env.OPENAI_TERRA_REASONING_EFFORT, 'low');
}

export function getOpenAINotebookReasoningEffort(): OpenAIReasoningEffort {
  return parseReasoningEffort(process.env.OPENAI_NOTEBOOK_REASONING_EFFORT, 'low');
}

// Backward-compatible aliases used by the condition pipeline.
export function getOpenAIVisionModel(): string {
  return getOpenAILunaModel();
}

// Rotate only for a real per-key rate limit. Billing/quota exhaustion is not a
// transient TPM event and must reach the queue/error policy without burning all
// configured keys.
interface OpenAICapacityOptions {
  model: string;
  operation: string;
  estimatedTokens: number;
}

export async function runWithOpenAIFallback<T>(
  task: (client: OpenAI) => Promise<T>,
  capacity?: OpenAICapacityOptions,
): Promise<T> {
  if (!hasOpenAIKeys()) {
    throw new ProviderError('OpenAI is not configured', {
      provider: 'openai',
      kind: 'CONFIGURATION',
      retryable: false,
      operation: 'response_create',
    });
  }
  let lastError: ProviderError | null = null;
  for (let i = 0; i < openaiClients.length; i++) {
    try {
      const execute = () => task(openaiClients[i]);
      if (!capacity) return await execute();
      return await withProviderCapacity(
        {
          provider: 'openai',
          model: capacity.model,
          operation: capacity.operation,
          estimatedTokens: capacity.estimatedTokens,
          leaseMs: openAITimeoutMs + 30_000,
        },
        execute,
        (result) => {
          const usage = (result as any)?.usage;
          const total = Number(usage?.total_tokens);
          if (Number.isFinite(total) && total >= 0) return total;
          const input = Number(usage?.input_tokens);
          const output = Number(usage?.output_tokens);
          return Number.isFinite(input) && input >= 0 && Number.isFinite(output) && output >= 0
            ? input + output
            : undefined;
        },
        (error) => {
          const normalized = normalizeProviderError('openai', error, capacity.operation);
          return normalized.status !== undefined && normalized.status < 500 ? 0 : undefined;
        },
      );
    } catch (error) {
      const normalized = normalizeProviderError('openai', error, 'response_create');
      lastError = normalized;
      if (
        normalized.kind === 'RATE_LIMITED'
        && !(normalized instanceof ProviderCapacityError)
        && i < openaiClients.length - 1
      ) {
        console.warn(`⚠️ OpenAI rate limit (key ${i + 1}). Switching to fallback key ${i + 2}.`);
        continue;
      }
      throw normalized;
    }
  }
  throw lastError || new ProviderError('OpenAI request failed', {
    provider: 'openai',
    kind: 'UNKNOWN',
    retryable: false,
    operation: 'response_create',
  });
}

export function estimateOpenAITokenCostUsd(
  model: string,
  usage: Pick<
    OpenAIUsageSnapshot,
    'inputTokens' | 'cachedInputTokens' | 'cacheWriteTokens' | 'outputTokens'
  >
): number | null {
  const price = OPENAI_MODEL_PRICING[model]
    || Object.entries(OPENAI_MODEL_PRICING).find(([name]) => model.startsWith(name))?.[1];
  if (!price) return null;
  const uncachedInput = Math.max(
    0,
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens
  );
  return (
    uncachedInput * price.inputPerMillionUsd
    + usage.cachedInputTokens * price.cachedInputPerMillionUsd
    + usage.cacheWriteTokens * price.cacheWritePerMillionUsd
    + usage.outputTokens * price.outputPerMillionUsd
  ) / 1_000_000;
}

function readOpenAIUsage(response: any, label: string): OpenAIUsageSnapshot {
  const usage = response?.usage || {};
  const snapshot: OpenAIUsageSnapshot = {
    label,
    model: String(response?.model || 'unknown'),
    status: String(response?.status || 'unknown'),
    incompleteReason: response?.incomplete_details?.reason
      ? String(response.incomplete_details.reason)
      : null,
    inputTokens: Number(usage.input_tokens || 0),
    cachedInputTokens: Number(usage.input_tokens_details?.cached_tokens || 0),
    cacheWriteTokens: Number(usage.input_tokens_details?.cache_write_tokens || 0),
    outputTokens: Number(usage.output_tokens || 0),
    reasoningTokens: Number(usage.output_tokens_details?.reasoning_tokens || 0),
    totalTokens: Number(usage.total_tokens || 0),
    webSearchCalls: Array.isArray(response?.output)
      ? response.output.filter((item: any) => item?.type === 'web_search_call').length
      : 0,
    requestId: response?._request_id ? String(response._request_id) : null,
    estimatedTokenCostUsd: null,
  };
  snapshot.estimatedTokenCostUsd = estimateOpenAITokenCostUsd(snapshot.model, snapshot);
  return snapshot;
}

function validUsageToken(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && Number.isInteger(value);
}

function validateOpenAIResponse(response: unknown, operation: string): void {
  const record = response && typeof response === 'object' && !Array.isArray(response)
    ? response as Record<string, any>
    : null;
  const usage = record?.usage && typeof record.usage === 'object' && !Array.isArray(record.usage)
    ? record.usage as Record<string, unknown>
    : null;
  if (
    !record
    || typeof record.id !== 'string'
    || record.id.length === 0
    || typeof record.model !== 'string'
    || record.model.length === 0
    || typeof record.status !== 'string'
    || !Array.isArray(record.output)
    || !usage
    || !validUsageToken(usage.input_tokens)
    || !validUsageToken(usage.output_tokens)
    || !validUsageToken(usage.total_tokens)
  ) {
    // The SDK returned a value, so the HTTP request may already be billable.
    // Mark it as a 2xx-shaped invalid response for conservative accounting.
    throw new ProviderError('OpenAI returned a malformed success response', {
      provider: 'openai',
      kind: 'INVALID_RESPONSE',
      retryable: false,
      status: 200,
      operation,
    });
  }
}

export function logOpenAIUsage(response: any, label: string): OpenAIUsageSnapshot {
  const snapshot = readOpenAIUsage(response, label);
  console.log('🤖 OpenAI usage:', snapshot);
  return snapshot;
}

export async function createOpenAIResponse(
  payload: Record<string, any>,
  label: string
): Promise<any> {
  const model = String(payload.model || 'unknown');
  const estimatedInputTokens = Math.ceil(JSON.stringify(payload.input || '').length / 3)
    + countEstimatedImageTokens(payload.input);
  const estimatedCostUsd = estimateOpenAITokenCostUsd(model, {
    inputTokens: estimatedInputTokens,
    cachedInputTokens: 0,
    // Admission control assumes a first-seen prompt that incurs the 1.25x
    // cache-write rate. Actual usage reconciles the reservation afterward.
    cacheWriteTokens: estimatedInputTokens,
    outputTokens: Math.max(0, Number(payload.max_output_tokens || 5000)),
  });
  // A model alias without an explicit price would otherwise bypass every
  // monthly/per-job cost ceiling. Only centrally-priced model names are
  // allowed; add a reviewed price entry before enabling another model.
  if (estimatedCostUsd === null) {
    throw new ProviderError(`OpenAI pricing is not configured for model: ${model}`, {
      provider: 'openai',
      kind: 'CONFIGURATION',
      retryable: false,
      operation: label,
    });
  }
  const reservation = await reserveAIBudget(estimatedCostUsd, 'openai', label);
  const startedAt = Date.now();
  const safetyIdentifier = getAISafetyIdentifier();
  // This is a support/observability correlation header, not an idempotency
  // guarantee. Queue/application locks remain responsible for deduplication.
  const clientRequestId = crypto.randomUUID();
  const safePayload = safetyIdentifier && !payload.safety_identifier
    ? { ...payload, safety_identifier: safetyIdentifier }
    : payload;
  try {
    const response = await runWithOpenAIFallback(
      (client) => client.responses.create(safePayload as any, {
          headers: { 'X-Client-Request-Id': clientRequestId },
        }),
      {
        model,
        operation: label,
        estimatedTokens: estimatedInputTokens
          + Math.max(0, Number(payload.max_output_tokens || 5000)),
      },
    );
    validateOpenAIResponse(response, label);
    const usage = logOpenAIUsage(response, label);
    // If OpenAI returns an unexpected resolved model name, retain the
    // conservative reservation instead of recording a successful $0 call.
    const actualCostUsd = usage.estimatedTokenCostUsd ?? reservation.reservedCostUsd;
    const costBasis = usage.estimatedTokenCostUsd === null
      ? 'upper_bound' as const
      : 'provider_usage' as const;
    await reservation.settle(actualCostUsd);
    await recordAIUsageEvent({
      provider: 'openai',
      operation: label,
      model: usage.model,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      costUsd: actualCostUsd,
      costBasis,
      requestId: usage.requestId || clientRequestId,
      latencyMs: Date.now() - startedAt,
      success: true,
    });
    return response;
  } catch (error) {
    const failure = normalizeProviderError('openai', error, label);
    // A local timeout or connection loss can happen after OpenAI accepted and
    // processed the request. Keep the reserved upper bound in those ambiguous
    // cases; reconcile it operationally with provider usage instead of
    // silently undercounting spend. Explicit HTTP failures are known-zero here.
    const ambiguousBilling = failure.kind === 'TIMEOUT'
      || failure.kind === 'UNKNOWN'
      || (failure.status !== undefined && failure.status >= 200 && failure.status < 300)
      || (failure.kind === 'UPSTREAM_UNAVAILABLE' && failure.status === undefined);
    const failureCostUsd = ambiguousBilling ? reservation.reservedCostUsd : 0;
    await reservation.settle(failureCostUsd);
    await recordAIUsageEvent({
      provider: 'openai',
      operation: label,
      model,
      costUsd: failureCostUsd,
      costBasis: ambiguousBilling ? 'upper_bound' : 'known_zero',
      requestId: failure.requestId || clientRequestId,
      latencyMs: Date.now() - startedAt,
      success: false,
      errorKind: failure.kind,
    });
    throw failure;
  }
}

function countEstimatedImageTokens(input: unknown): number {
  let low = 0;
  let high = 0;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record.type === 'input_image') {
      if (record.detail === 'low') low += 1;
      else high += 1;
    }
    Object.values(record).forEach(visit);
  };
  visit(input);
  // Conservative upper bounds used only for admission control, not invoicing.
  return low * 1_000 + high * 8_000;
}

export function buildOpenAIReasoning(effort: OpenAIReasoningEffort) {
  return {
    effort,
    mode: 'standard',
    summary: 'auto',
  };
}

export const OPENAI_RESPONSE_INCLUDES = [
  'reasoning.encrypted_content',
  'web_search_call.action.sources',
] as const;

// Extracts assistant text from a Responses API result (output_text convenience
// field, or the concatenated output_text parts).
export function getOpenAIResponseText(response: any): string {
  if (typeof response?.output_text === 'string' && response.output_text) {
    return response.output_text;
  }
  if (!Array.isArray(response?.output)) return '';
  return response.output
    .filter((item: any) => item?.type === 'message')
    .flatMap((item: any) => item?.content || [])
    .filter((part: any) => part?.type === 'output_text' && typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('\n');
}

function shouldStoreOpenAIResponses(): boolean {
  return ['true', '1', 'yes', 'on'].includes(
    String(process.env.OPENAI_STORE_RESPONSES || '').trim().toLowerCase()
  );
}

// Builds a Responses API image content part from a data: URL or a remote URL.
export type OpenAIImageDetail = 'low' | 'high';

function toOpenAIImagePart(image: string, detail: OpenAIImageDetail = 'high'): any | null {
  if (!image || typeof image !== 'string') return null;
  if (image.startsWith('data:') || image.startsWith('http://') || image.startsWith('https://')) {
    return { type: 'input_image', image_url: image, detail };
  }
  return { type: 'input_image', image_url: `data:image/jpeg;base64,${image}`, detail };
}

export interface OpenAIVisionJsonOptions {
  userText: string;
  images: string[];
  system?: string;
  model?: string;
  maxOutputTokens?: number;
  reasoningEffort?: OpenAIReasoningEffort;
  label?: string;
  schema?: Record<string, any>;
  schemaName?: string;
  promptCacheKey?: string;
  imageDetail?: OpenAIImageDetail;
}

function promptCacheKey(model: string, task: string, explicit?: string): string {
  const safeTask = (explicit || task).replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 120);
  const shard = getAISafetyIdentifier()?.slice(-1) || '0';
  return `pawnline:${model}:${safeTask}:v1:${shard}`;
}

const cacheableSystemContent = (text: string) => [{
  type: 'input_text',
  text,
  prompt_cache_breakpoint: { mode: 'explicit' },
}];

// Vision + text -> JSON via the Responses API (json_object format guarantees a
// parseable object). Returns null if nothing usable came back.
export async function openaiVisionJson<T>(opts: OpenAIVisionJsonOptions): Promise<T | null> {
  const content: any[] = [{ type: 'input_text', text: opts.userText }];
  for (const image of opts.images) {
    const part = toOpenAIImagePart(image, opts.imageDetail);
    if (part) content.push(part);
  }

  const input: any[] = [];
  input.push({
    role: 'system',
    content: cacheableSystemContent(
      opts.system || 'Return only the requested structured result. Follow the supplied JSON schema exactly.'
    ),
  });
  input.push({ role: 'user', content });

  const model = opts.model || getOpenAIVisionModel();
  const response = await createOpenAIResponse({
    model,
    input,
    text: {
      format: opts.schema
        ? {
            type: 'json_schema',
            name: opts.schemaName || 'structured_response',
            strict: true,
            schema: opts.schema,
          }
        : { type: 'json_object' },
      verbosity: 'medium',
    },
    reasoning: buildOpenAIReasoning(opts.reasoningEffort || getOpenAILunaReasoningEffort()),
    max_output_tokens: opts.maxOutputTokens ?? 5000,
    prompt_cache_key: promptCacheKey(
      model,
      opts.schemaName || opts.label || 'openai_vision_json',
      opts.promptCacheKey
    ),
    prompt_cache_options: { mode: 'explicit', ttl: '30m' },
    store: shouldStoreOpenAIResponses(),
    include: OPENAI_RESPONSE_INCLUDES,
  }, opts.label || 'openai_vision_json');

  return parseJsonFromText<T>(getOpenAIResponseText(response));
}

export interface OpenAIStructuredJsonOptions<T> {
  userText: string;
  schema: Record<string, any>;
  schemaName: string;
  model?: string;
  effort?: OpenAIReasoningEffort;
  maxOutputTokens?: number;
  system?: string;
  images?: string[];
  label?: string;
  onUsage?: (usage: OpenAIUsageSnapshot) => void;
  promptCacheKey?: string;
  imageDetail?: OpenAIImageDetail;
  _type?: T;
}

export async function openaiStructuredJson<T>(
  opts: OpenAIStructuredJsonOptions<T>
): Promise<T | null> {
  const content: any[] = [{ type: 'input_text', text: opts.userText }];
  for (const image of opts.images || []) {
    const part = toOpenAIImagePart(image, opts.imageDetail);
    if (part) content.push(part);
  }

  const input: any[] = [];
  input.push({
    role: 'system',
    content: cacheableSystemContent(
      opts.system || 'Return only the requested structured result. Follow the supplied JSON schema exactly.'
    ),
  });
  input.push({ role: 'user', content });

  const label = opts.label || opts.schemaName;
  const model = opts.model || getOpenAITerraModel();
  const response = await createOpenAIResponse({
    model,
    input,
    text: {
      format: {
        type: 'json_schema',
        name: opts.schemaName,
        strict: true,
        schema: opts.schema,
      },
      verbosity: 'medium',
    },
    reasoning: buildOpenAIReasoning(opts.effort || getOpenAITerraReasoningEffort()),
    max_output_tokens: opts.maxOutputTokens ?? 5000,
    prompt_cache_key: promptCacheKey(model, opts.schemaName, opts.promptCacheKey),
    prompt_cache_options: { mode: 'explicit', ttl: '30m' },
    store: shouldStoreOpenAIResponses(),
    include: OPENAI_RESPONSE_INCLUDES,
  }, label);

  opts.onUsage?.(readOpenAIUsage(response, label));
  return parseJsonFromText<T>(getOpenAIResponseText(response));
}
