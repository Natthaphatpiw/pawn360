import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const INPUT = {
  brand: 'Apple',
  model: 'macbook air m1',
  capacity: '',
  storage: '256GB',
};

const OUTPUT_DIR = path.join('scripts', 'output');
const RAW_OUTPUT_PATH = path.join(OUTPUT_DIR, 'serpapi_raw.json');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'serpapi_prices.json');
const LLM_DEBUG_PATH = path.join(OUTPUT_DIR, 'serpapi_llm_debug.json');
const DEFAULT_EXCHANGE_RATE_THB_PER_USD = 32;
const MODEL = 'gpt-5.2';
const MAX_OUTPUT_TOKENS = 600;

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const buildQuery = () => {
  const parts = [INPUT.brand, INPUT.model, INPUT.capacity, INPUT.storage]
    .map((value) => value.trim())
    .filter(Boolean);
  return `${parts.join(' ')} used`;
};

const getResponseText = (response: any): string => {
  if (typeof response?.output_text === 'string') {
    return response.output_text;
  }

  if (!Array.isArray(response?.output)) {
    return '';
  }

  const chunks: string[] = [];

  for (const item of response.output) {
    if (item?.type === 'output_text' && typeof item.text === 'string') {
      chunks.push(item.text);
      continue;
    }

    if (item?.type === 'message') {
      const content = Array.isArray(item.content) ? item.content : [];
      for (const part of content) {
        if (part?.type === 'output_text' && typeof part?.text === 'string') {
          chunks.push(part.text);
        }
      }
    }
  }

  return chunks.join('\n');
};

const parseJsonFromText = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const getExchangeRate = () => {
  const parsed = Number(process.env.SERPAPI_EXCHANGE_RATE_THB_PER_USD);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_EXCHANGE_RATE_THB_PER_USD;
};

const extractUsdPrice = (item: any): number | null => {
  if (typeof item?.extracted_price === 'number' && Number.isFinite(item.extracted_price)) {
    return item.extracted_price;
  }

  const priceStr = String(item?.price || '');
  const match = priceStr.replace(/,/g, '').match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
};

const usdToThb = (usd: number, exchangeRate: number) => Math.round(usd * exchangeRate * 100) / 100;

async function main() {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const apiKey = "43a547c506c8f8e5f8feb979d67081b5e5b2fee59be487d8bd2b79b9d3130e6b";
  if (!apiKey) {
    throw new Error('SERPAPI_API_KEY is not configured');
  }

  const query = buildQuery();
  const fetchedAt = new Date().toISOString();
  const params = new URLSearchParams({
    engine: 'google_shopping_light',
    q: query,
    api_key: apiKey,
  });

  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`SerpAPI request failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const shoppingResults = Array.isArray(json.shopping_results) ? json.shopping_results : [];
  const exchangeRate = getExchangeRate();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(RAW_OUTPUT_PATH, JSON.stringify({
    query,
    fetched_at: fetchedAt,
    response: json,
  }, null, 2), 'utf-8');

  const candidateItems = shoppingResults
    .map((result: any, index: number) => {
      if (!result?.title) return null;
      const usd = extractUsdPrice(result);
      if (usd === null) return null;
      return {
        id: `item_${index + 1}`,
        title: result.title ?? null,
        source: result.source ?? result.store ?? result.seller ?? 'Unknown',
        url: result.link ?? result.product_link ?? null,
        price_usd: usd,
        price_thb: usdToThb(usd, exchangeRate),
        condition: result.condition ?? result.product_condition ?? null,
        snippet: result.snippet ?? result.description ?? null,
      };
    })
    .filter(Boolean);

  const llmInput = {
    query,
    exchange_rate_thb_per_usd: exchangeRate,
    fetched_at: fetchedAt,
    items: candidateItems,
  };

  const prompt = `You are a pricing analyst. Filter SerpAPI Google Shopping results to keep only listings that truly match the exact product.
Product spec:
- brand: ${INPUT.brand}
- model: ${INPUT.model}
- capacity: ${INPUT.capacity || '(none)'}
- storage: ${INPUT.storage || '(none)'}
Rules:
- Keep only items that match the exact model and storage/capacity. Exclude other generations (M2/M3/M4), other storage sizes, other product lines (Pro), accessories, bundles, parts, or services.
- Exclude listings with non-comparable conditions: for parts/repair, broken, bad display, read description, grade C, scratch and dent, fair/poor condition, as-is, or similar disclaimers.
- Used/Pre-owned/Good/Excellent are OK if not flagged as non-comparable.
- If unsure, exclude.
- Do not change prices or add new items. Only filter by returning IDs.
Input JSON (some item fields like condition/snippet are provided to help filtering):
${JSON.stringify(llmInput, null, 2)}
Return JSON only with:
{
  "query": "${query}",
  "exchange_rate_thb_per_usd": ${exchangeRate},
  "fetched_at": "${fetchedAt}",
  "keep_item_ids": ["item_1", "item_7"]
}`;

  const llmResponse = await openai.responses.create({
    model: MODEL,
    input: prompt,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    text: {
      format: {
        type: 'json_schema',
        name: 'serpapi_cleaned_prices',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            query: { type: 'string' },
            exchange_rate_thb_per_usd: { type: 'number' },
            fetched_at: { type: 'string' },
            keep_item_ids: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
          required: ['query', 'exchange_rate_thb_per_usd', 'fetched_at', 'keep_item_ids'],
        },
      },
    },
  });

  const content = getResponseText(llmResponse);
  const parsed = parseJsonFromText(content);

  if (!parsed) {
    fs.writeFileSync(LLM_DEBUG_PATH, JSON.stringify({ content, response: llmResponse }, null, 2), 'utf-8');
    throw new Error(`Failed to parse LLM JSON response. Saved debug to ${LLM_DEBUG_PATH}`);
  }

  const keepIds = new Set(Array.isArray(parsed.keep_item_ids) ? parsed.keep_item_ids : []);
  const cleanedItems = candidateItems
    .filter((item: any) => keepIds.has(item.id))
    .map(({ id, condition, snippet, ...rest }: any) => rest);

  const cleanedPayload = {
    query,
    exchange_rate_thb_per_usd: exchangeRate,
    fetched_at: fetchedAt,
    items: cleanedItems,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cleanedPayload, null, 2), 'utf-8');

  console.log(`Saved SerpAPI raw results to ${RAW_OUTPUT_PATH}`);
  console.log(`Saved SerpAPI cleaned results to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
