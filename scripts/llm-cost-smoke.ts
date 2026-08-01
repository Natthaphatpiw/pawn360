import 'dotenv/config';

import fs from 'fs';
import path from 'path';
import {
  estimateOpenAITokenCostUsd,
  getOpenAILunaModel,
  getOpenAITerraModel,
  OPENAI_MODEL_PRICING,
  OpenAIReasoningEffort,
  OpenAIUsageSnapshot,
  openaiStructuredJson,
} from '../lib/services/openai-llm';
import { searchMarket } from '../lib/services/market-search';

const THB_PER_USD = Number(process.env.SERPAPI_EXCHANGE_RATE_THB_PER_USD || 32);

const usageRows: Array<OpenAIUsageSnapshot & { costUsd: number; costThb: number }> = [];
const searchRows: Array<{
  step: string;
  provider: string;
  cacheStatus: string;
  resultCount: number;
  costUsd: number;
  costThb: number;
}> = [];

function computeCost(usage: OpenAIUsageSnapshot) {
  const costUsd = estimateOpenAITokenCostUsd(usage.model, usage) || 0;
  return { costUsd, costThb: costUsd * THB_PER_USD };
}

function capture(usage: OpenAIUsageSnapshot) {
  usageRows.push({ ...usage, ...computeCost(usage) });
}

const SIMPLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    result: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['result', 'confidence'],
};

async function structuredProbe(options: {
  label: string;
  model: string;
  effort: OpenAIReasoningEffort;
  prompt: string;
  image?: string;
  imageDetail?: 'low' | 'high';
  maxOutputTokens?: number;
}) {
  const parsed = await openaiStructuredJson<{ result: string; confidence: number }>({
    userText: options.prompt,
    images: options.image ? [options.image] : undefined,
    imageDetail: options.imageDetail,
    model: options.model,
    effort: options.effort,
    schemaName: options.label,
    schema: SIMPLE_SCHEMA,
    maxOutputTokens: options.maxOutputTokens || 4000,
    label: options.label,
    onUsage: capture,
  });
  if (!parsed) throw new Error(`${options.label} returned no structured output`);
}

async function marketSearchProbe(options: {
  label: string;
  objective: string;
  queries: string[];
}) {
  const response = await searchMarket({
    objective: options.objective,
    searchQueries: options.queries,
    cacheKey: `cost-smoke:${options.label}`,
    maxResults: 10,
  });
  searchRows.push({
    step: options.label,
    provider: response.metadata.provider,
    cacheStatus: response.metadata.cacheStatus,
    resultCount: response.items.length,
    costUsd: response.metadata.costUsd,
    costThb: response.metadata.costUsd * THB_PER_USD,
  });
}

async function main() {
  const requested = new Set(process.argv.slice(2));
  const shouldRun = (label: string) => requested.size === 0 || requested.has(label);
  const imagePath = path.join(process.cwd(), 'public', 'landing', 'com4.png');
  const imageData = fs.readFileSync(imagePath).toString('base64');
  const image = `data:image/png;base64,${imageData}`;

  if (shouldRun('luna_image_precheck')) await structuredProbe({
    label: 'luna_image_precheck',
    model: getOpenAILunaModel(),
    effort: 'none',
    image,
    imageDetail: 'low',
    prompt: 'Inspect the image. State whether it contains a phone and whether the image is clear enough for a basic item-type precheck.',
  });

  if (shouldRun('luna_vision_analysis')) await structuredProbe({
    label: 'luna_vision_analysis',
    model: getOpenAILunaModel(),
    effort: 'low',
    image,
    imageDetail: 'high',
    prompt: 'Inspect the visible phone only. Give a short, conservative note about what can and cannot be assessed from this single image.',
  });

  if (shouldRun('terra_generic_normalize')) await structuredProbe({
    label: 'terra_generic_normalize',
    model: getOpenAITerraModel(),
    effort: 'none',
    prompt: 'Normalize this Thai used-market product name for search: Apple iPhone 15 Pro Max 256GB. Return the normalized name in result.',
  });

  if (shouldRun('terra_generic_serp_filter')) await structuredProbe({
    label: 'terra_generic_serp_filter',
    model: getOpenAITerraModel(),
    effort: 'none',
    prompt: 'Choose the exact used iPhone 15 Pro Max 256GB listing from: A) iPhone 15 Pro Max 256GB used, B) iPhone 15 Pro 128GB, C) phone case. Return the chosen letter in result.',
  });

  if (shouldRun('parallel_generic_market_search')) await marketSearchProbe({
    label: 'parallel_generic_market_search',
    objective: 'Find current used Apple iPhone 15 Pro Max 256GB prices in Thailand.',
    queries: ['iPhone 15 Pro Max 256GB มือสอง ราคา', 'iPhone 15 Pro Max 256GB used Thailand'],
  });

  if (shouldRun('terra_generic_market_extract')) await structuredProbe({
    label: 'terra_generic_market_extract',
    model: getOpenAITerraModel(),
    effort: 'low',
    prompt: 'Extract the exact used-product price from this normalized evidence: iPhone 15 Pro Max 256GB used, THB 25,900. Return the THB price in result.',
    maxOutputTokens: 2500,
  });

  if (shouldRun('terra_notebook_normalize')) await structuredProbe({
    label: 'terra_notebook_normalize',
    model: getOpenAITerraModel(),
    effort: 'none',
    prompt: 'Normalize this laptop for Thai used-market search: Lenovo IdeaPad Gaming 3 15ACH6, Ryzen 5 5600H, RAM 16GB, NVMe 512GB, RTX 3050. Return one canonical product name in result.',
    maxOutputTokens: 6000,
  });

  if (shouldRun('terra_notebook_canonicalize')) await structuredProbe({
    label: 'terra_notebook_canonicalize',
    model: getOpenAITerraModel(),
    effort: 'low',
    prompt: 'Canonicalize the family, CPU, RAM, storage, GPU, release year and segment for Lenovo IdeaPad Gaming 3 15ACH6 Ryzen 5 5600H 16GB 512GB RTX 3050. Summarize all canonical fields in result.',
    maxOutputTokens: 8000,
  });

  if (shouldRun('terra_notebook_serp_filter')) await structuredProbe({
    label: 'terra_notebook_serp_filter',
    model: getOpenAITerraModel(),
    effort: 'low',
    prompt: 'Choose the exact comparable listing for Lenovo IdeaPad Gaming 3 15ACH6 Ryzen 5 5600H RTX 3050 from: A) exact used model, B) IdeaPad 3 office model, C) charger only. Return the chosen letter in result.',
    maxOutputTokens: 9000,
  });

  if (shouldRun('parallel_notebook_market_search')) await marketSearchProbe({
    label: 'parallel_notebook_market_search',
    objective: 'Find Thai used listings and new-price anchors for Lenovo IdeaPad Gaming 3 15ACH6 Ryzen 5 5600H 16GB 512GB RTX 3050.',
    queries: [
      'Lenovo IdeaPad Gaming 3 15ACH6 Ryzen 5 5600H RTX 3050 มือสอง ราคา',
      'Lenovo IdeaPad Gaming 3 15ACH6 new price Thailand',
    ],
  });

  if (shouldRun('terra_notebook_market_extract')) await structuredProbe({
    label: 'terra_notebook_market_extract',
    model: getOpenAITerraModel(),
    effort: 'low',
    prompt: 'Classify this normalized notebook evidence: Lenovo IdeaPad Gaming 3 15ACH6 Ryzen 5 5600H 16GB 512GB RTX 3050 used THB 18,900. Return listing kind and price in result.',
    maxOutputTokens: 4000,
  });

  const totalUsd = usageRows.reduce((sum, row) => sum + row.costUsd, 0)
    + searchRows.reduce((sum, row) => sum + row.costUsd, 0);
  const totalThb = usageRows.reduce((sum, row) => sum + row.costThb, 0)
    + searchRows.reduce((sum, row) => sum + row.costThb, 0);
  console.table(usageRows.map((row) => ({
    step: row.label,
    model: row.model,
    status: row.status,
    input: row.inputTokens,
    cached: row.cachedInputTokens,
    output: row.outputTokens,
    reasoning: row.reasoningTokens,
    webCalls: row.webSearchCalls,
    usd: row.costUsd.toFixed(6),
    thb: row.costThb.toFixed(4),
  })));
  if (searchRows.length > 0) console.table(searchRows);
  console.log(JSON.stringify({
    pricing: 'OpenAI standard, short-context pricing as of 2026-08-01',
    openAIModelPricing: OPENAI_MODEL_PRICING,
    exchangeRateThbPerUsd: THB_PER_USD,
    totalUsd: Number(totalUsd.toFixed(6)),
    totalThb: Number(totalThb.toFixed(4)),
    rows: usageRows,
    searchRows,
  }, null, 2));
}

main().catch((error) => {
  console.error('LLM cost smoke failed:', error);
  process.exit(1);
});
