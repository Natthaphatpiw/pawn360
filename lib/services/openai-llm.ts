// Shared OpenAI client + vision helper (mirrors lib/services/anthropic-llm.ts).
//
// Used by the condition-scoring pipeline (gpt-5.6-luna vision via the Responses
// API). The estimate pipeline keeps its own inline OpenAI web-search calls; this
// module is the shared path for structured vision/text calls.

import OpenAI from 'openai';
import { collectEnvKeys } from '@/lib/utils/env';
import { parseJsonFromText } from '@/lib/services/anthropic-llm';

const OPENAI_KEYS = collectEnvKeys([
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_API_KEY_2,
  process.env.OPENAI_API_KEY_3,
  process.env.OPENAI_API_KEY_4,
]);

const openaiClients = OPENAI_KEYS.map((apiKey) => new OpenAI({ apiKey }));

export const hasOpenAIKeys = () => openaiClients.length > 0;

// Newest OpenAI vision/text model. Overridable via env for quick model swaps.
export function getOpenAIVisionModel(): string {
  return process.env.OPENAI_VISION_MODEL || 'gpt-5.6-luna';
}

function getReasoningEffort(): string {
  return process.env.OPENAI_VISION_REASONING_EFFORT || 'low';
}

const isOpenAIRateLimitError = (error: any): boolean => {
  const status = error?.status ?? error?.response?.status;
  if (status === 429) return true;
  const code = `${error?.code || error?.error?.code || ''}`.toLowerCase();
  const message = `${error?.message || ''} ${error?.error?.message || ''}`.toLowerCase();
  return (
    code.includes('rate_limit') ||
    code.includes('insufficient_quota') ||
    message.includes('rate limit') ||
    message.includes('insufficient quota') ||
    message.includes('quota') ||
    message.includes('429')
  );
};

// Rotates across keys on rate-limit/quota errors; other errors throw immediately.
export async function runWithOpenAIFallback<T>(task: (client: OpenAI) => Promise<T>): Promise<T> {
  if (!hasOpenAIKeys()) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  let lastError: any;
  for (let i = 0; i < openaiClients.length; i++) {
    try {
      return await task(openaiClients[i]);
    } catch (error) {
      lastError = error;
      if (isOpenAIRateLimitError(error) && i < openaiClients.length - 1) {
        console.warn(`⚠️ OpenAI rate limit (key ${i + 1}). Switching to fallback key ${i + 2}.`);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

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

// Builds a Responses API image content part from a data: URL or a remote URL.
function toOpenAIImagePart(image: string): any | null {
  if (!image || typeof image !== 'string') return null;
  if (image.startsWith('data:') || image.startsWith('http://') || image.startsWith('https://')) {
    return { type: 'input_image', image_url: image };
  }
  return { type: 'input_image', image_url: `data:image/jpeg;base64,${image}` };
}

export interface OpenAIVisionJsonOptions {
  userText: string;
  images: string[];
  system?: string;
  model?: string;
  maxOutputTokens?: number;
  reasoningEffort?: string;
}

// Vision + text -> JSON via the Responses API (json_object format guarantees a
// parseable object). Returns null if nothing usable came back.
export async function openaiVisionJson<T>(opts: OpenAIVisionJsonOptions): Promise<T | null> {
  const content: any[] = [{ type: 'input_text', text: opts.userText }];
  for (const image of opts.images) {
    const part = toOpenAIImagePart(image);
    if (part) content.push(part);
  }

  const input: any[] = [];
  if (opts.system) {
    input.push({ role: 'system', content: [{ type: 'input_text', text: opts.system }] });
  }
  input.push({ role: 'user', content });

  const response = await runWithOpenAIFallback((client) =>
    client.responses.create({
      model: opts.model || getOpenAIVisionModel(),
      input,
      text: { format: { type: 'json_object' } },
      reasoning: { effort: (opts.reasoningEffort || getReasoningEffort()) as any },
      max_output_tokens: opts.maxOutputTokens ?? 3000,
      store: false,
    } as any)
  );

  return parseJsonFromText<T>(getOpenAIResponseText(response));
}
