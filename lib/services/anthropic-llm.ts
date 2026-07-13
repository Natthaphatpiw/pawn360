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

const isAnthropicRateLimitError = (status: number, body: any): boolean => {
  if (status === 429 || status === 529) return true;
  const type = `${body?.error?.type || ''}`.toLowerCase();
  return type.includes('rate_limit') || type.includes('overloaded');
};

// Calls the Anthropic Messages API over the configured keys, rotating to the next
// key on rate-limit / overloaded / network failures.
export async function callAnthropicMessages(payload: Record<string, any>): Promise<any> {
  if (!hasAnthropicKeys()) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  let lastError: any;
  for (let i = 0; i < ANTHROPIC_KEYS.length; i++) {
    const apiKey = ANTHROPIC_KEYS[i];

    const res: Response | null = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).then(
      (response) => response,
      (networkError) => {
        lastError = networkError;
        return null;
      }
    );

    if (!res) {
      if (i < ANTHROPIC_KEYS.length - 1) continue;
      throw lastError ?? new Error('Anthropic request failed');
    }

    const data = await res.json().catch(() => null);
    if (res.ok) return data;

    if (isAnthropicRateLimitError(res.status, data) && i < ANTHROPIC_KEYS.length - 1) {
      console.warn(`⚠️ Anthropic rate limit/overloaded (status ${res.status}). Switching to fallback key ${i + 2}.`);
      lastError = new Error(`Anthropic API error ${res.status}`);
      continue;
    }

    throw new Error(`Anthropic API error ${res.status}: ${data?.error?.message || 'unknown error'}`);
  }

  throw lastError ?? new Error('Anthropic request failed');
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
  });

  const block = Array.isArray(data?.content)
    ? data.content.find((b: any) => b?.type === 'tool_use' && b?.name === toolName)
    : null;

  if (block && block.input && typeof block.input === 'object') {
    return block.input as T;
  }

  // Fallback: some responses may put JSON in a text block instead of tool input.
  return parseJsonFromText<T>(getAnthropicResponseText(data?.content));
}
