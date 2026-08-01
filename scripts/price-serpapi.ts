import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { resolveStructuredPriceEvidence } from '../lib/services/price-evidence';

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
const DEFAULT_EXCHANGE_RATE_THB_PER_USD = 32;
const MAX_OUTPUT_TOKENS = 2500;

const buildQuery = () => {
  const parts = [INPUT.brand, INPUT.model, INPUT.capacity, INPUT.storage]
    .map((value) => value.trim())
    .filter(Boolean);
  return `${parts.join(' ')} used`;
};

const getExchangeRate = () => {
  const parsed = Number(process.env.SERPAPI_EXCHANGE_RATE_THB_PER_USD);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_EXCHANGE_RATE_THB_PER_USD;
};

async function main() {
  // Load the shared production client only after .env.local has been loaded.
  // This keeps the script on the same timeout, typed-error, telemetry, cache,
  // safety-identifier, and budget path as the application.
  const {
    getOpenAIReasoningEffortForTask,
    getOpenAITerraModel,
    openaiStructuredJson,
  } = await import('../lib/services/openai-llm');
  const { withProviderCapacity } = await import('../lib/services/provider-capacity');

  const apiKey = process.env.SERPAPI_API_KEY?.trim();
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

  const response = await withProviderCapacity(
    {
      provider: 'serpapi',
      model: 'google_shopping_light',
      operation: 'price_serpapi_script',
      leaseMs: 45_000,
    },
    () => fetch(`https://serpapi.com/search.json?${params.toString()}`),
  );
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
      const snippet = result.snippet ?? result.description ?? null;
      const evidence = resolveStructuredPriceEvidence({
        extractedPrice: result.extracted_price,
        priceText: result.price,
        currencyHint: result.currency,
        title: result.title,
        excerpt: snippet,
        exchangeRate,
      });
      if (!evidence) return null;
      return {
        id: `item_${index + 1}`,
        title: result.title ?? null,
        source: result.source ?? result.store ?? result.seller ?? 'Unknown',
        url: result.link ?? result.product_link ?? null,
        price_usd: evidence.currency === 'USD' ? evidence.amount : undefined,
        price_thb: evidence.priceThb,
        price_currency: evidence.currency,
        evidence_fingerprint: evidence.fingerprint,
        condition: result.condition ?? result.product_condition ?? null,
        snippet,
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

  const parsed = await openaiStructuredJson<{
    query: string;
    exchange_rate_thb_per_usd: number;
    fetched_at: string;
    keep_item_ids: string[];
  }>({
    model: getOpenAITerraModel(),
    userText: prompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    effort: getOpenAIReasoningEffortForTask('notebook_serpapi_filter'),
    label: 'script_notebook_serpapi_filter',
    promptCacheKey: 'notebook_serpapi_filter',
    schemaName: 'serpapi_cleaned_prices',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        exchange_rate_thb_per_usd: { type: 'number' },
        fetched_at: { type: 'string' },
        keep_item_ids: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['query', 'exchange_rate_thb_per_usd', 'fetched_at', 'keep_item_ids'],
    },
  });

  if (!parsed) {
    throw new Error('OpenAI returned no valid structured SerpAPI filter result.');
  }

  const keepIds = new Set(Array.isArray(parsed.keep_item_ids) ? parsed.keep_item_ids : []);
  const cleanedItems = candidateItems
    .filter((item: any) => keepIds.has(item.id))
    .map((item: any) => ({
      title: item.title,
      source: item.source,
      url: item.url,
      price_usd: item.price_usd,
      price_thb: item.price_thb,
      price_currency: item.price_currency,
      evidence_fingerprint: item.evidence_fingerprint,
    }));

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
