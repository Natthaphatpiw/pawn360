// Price-estimation pipeline (all item types, incl. the notebook ladder).
// Extracted from app/api/estimate/route.ts so it can run BOTH synchronously
// (POST /api/estimate) and as a background job (/api/estimate/jobs — see
// lib/services/estimate-jobs.ts). No Next.js request/response types in here.
import OpenAI from 'openai';
import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { computeRepresentativeUsedPriceTHB } from '@/lib/services/price-representative';
import {
  hasAnthropicKeys,
  getAnthropicModel,
  callAnthropicMessages,
  getAnthropicResponseText,
  anthropicStructured,
  parseJsonFromText,
} from '@/lib/services/anthropic-llm';
import { collectEnvKeys, parseBoolEnv } from '@/lib/utils/env';
import { NotebookSpec, extractNotebookSpec } from '@/lib/services/notebook-spec';
import { NotebookListingInput, computeNotebookPrice, NotebookPricingResult } from '@/lib/services/notebook-pricing';
import {
  PriceObservationRow,
  fetchRecentNotebookObservations,
  normalizeFamilyKey,
  saveNotebookObservations,
} from '@/lib/services/price-observations';

const OPENAI_KEYS = collectEnvKeys([
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_API_KEY_2,
  process.env.OPENAI_API_KEY_3,
  process.env.OPENAI_API_KEY_4,
]);

const openaiClients = OPENAI_KEYS.map((apiKey) => new OpenAI({ apiKey }));

const hasOpenAIKeys = () => openaiClients.length > 0;

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

async function runWithOpenAIFallback<T>(task: (client: OpenAI) => Promise<T>): Promise<T> {
  if (!hasOpenAIKeys()) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  let lastError: any;
  for (let i = 0; i < openaiClients.length; i++) {
    const client = openaiClients[i];
    try {
      return await task(client);
    } catch (error) {
      lastError = error;
      if (isOpenAIRateLimitError(error) && i < openaiClients.length - 1) {
        console.warn(`⚠️ OpenAI rate limit hit. Switching to fallback key ${i + 2}.`);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

const PRICE_SEARCH_MODEL = 'gpt-4.1'; // default model only for the optional PRICE_SEARCH_PROVIDER=openai web-search path
const DEFAULT_EXCHANGE_RATE_THB_PER_USD = 32;
const MIN_ESTIMATE_PRICE = 100;
const WEB_SEARCH_MIN_ITEMS = 4;
const WEB_SEARCH_MAX_ITEMS = 8;
const WEB_SEARCH_MAX_OUTPUT_TOKENS = 1200;
const SERPAPI_MAX_ITEMS = 40;
const USE_TH_WEIGHTS = false;
// Loan-to-value: ราคาจำนำ (pawn principal) = ราคากลาง (market price) × this factor.
const PAWN_PRICE_FACTOR = 0.6;
// Blend weights for the final condition score (pawner self-report vs AI assessment).
const PAWNER_CONDITION_WEIGHT = 0.6;
const AI_CONDITION_WEIGHT = 0.4;
// Final estimate is snapped to a multiple of PRICE_SNAP_UNIT, rounding up only at/above PRICE_SNAP_THRESHOLD.
const PRICE_SNAP_UNIT = 1000;
const PRICE_SNAP_THRESHOLD = 500;

// ---- Notebook (laptop) pricing pipeline (see NOTEBOOK_PRICING.md) ----
// Laptops get their own comps+adjustments ladder instead of the plain
// listing-median flow; bumping the pipeline version invalidates cached
// notebook estimates without touching other item types.
const NOTEBOOK_ITEM_TYPE = 'โน้ตบุค';
const NOTEBOOK_PIPELINE_VERSION = 'v4'; // v4: vision spec extraction + junk-input guards + spec-driven SerpAPI
const NOTEBOOK_SEARCH_MIN_ITEMS = 4;
const NOTEBOOK_SEARCH_MAX_ITEMS = 14;
const NOTEBOOK_SEARCH_MAX_OUTPUT_TOKENS = 2400;
// The notebook harvest returns up to 14 wide items — 4096 tokens truncates the
// JSON mid-array, so the Anthropic path gets its own larger budget.
const NOTEBOOK_ANTHROPIC_MAX_TOKENS = 8000;

const isNotebookEstimate = (input: EstimateRequest) => input.itemType === NOTEBOOK_ITEM_TYPE;

// ---- Web-search price provider (OpenAI vs Anthropic/Claude) ----
// The "ราคากลาง" (market reference price) step searches the live web for used-market
// listings. The provider used for THAT step is configurable via env; everything else
// (input normalization, SerpAPI filtering) stays on OpenAI.
type PriceSearchProvider = 'openai' | 'anthropic';

// PRICE_SEARCH_PROVIDER: 'openai' (default) | 'anthropic'
function getPriceSearchProvider(): PriceSearchProvider {
  const value = (process.env.PRICE_SEARCH_PROVIDER || 'openai').trim().toLowerCase();
  return value === 'anthropic' ? 'anthropic' : 'openai';
}

// Model id for the active web-search provider. Override with PRICE_SEARCH_MODEL,
// otherwise fall back to the provider default (gpt-4.1 / claude-sonnet-4-6).
function getPriceSearchModel(provider: PriceSearchProvider): string {
  const configured = process.env.PRICE_SEARCH_MODEL?.trim();
  if (configured) return configured;
  return provider === 'anthropic'
    ? getAnthropicModel()
    : PRICE_SEARCH_MODEL;
}

// Whether to enable the Anthropic web_fetch tool alongside web_search. Default: on.
function isWebFetchEnabledForPriceSearch(): boolean {
  const value = process.env.PRICE_SEARCH_ENABLE_WEB_FETCH;
  if (value === undefined) return true;
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

// ---- Anthropic web-search tool constants (generic client lives in lib/services/anthropic-llm) ----
const ANTHROPIC_WEB_SEARCH_TOOL = 'web_search_20250305';
const ANTHROPIC_WEB_FETCH_TOOL = 'web_fetch_20250910';
const ANTHROPIC_PRICE_SEARCH_MAX_TOKENS = 4096;
const ANTHROPIC_WEB_SEARCH_MAX_USES = 5;
const ANTHROPIC_WEB_FETCH_MAX_USES = 5;
const ANTHROPIC_WEB_FETCH_MAX_CONTENT_TOKENS = 4000;
const ANTHROPIC_MAX_PAUSE_CONTINUATIONS = 4;

const ESTIMATE_CACHE_VERSION = 'v1';
const resolvePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};
const DEFAULT_CACHE_TTL_30_DAYS = 60 * 60 * 24 * 30;
const ESTIMATE_CACHE_TTL_SECONDS = resolvePositiveInt(process.env.ESTIMATE_CACHE_TTL_SECONDS, DEFAULT_CACHE_TTL_30_DAYS);
const IMAGE_HASH_CACHE_TTL_SECONDS = resolvePositiveInt(process.env.ESTIMATE_IMAGE_HASH_CACHE_TTL_SECONDS, DEFAULT_CACHE_TTL_30_DAYS);
const ESTIMATE_CACHE_KEY_PREFIX = `estimate:global:${ESTIMATE_CACHE_VERSION}`;
const IMAGE_HASH_CACHE_KEY_PREFIX = `estimate:image-hash:${ESTIMATE_CACHE_VERSION}`;

let redisClient: Redis | null | undefined;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normalizeConditionInput(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = value > 1 ? value / 100 : value;
  return Math.min(1, Math.max(0, normalized));
}

function blendConditionScores(pawner: number | null, ai: number | null, fallback: number | null): number {
  if (pawner !== null && ai !== null) {
    return Math.min(1, Math.max(0, pawner * PAWNER_CONDITION_WEIGHT + ai * AI_CONDITION_WEIGHT));
  }
  if (pawner !== null) {
    return pawner;
  }
  if (ai !== null) {
    return ai;
  }
  return fallback ?? 0;
}

export interface EstimateRequest {
  itemType: string;
  brand: string;
  model: string;
  capacity?: string;
  serialNo?: string;
  accessories?: string;
  condition: number;
  pawnerCondition?: number;
  aiCondition?: number;
  defects?: string;
  note?: string;
  images: string[];
  imageHashes?: string[];
  lineId: string;
  appleCategory?: string;
  appleSpecs?: string;
  color?: string;
  screenSize?: string;
  watchSize?: string;
  watchConnectivity?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  gpu?: string;
  lenses?: string[];
}

export interface EstimateResponse {
  success: boolean;
  estimatedPrice: number;
  condition: number;
  marketPrice: number;
  pawnPrice: number;
  confidence: number;
  normalizedInput: NormalizedData;
  calculation: {
    marketPrice: string;
    pawnPrice: string;
    finalPrice: string;
  };
}

export interface NormalizedData {
  productName: string;
}

interface SerpapiShoppingItem {
  title: string | null;
  source: string | null;
  url: string | null;
  price_usd: number;
  price_thb: number;
}

interface SerpapiShoppingResults {
  query: string;
  exchange_rate_thb_per_usd: number;
  fetched_at: string;
  items: SerpapiShoppingItem[];
}

interface WebSearchItem {
  title: string;
  price_thb: number;
  source: string;
  url: string;
}

interface WebSearchResult {
  query: string;
  items: WebSearchItem[];
}

interface CombinedItem {
  title: string;
  price_thb: number;
  source: string;
  url?: string;
  origin: 'web_search' | 'serpapi';
  price_usd?: number;
}

function getResponseText(response: any): string {
  if (typeof response?.output_text === 'string') {
    return response.output_text;
  }

  if (!Array.isArray(response?.output)) {
    return '';
  }

  return response.output
    .filter((item: any) => item?.type === 'message')
    .flatMap((item: any) => item?.content || [])
    .filter((part: any) => part?.type === 'output_text' && typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('\n');
}

function getRedisClient() {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const hasUrl = Boolean(process.env.KV_REST_API_URL);
  const hasToken = Boolean(process.env.KV_REST_API_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN);

  if (!hasUrl || !hasToken) {
    redisClient = null;
    return redisClient;
  }

  try {
    redisClient = Redis.fromEnv();
  } catch (error) {
    console.warn('⚠️ Failed to initialize Upstash Redis client:', error);
    redisClient = null;
  }

  return redisClient;
}

const normalizeCacheString = (value?: string | null) => {
  const normalized = (value || '').trim().replace(/\s+/g, ' ');
  return normalized ? normalized.toLowerCase() : null;
};

const normalizeCacheNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100000) / 100000;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100000) / 100000;
    }
  }
  return null;
};

const normalizeCacheStringArray = (values?: string[] | null, sort = false) => {
  const normalized = (values || [])
    .map((value) => normalizeCacheString(value))
    .filter((value): value is string => Boolean(value));
  return sort ? [...normalized].sort() : normalized;
};

const hashValue = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const normalizeImageUrlForHashCache = (imageUrl: string) => {
  try {
    const parsed = new URL(imageUrl);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    const [base] = imageUrl.split('?');
    return base || imageUrl;
  }
};

async function getImageContentHash(imageUrl: string): Promise<string> {
  const normalizedUrl = normalizeImageUrlForHashCache(imageUrl);
  const redis = getRedisClient();
  const cacheLookupKey = `${IMAGE_HASH_CACHE_KEY_PREFIX}:${hashValue(normalizedUrl)}`;

  if (redis) {
    try {
      const cachedHash = await redis.get<string>(cacheLookupKey);
      if (typeof cachedHash === 'string' && cachedHash) {
        return cachedHash;
      }
    } catch (error) {
      console.warn('⚠️ Failed to read image hash cache:', error);
    }
  }

  let contentHash: string;
  try {
    if (imageUrl.startsWith('data:')) {
      contentHash = hashValue(imageUrl);
    } else {
      const response = await fetch(imageUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to fetch image (${response.status})`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
    }
  } catch (error) {
    console.warn('⚠️ Failed to hash image content. Falling back to URL hash:', error);
    contentHash = `url:${hashValue(normalizedUrl)}`;
  }

  if (redis) {
    try {
      await redis.set(cacheLookupKey, contentHash, { ex: IMAGE_HASH_CACHE_TTL_SECONDS });
    } catch (error) {
      console.warn('⚠️ Failed to write image hash cache:', error);
    }
  }

  return contentHash;
}

async function resolveImageHashesForCache(input: EstimateRequest): Promise<string[]> {
  const providedHashes = normalizeCacheStringArray(input.imageHashes, false);
  if (providedHashes.length > 0 && providedHashes.length === input.images.length) {
    return [...providedHashes].sort();
  }

  const calculated = await Promise.all((input.images || []).map((url) => getImageContentHash(url)));
  return calculated.sort();
}

function buildEstimateCachePayload(input: EstimateRequest, imageHashes: string[]) {
  return {
    version: ESTIMATE_CACHE_VERSION,
    itemType: normalizeCacheString(input.itemType),
    brand: normalizeCacheString(input.brand),
    model: normalizeCacheString(input.model),
    capacity: normalizeCacheString(input.capacity),
    serialNo: normalizeCacheString(input.serialNo),
    accessories: normalizeCacheString(input.accessories),
    condition: normalizeCacheNumber(input.condition),
    pawnerCondition: normalizeCacheNumber(input.pawnerCondition),
    aiCondition: normalizeCacheNumber(input.aiCondition),
    defects: normalizeCacheString(input.defects),
    note: normalizeCacheString(input.note),
    appleCategory: normalizeCacheString(input.appleCategory),
    appleSpecs: normalizeCacheString(input.appleSpecs),
    color: normalizeCacheString(input.color),
    screenSize: normalizeCacheString(input.screenSize),
    watchSize: normalizeCacheString(input.watchSize),
    watchConnectivity: normalizeCacheString(input.watchConnectivity),
    cpu: normalizeCacheString(input.cpu),
    ram: normalizeCacheString(input.ram),
    storage: normalizeCacheString(input.storage),
    gpu: normalizeCacheString(input.gpu),
    lenses: normalizeCacheStringArray(input.lenses, true),
    imageHashes,
    // Added ONLY for notebooks so old notebook cache entries (pre-ladder,
    // including the silent ฿100 fallbacks) are invalidated while every other
    // item type keeps its existing cache keys.
    ...(isNotebookEstimate(input) ? { notebookPipeline: NOTEBOOK_PIPELINE_VERSION } : {}),
  };
}

function buildEstimateCacheKey(input: EstimateRequest, imageHashes: string[]) {
  const payload = buildEstimateCachePayload(input, imageHashes);
  const payloadString = JSON.stringify(payload);
  const digest = hashValue(payloadString);
  return `${ESTIMATE_CACHE_KEY_PREFIX}:${digest}`;
}

function isCachedEstimateResponse(value: any): value is EstimateResponse {
  return Boolean(
    value &&
    value.success === true &&
    typeof value.estimatedPrice === 'number' &&
    typeof value.marketPrice === 'number' &&
    typeof value.pawnPrice === 'number' &&
    typeof value.condition === 'number'
  );
}

function isSerpapiEnabled(): boolean {
  return parseBoolEnv(process.env.SERPAPI_ENABLED);
}

function getExchangeRate(): number {
  const parsed = Number(process.env.SERPAPI_EXCHANGE_RATE_THB_PER_USD);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_EXCHANGE_RATE_THB_PER_USD;
}

function buildSerpapiQuery(productName: string): string {
  const hasThai = /[ก-๙]/.test(productName);
  return hasThai ? `${productName} มือสอง` : `${productName} second-hand`;
}

function buildWebSearchQuery(productName: string): string {
  const hasThai = /[ก-๙]/.test(productName);
  return hasThai ? `${productName} ราคา มือสอง` : `${productName} used price Thailand`;
}

function extractUsdPrice(item: any): number | null {
  if (typeof item?.extracted_price === 'number' && Number.isFinite(item.extracted_price)) {
    return item.extracted_price;
  }

  const priceStr = String(item?.price || '');
  const match = priceStr.replace(/,/g, '').match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}

function usdToThb(usd: number, exchangeRate: number): number {
  return Math.round(usd * exchangeRate * 100) / 100;
}

async function fetchWebSearchPricesOpenAI(productName: string): Promise<WebSearchResult | null> {
  if (!hasOpenAIKeys()) {
    return null;
  }

  const query = buildWebSearchQuery(productName);
  const exchangeRate = getExchangeRate();
  const prompt = `You are a pricing analyst. Use web_search at least once with this query: "${query}".
Return ONLY JSON with this shape:
{
  "query": "${query}",
  "items": [
    { "title": "string", "price_thb": number, "source": "string", "url": "string" }
  ]
}
Rules:
- Use only relevant items for the exact model and capacity.
- If price is not in THB, convert to THB using 1 USD = ${exchangeRate} THB.
- Keep ${WEB_SEARCH_MIN_ITEMS}-${WEB_SEARCH_MAX_ITEMS} items.
- Use canonical product URLs and remove tracking parameters when possible.`;

  const runSearch = (maxTokens: number) => runWithOpenAIFallback((client) => client.responses.create({
    model: getPriceSearchModel('openai'),
    input: prompt,
    max_output_tokens: maxTokens,
    temperature: 0,
    tools: [
      {
        type: 'web_search',
        search_context_size: 'medium',
        user_location: {
          type: 'approximate',
          country: 'TH',
          city: 'Bangkok',
          timezone: 'Asia/Bangkok',
        },
      },
    ],
    tool_choice: 'required',
    text: {
      format: {
        type: 'json_schema',
        name: 'web_search_prices',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            query: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  title: { type: 'string' },
                  price_thb: { type: 'number' },
                  source: { type: 'string' },
                  url: { type: 'string' },
                },
                required: ['title', 'price_thb', 'source', 'url'],
              },
            },
          },
          required: ['query', 'items'],
        },
      },
    },
  }));

  let response = await runSearch(WEB_SEARCH_MAX_OUTPUT_TOKENS);
  if (response?.status === 'incomplete' && response?.incomplete_details?.reason === 'max_output_tokens') {
    response = await runSearch(WEB_SEARCH_MAX_OUTPUT_TOKENS * 2);
  }

  const content = getResponseText(response);
  const parsed = parseJsonFromText<WebSearchResult>(content);

  if (!parsed || !Array.isArray(parsed.items)) {
    console.warn('⚠️ Failed to parse web_search prices');
    return null;
  }

  const items = parsed.items
    .filter((item) => item && item.title && Number.isFinite(item.price_thb) && item.price_thb > 0)
    .slice(0, WEB_SEARCH_MAX_ITEMS);

  return {
    query,
    items,
  };
}

// Routes the market-price web search to the provider configured by PRICE_SEARCH_PROVIDER.
async function fetchWebSearchPrices(productName: string): Promise<WebSearchResult | null> {
  const provider = getPriceSearchProvider();
  if (provider === 'anthropic') {
    return fetchWebSearchPricesAnthropic(productName);
  }
  return fetchWebSearchPricesOpenAI(productName);
}

// Anthropic/Claude variant of the web-search price lookup. Uses the Messages API
// with the web_search (and optional web_fetch) server tools, then parses a JSON
// array of Thai used-market listings out of Claude's final text response.
async function fetchWebSearchPricesAnthropic(productName: string): Promise<WebSearchResult | null> {
  if (!hasAnthropicKeys()) {
    console.warn('⚠️ PRICE_SEARCH_PROVIDER=anthropic but ANTHROPIC_API_KEY is not configured; skipping web search.');
    return null;
  }

  const query = buildWebSearchQuery(productName);
  const exchangeRate = getExchangeRate();
  const model = getPriceSearchModel('anthropic');

  const system =
    'You are a pricing analyst for the Thai second-hand (used) electronics market. ' +
    'Use the web_search tool (and web_fetch to read a listing page when helpful) to find real, current resale prices. ' +
    'Respond with valid JSON only.';

  const prompt = `Find ${WEB_SEARCH_MIN_ITEMS}-${WEB_SEARCH_MAX_ITEMS} real second-hand (used) market listings for this exact product in Thailand: "${productName}".
Use the web_search tool, for example with the query: "${query}".

Rules:
- Only include listings that match the exact model and capacity/spec.
- Every price must be in Thai Baht (THB). If a listing is in another currency, convert using 1 USD = ${exchangeRate} THB.
- Prefer real marketplace/retailer listings; use canonical product URLs without tracking parameters.
- Keep between ${WEB_SEARCH_MIN_ITEMS} and ${WEB_SEARCH_MAX_ITEMS} items.

Respond with ONLY a JSON object (no prose, no markdown code fences) in exactly this shape:
{
  "query": "${query}",
  "items": [
    { "title": "string", "price_thb": number, "source": "string", "url": "string" }
  ]
}`;

  // Note: Anthropic's web_search localization rejects country code "TH"
  // (unlike OpenAI), so we steer toward the Thai market via the query/prompt
  // (Thai-language query + "in Thailand" + THB) rather than user_location.
  const tools: any[] = [
    {
      type: ANTHROPIC_WEB_SEARCH_TOOL,
      name: 'web_search',
      max_uses: ANTHROPIC_WEB_SEARCH_MAX_USES,
    },
  ];

  if (isWebFetchEnabledForPriceSearch()) {
    tools.push({
      type: ANTHROPIC_WEB_FETCH_TOOL,
      name: 'web_fetch',
      max_uses: ANTHROPIC_WEB_FETCH_MAX_USES,
      max_content_tokens: ANTHROPIC_WEB_FETCH_MAX_CONTENT_TOKENS,
      citations: { enabled: false },
    });
  }

  const messages: any[] = [{ role: 'user', content: prompt }];

  try {
    let data: any = null;

    // Server tools can pause a long turn (stop_reason: "pause_turn"); feed the
    // partial assistant turn back so Claude can continue until the turn ends.
    for (let attempt = 0; attempt <= ANTHROPIC_MAX_PAUSE_CONTINUATIONS; attempt++) {
      data = await callAnthropicMessages({
        model,
        max_tokens: ANTHROPIC_PRICE_SEARCH_MAX_TOKENS,
        system,
        messages,
        tools,
      });

      if (data?.stop_reason !== 'pause_turn' || !Array.isArray(data?.content)) {
        break;
      }
      messages.push({ role: 'assistant', content: data.content });
    }

    const text = getAnthropicResponseText(data?.content);
    const parsed = parseJsonFromText<WebSearchResult>(text);

    if (!parsed || !Array.isArray(parsed.items)) {
      console.warn('⚠️ Failed to parse Anthropic web_search prices');
      return null;
    }

    const items: WebSearchItem[] = parsed.items
      .map((item: any) => {
        const priceRaw = item?.price_thb;
        const price = typeof priceRaw === 'number'
          ? priceRaw
          : Number(String(priceRaw ?? '').replace(/[^\d.]/g, ''));
        return {
          title: typeof item?.title === 'string' ? item.title : '',
          price_thb: price,
          source: typeof item?.source === 'string' ? item.source : '',
          url: typeof item?.url === 'string' ? item.url : '',
        };
      })
      .filter((item) => item.title && Number.isFinite(item.price_thb) && item.price_thb > 0)
      .slice(0, WEB_SEARCH_MAX_ITEMS);

    return { query, items };
  } catch (error) {
    console.warn('⚠️ Anthropic web search failed:', error);
    return null;
  }
}

async function fetchSerpapiShoppingResults(
  input: EstimateRequest,
  productName: string
): Promise<SerpapiShoppingResults | null> {
  if (!isSerpapiEnabled()) {
    return null;
  }

  if (!hasOpenAIKeys()) {
    console.warn('⚠️ OPENAI_API_KEY not configured, skipping SerpAPI filtering');
    return null;
  }

  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ SERPAPI_API_KEY not configured, skipping SerpAPI');
    return null;
  }

  const query = buildSerpapiQuery(productName);
  const params = new URLSearchParams({
    engine: 'google_shopping_light',
    q: query,
    api_key: apiKey,
  });

  try {
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    if (!response.ok) {
      console.warn('⚠️ SerpAPI request failed:', response.status, response.statusText);
      return null;
    }

    const json = await response.json();
    const shoppingResults = Array.isArray(json.shopping_results) ? json.shopping_results : [];
    const exchangeRate = getExchangeRate();
    const fetchedAt = new Date().toISOString();

    type SerpapiCandidateItem = SerpapiShoppingItem & {
      id: string;
      condition?: string | null;
      snippet?: string | null;
    };

    const candidateItems = shoppingResults
      .map((result: any, index: number) => {
        if (!result?.title) return null;
        const usd = extractUsdPrice(result);
        if (usd === null) return null;
        const rawSnippet = result.snippet ?? result.description ?? null;
        const snippet = typeof rawSnippet === 'string' ? rawSnippet.slice(0, 200) : null;
        return {
          id: `item_${index + 1}`,
          title: result.title ?? null,
          source: result.source ?? result.store ?? result.seller ?? 'Unknown',
          url: result.link ?? result.product_link ?? null,
          price_usd: usd,
          price_thb: usdToThb(usd, exchangeRate),
          condition: result.condition ?? result.product_condition ?? null,
          snippet,
        };
      })
      .filter(Boolean)
      .slice(0, SERPAPI_MAX_ITEMS) as SerpapiCandidateItem[];

    if (candidateItems.length === 0) {
      return {
        query,
        exchange_rate_thb_per_usd: exchangeRate,
        fetched_at: fetchedAt,
        items: [],
      };
    }

    const llmInput = {
      query,
      exchange_rate_thb_per_usd: exchangeRate,
      fetched_at: fetchedAt,
      items: candidateItems,
    };

    const prompt = `You are a pricing analyst. Filter SerpAPI Google Shopping results to keep only listings that truly match the exact product.
Product spec:
- productName: ${productName}
- brand: ${input.brand}
- model: ${input.model}
- capacity: ${input.capacity || '(none)'}
- storage: ${input.storage || '(none)'}
Rules:
- Keep only items that match the exact model and storage/capacity. Exclude other generations, other storage sizes, other product lines (Pro), accessories, bundles, parts, or services.
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

    const parsed = await anthropicStructured<{ keep_item_ids: string[] }>({
      userText: prompt,
      toolName: 'serpapi_cleaned_prices',
      toolDescription: 'Return the IDs of the SerpAPI items to keep.',
      maxTokens: 1024,
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

    if (!parsed || !Array.isArray(parsed.keep_item_ids)) {
      console.warn('⚠️ Failed to parse SerpAPI LLM filter response');
      return {
        query,
        exchange_rate_thb_per_usd: exchangeRate,
        fetched_at: fetchedAt,
        items: [],
      };
    }

    const keepIds = new Set(parsed.keep_item_ids);
    const items = candidateItems
      .filter((item) => keepIds.has(item.id))
      .map(({ id, condition, snippet, ...rest }) => rest);
    console.log(`🛒 SerpAPI: ${candidateItems.length} candidates → ${items.length} kept after exact-model filter`);

    return {
      query,
      exchange_rate_thb_per_usd: exchangeRate,
      fetched_at: fetchedAt,
      items,
    };
  } catch (error) {
    console.warn('⚠️ SerpAPI error:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Notebook listing harvest — one multi-angle web-search call that returns
// used listings (exact model → family siblings → similar spec) PLUS current
// new-price / launch-price anchors, each labeled with its own config.
// Provider follows PRICE_SEARCH_PROVIDER like the generic price search.
// ---------------------------------------------------------------------------

const NOTEBOOK_LISTING_KINDS = ['used', 'new_current', 'launch_msrp'];
const NOTEBOOK_MATCH_TIERS = ['exact', 'family', 'same_brand', 'cross_brand'];
const NOTEBOOK_USED_KEYWORD_PATTERN = /มือสอง|มือ2|used|second\s?hand|refurbish/i;

function formatNotebookStorage(spec: NotebookSpec): string | null {
  if (!spec.storageGb) return null;
  const size = spec.storageGb >= 1024 ? `${Math.round(spec.storageGb / 1024)}TB` : `${spec.storageGb}GB`;
  return `${size}${spec.storageType ? ` ${spec.storageType.toUpperCase()}` : ''}`;
}

function buildNotebookHarvestPrompt(spec: NotebookSpec, exchangeRate: number): string {
  const configBits = [
    spec.cpuModel ? `CPU ${spec.cpuModel}` : null,
    spec.ramGb ? `RAM ${spec.ramGb}GB` : null,
    formatNotebookStorage(spec) ? `Storage ${formatNotebookStorage(spec)}` : null,
    spec.gpuClass !== 'integrated' && spec.gpuModel ? `GPU ${spec.gpuModel}` : null,
  ].filter(Boolean).join(', ');

  return `You are a pricing analyst for the Thai second-hand laptop market.
Target laptop:
- Product: ${spec.productName}
- Brand: ${spec.brand} | Family: ${spec.family}${spec.variant ? ` | Variant: ${spec.variant}` : ''}
- Config: ${configBits || '(unknown config)'}

Do ALL of the following (multiple web searches allowed):
1) Find current Thai USED-market listings for this exact model and config (e.g. query "${spec.brand} ${spec.family} มือสอง ราคา"). Prefer Kaidee, Facebook Marketplace, second-hand shops, Thai forums.
2) If you find fewer than ${NOTEBOOK_SEARCH_MIN_ITEMS} exact listings, ALSO include used listings of OTHER CONFIGS or sibling models in the same family "${spec.family}" (mark them match="family"); if still scarce, add similar-spec laptops of the same brand (match="same_brand") or other brands (match="cross_brand").
3) ALWAYS also try to find 1-3 price anchors: the CURRENT NEW price of this model in Thailand (JIB, Banana IT, Advice, official Shopee/Lazada stores) as listing_kind="new_current", and/or the original launch price from reviews/news as listing_kind="launch_msrp".

Labeling rules for every item:
- listing_kind: "used" | "new_current" | "launch_msrp"
- match: "exact" (same model AND same CPU/RAM/storage) | "family" | "same_brand" | "cross_brand"
- Extract the config visible in each listing: cpu, ram_gb, storage_gb (1TB = 1024), storage_type ("nvme"|"sata"|"hdd"), gpu. Use null when not stated.
- All prices in THB; convert foreign prices at 1 USD = ${exchangeRate} THB.
- Exclude accessories, parts, broken/for-repair machines, and rental offers.
- Return between ${NOTEBOOK_SEARCH_MIN_ITEMS} and ${NOTEBOOK_SEARCH_MAX_ITEMS} items in total.`;
}

// Salvage complete objects out of a truncated `{"items": [ {...}, {...}, {"tit` —
// a max_tokens cutoff must cost us the tail item, not the whole harvest.
function salvageJsonArrayItems(text: string): any[] {
  const arrayStart = text.indexOf('[');
  if (arrayStart < 0) return [];
  const items: any[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;
  for (let i = arrayStart; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) objStart = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && objStart >= 0) {
        try {
          items.push(JSON.parse(text.slice(objStart, i + 1)));
        } catch {
          // skip malformed object
        }
        objStart = -1;
      }
    } else if (ch === ']' && depth === 0) {
      break;
    }
  }
  return items;
}

function sanitizeHarvestedNotebookListings(items: any[], origin: 'web_search' | 'serpapi'): NotebookListingInput[] {
  const toPositiveNumber = (value: any): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

  return (Array.isArray(items) ? items : [])
    .map((item: any): NotebookListingInput | null => {
      const priceRaw = item?.price_thb;
      const price = typeof priceRaw === 'number'
        ? priceRaw
        : Number(String(priceRaw ?? '').replace(/[^\d.]/g, ''));
      if (!item?.title || !Number.isFinite(price) || price <= 0) return null;
      return {
        title: String(item.title),
        price_thb: price,
        source: typeof item?.source === 'string' ? item.source : null,
        url: typeof item?.url === 'string' ? item.url : null,
        listing_kind: NOTEBOOK_LISTING_KINDS.includes(item?.listing_kind) ? item.listing_kind : 'used',
        match: NOTEBOOK_MATCH_TIERS.includes(item?.match) ? item.match : null,
        cpu: typeof item?.cpu === 'string' && item.cpu ? item.cpu : null,
        ram_gb: toPositiveNumber(item?.ram_gb),
        storage_gb: toPositiveNumber(item?.storage_gb),
        storage_type: ['nvme', 'sata', 'hdd'].includes(item?.storage_type) ? item.storage_type : null,
        gpu: typeof item?.gpu === 'string' && item.gpu ? item.gpu : null,
        condition_note: typeof item?.condition_note === 'string' ? item.condition_note : null,
        origin,
      };
    })
    .filter((item): item is NotebookListingInput => Boolean(item))
    .slice(0, NOTEBOOK_SEARCH_MAX_ITEMS);
}

const NOTEBOOK_LISTING_ITEM_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    price_thb: { type: 'number' },
    source: { type: 'string' },
    url: { type: 'string' },
    listing_kind: { type: 'string', enum: ['used', 'new_current', 'launch_msrp'] },
    match: { type: 'string', enum: ['exact', 'family', 'same_brand', 'cross_brand'] },
    cpu: { type: ['string', 'null'] },
    ram_gb: { type: ['number', 'null'] },
    storage_gb: { type: ['number', 'null'] },
    // No enum here: strict mode + nullable enums is shaky, and
    // sanitizeHarvestedNotebookListings whitelists the values locally anyway.
    storage_type: { type: ['string', 'null'], description: 'One of: nvme, sata, hdd — or null' },
    gpu: { type: ['string', 'null'] },
    condition_note: { type: ['string', 'null'] },
  },
  required: [
    'title', 'price_thb', 'source', 'url', 'listing_kind', 'match',
    'cpu', 'ram_gb', 'storage_gb', 'storage_type', 'gpu', 'condition_note',
  ],
};

async function fetchNotebookListingsOpenAI(spec: NotebookSpec): Promise<NotebookListingInput[]> {
  if (!hasOpenAIKeys()) {
    return [];
  }

  const prompt = buildNotebookHarvestPrompt(spec, getExchangeRate());

  const runSearch = (maxTokens: number) => runWithOpenAIFallback((client) => client.responses.create({
    model: getPriceSearchModel('openai'),
    input: prompt,
    max_output_tokens: maxTokens,
    temperature: 0,
    tools: [
      {
        type: 'web_search',
        search_context_size: 'medium',
        user_location: {
          type: 'approximate',
          country: 'TH',
          city: 'Bangkok',
          timezone: 'Asia/Bangkok',
        },
      },
    ],
    tool_choice: 'required',
    text: {
      format: {
        type: 'json_schema',
        name: 'notebook_market_listings',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: { type: 'array', items: NOTEBOOK_LISTING_ITEM_JSON_SCHEMA },
          },
          required: ['items'],
        },
      },
    },
  }));

  try {
    let response = await runSearch(NOTEBOOK_SEARCH_MAX_OUTPUT_TOKENS);
    if (response?.status === 'incomplete' && response?.incomplete_details?.reason === 'max_output_tokens') {
      response = await runSearch(NOTEBOOK_SEARCH_MAX_OUTPUT_TOKENS * 2);
    }
    const parsed = parseJsonFromText<{ items: any[] }>(getResponseText(response));
    return sanitizeHarvestedNotebookListings(parsed?.items ?? [], 'web_search');
  } catch (error) {
    console.warn('⚠️ Notebook listing harvest (OpenAI) failed:', error);
    return [];
  }
}

async function fetchNotebookListingsAnthropic(spec: NotebookSpec): Promise<NotebookListingInput[]> {
  if (!hasAnthropicKeys()) {
    return [];
  }

  const prompt = `${buildNotebookHarvestPrompt(spec, getExchangeRate())}

Respond with ONLY a JSON object (no prose, no markdown fences) in exactly this shape:
{
  "items": [
    { "title": "string", "price_thb": number, "source": "string", "url": "string",
      "listing_kind": "used|new_current|launch_msrp", "match": "exact|family|same_brand|cross_brand",
      "cpu": "string or null", "ram_gb": number_or_null, "storage_gb": number_or_null,
      "storage_type": "nvme|sata|hdd or null", "gpu": "string or null", "condition_note": "string or null" }
  ]
}`;

  const tools: any[] = [
    {
      type: ANTHROPIC_WEB_SEARCH_TOOL,
      name: 'web_search',
      max_uses: ANTHROPIC_WEB_SEARCH_MAX_USES,
    },
  ];
  if (isWebFetchEnabledForPriceSearch()) {
    tools.push({
      type: ANTHROPIC_WEB_FETCH_TOOL,
      name: 'web_fetch',
      max_uses: ANTHROPIC_WEB_FETCH_MAX_USES,
      max_content_tokens: ANTHROPIC_WEB_FETCH_MAX_CONTENT_TOKENS,
      citations: { enabled: false },
    });
  }

  const messages: any[] = [{ role: 'user', content: prompt }];

  try {
    let data: any = null;
    for (let attempt = 0; attempt <= ANTHROPIC_MAX_PAUSE_CONTINUATIONS; attempt++) {
      data = await callAnthropicMessages({
        model: getPriceSearchModel('anthropic'),
        max_tokens: NOTEBOOK_ANTHROPIC_MAX_TOKENS,
        system:
          'You are a pricing analyst for the Thai second-hand laptop market. ' +
          'Use web_search (and web_fetch when helpful) to find real current prices. Respond with valid JSON only.',
        messages,
        tools,
      });
      if (data?.stop_reason !== 'pause_turn' || !Array.isArray(data?.content)) {
        break;
      }
      messages.push({ role: 'assistant', content: data.content });
    }

    const text = getAnthropicResponseText(data?.content);
    let items = parseJsonFromText<{ items: any[] }>(text)?.items;
    if (!Array.isArray(items)) {
      items = salvageJsonArrayItems(text);
      if (items.length > 0) {
        console.warn(
          `⚠️ Notebook harvest (Anthropic): JSON truncated/malformed (stop=${data?.stop_reason}), salvaged ${items.length} items`
        );
      } else {
        console.warn(
          `⚠️ Notebook harvest (Anthropic): unparseable response (stop=${data?.stop_reason}, textLen=${text.length}): ${text.slice(0, 300)}`
        );
      }
    }
    const listings = sanitizeHarvestedNotebookListings(items ?? [], 'web_search');
    console.log(`💻 Harvest (Anthropic): ${listings.length} listings (stop=${data?.stop_reason})`);
    return listings;
  } catch (error) {
    console.warn('⚠️ Notebook listing harvest (Anthropic) failed:', error);
    return [];
  }
}

async function fetchNotebookListings(spec: NotebookSpec): Promise<NotebookListingInput[]> {
  const provider = getPriceSearchProvider();
  if (provider === 'anthropic') {
    return fetchNotebookListingsAnthropic(spec);
  }
  return fetchNotebookListingsOpenAI(spec);
}

// SerpAPI (Google Shopping) results are overwhelmingly NEW prices for laptops,
// so for the notebook ladder they become new-price anchors (Level 5) rather
// than used comps — unless the title explicitly says second-hand.
function mapSerpapiItemsToNotebookListings(results: SerpapiShoppingResults | null): NotebookListingInput[] {
  return (results?.items || [])
    .map((item): NotebookListingInput | null => {
      if (!item?.title || !Number.isFinite(item.price_thb) || item.price_thb <= 0) return null;
      return {
        title: item.title,
        price_thb: item.price_thb,
        source: item.source ?? 'google_shopping',
        url: item.url ?? null,
        listing_kind: NOTEBOOK_USED_KEYWORD_PATTERN.test(item.title) ? 'used' : 'new_current',
        match: 'exact', // the SerpAPI LLM filter already keeps only the exact model
        cpu: null,
        ram_gb: null,
        storage_gb: null,
        storage_type: null,
        gpu: null,
        condition_note: null,
        origin: 'serpapi',
      };
    })
    .filter((item): item is NotebookListingInput => Boolean(item));
}

function buildNotebookObservationRows(
  spec: NotebookSpec,
  productName: string,
  lineId: string | undefined,
  listings: NotebookListingInput[],
  pricing: NotebookPricingResult,
  marketPrice: number
): PriceObservationRow[] {
  const base = {
    item_type: NOTEBOOK_ITEM_TYPE,
    brand: spec.brand || null,
    family: spec.family || null,
    family_norm: normalizeFamilyKey(spec.family),
    product_name: productName || null,
  };

  const rows: PriceObservationRow[] = listings
    .filter((l) => l.origin !== 'observation') // never re-save rows we just read back
    .map((l) => ({
      ...base,
      listing_title: l.title,
      listing_url: l.url ?? null,
      source: l.source ?? null,
      origin: l.origin === 'serpapi' ? 'serpapi' as const : 'web_search' as const,
      listing_kind: l.listing_kind,
      match_level: l.match ?? null,
      price_thb: l.price_thb,
      cpu: l.cpu ?? null,
      ram_gb: l.ram_gb ?? null,
      storage_gb: l.storage_gb ?? null,
      storage_type: l.storage_type ?? null,
      gpu: l.gpu ?? null,
    }));

  rows.push({
    ...base,
    origin: 'estimate_result',
    listing_kind: 'estimate',
    price_thb: marketPrice,
    cpu: spec.cpuModel ?? null,
    cpu_score: spec.cpuScore ?? null,
    ram_gb: spec.ramGb ?? null,
    storage_gb: spec.storageGb ?? null,
    storage_type: spec.storageType ?? null,
    gpu: spec.gpuModel ?? null,
    gpu_score: spec.gpuScore ?? null,
    release_year: spec.releaseYear ?? null,
    segment: spec.segment,
    estimate_level: pricing.level,
    confidence: pricing.confidence,
    line_id: lineId ?? null,
    spec: spec as unknown as Record<string, unknown>,
  });

  return rows;
}

// Agent 1: Normalize input data only
async function normalizeInput(input: EstimateRequest): Promise<NormalizedData> {
  if (!hasAnthropicKeys()) {
    return {
      productName: `${input.brand} ${input.model}`.trim(),
    };
  }

  const conditionPercent = input.condition <= 1 ? Math.round(input.condition * 100) : Math.round(input.condition);
  const extraLines = [
    input.capacity ? `- ความจุ: ${input.capacity}` : null,
    input.screenSize ? `- ขนาดจอ: ${input.screenSize}` : null,
    input.watchSize ? `- ขนาดนาฬิกา: ${input.watchSize}` : null,
    input.watchConnectivity ? `- การเชื่อมต่อ: ${input.watchConnectivity}` : null,
    input.appleCategory ? `- หมวด Apple: ${input.appleCategory}` : null,
    input.appleSpecs ? `- สเปค Apple: ${input.appleSpecs}` : null,
    input.cpu ? `- CPU: ${input.cpu}` : null,
    input.ram ? `- RAM: ${input.ram}` : null,
    input.storage ? `- Storage: ${input.storage}` : null,
    input.gpu ? `- GPU: ${input.gpu}` : null,
    input.lenses && input.lenses.length > 0 ? `- เลนส์: ${input.lenses.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const prompt = `คุณเป็นผู้เชี่ยวชาญประเมินราคาสินค้ามือสองในประเทศไทย ทำ 1 งาน:
1) Normalize ชื่อสินค้าให้ชัดเจนและใช้ค้นหาแล้วเจอสินค้าจริง

ข้อกำหนด:
- ชื่อสินค้า (productName) ต้องรวม Brand + Model + รายละเอียดสำคัญที่ช่วยค้นหา (เช่น ความจุ/สเปค/ปี)
- ห้ามใส่ "สี" ในชื่อสินค้า และไม่ต้องใช้สีในการประเมินราคา
- ห้ามใส่ Serial Number ในชื่อสินค้า

ข้อมูลสินค้า:
- ประเภท: ${input.itemType}
- ยี่ห้อ: ${input.brand}
- รุ่น: ${input.model}
- Serial: ${input.serialNo || '-'}
- อุปกรณ์เสริม: ${input.accessories || '-'}
- สภาพ (รวมผู้ใช้+AI): ${conditionPercent}%
- ตำหนิ: ${input.defects || '-'}
- หมายเหตุ: ${input.note || '-'}
${extraLines ? `\nข้อมูลเพิ่มเติม:\n${extraLines}` : ''}

ตอบกลับเป็น JSON เท่านั้น:
{
  "productName": "ชื่อสินค้า"
}`;

  const parsed = await anthropicStructured<NormalizedData>({
    userText: prompt,
    toolName: 'normalized_item',
    toolDescription: 'Return the normalized product name.',
    maxTokens: 512,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        productName: { type: 'string' },
      },
      required: ['productName'],
    },
  });

  const fallbackName = `${input.brand} ${input.model}`.trim();

  let productName = parsed?.productName?.trim() || fallbackName;
  if (input.color) {
    const colorToken = input.color.trim();
    if (colorToken) {
      productName = productName
        .replace(new RegExp(escapeRegExp(colorToken), 'ig'), '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  return {
    productName,
  };
}

const toCombinedItemFromWeb = (item: WebSearchItem): CombinedItem | null => {
  if (!item?.title || !Number.isFinite(item.price_thb)) return null;
  return {
    title: item.title,
    price_thb: item.price_thb,
    source: item.source ?? 'Unknown',
    url: item.url,
    origin: 'web_search',
  };
};

const toCombinedItemFromSerpapi = (item: SerpapiShoppingItem): CombinedItem | null => {
  if (!item?.title || !Number.isFinite(item.price_thb)) return null;
  return {
    title: item.title ?? 'Unknown',
    price_thb: item.price_thb,
    source: item.source ?? 'Unknown',
    url: item.url ?? undefined,
    origin: 'serpapi',
    price_usd: item.price_usd,
  };
};

type RepresentativeMarketResult = {
  marketPrice: number;
  analysis: ReturnType<typeof computeRepresentativeUsedPriceTHB> | null;
  sourceCounts: { web: number; serpapi: number };
  usedWeights: boolean;
};

// Agent 2: Web search + SerpAPI -> merge -> representative price
async function getRepresentativeMarketPrice(
  input: EstimateRequest,
  productName: string
): Promise<RepresentativeMarketResult> {
  const fallbackPrice = MIN_ESTIMATE_PRICE;

  if (!hasAnthropicKeys()) {
    return {
      marketPrice: fallbackPrice,
      analysis: null,
      sourceCounts: { web: 0, serpapi: 0 },
      usedWeights: USE_TH_WEIGHTS,
    };
  }

  const [webResults, serpapiResults] = await Promise.all([
    fetchWebSearchPrices(productName),
    fetchSerpapiShoppingResults(input, productName),
  ]);

  const webItems = (webResults?.items || [])
    .map(toCombinedItemFromWeb)
    .filter(Boolean) as CombinedItem[];
  const serpItems = (serpapiResults?.items || [])
    .map(toCombinedItemFromSerpapi)
    .filter(Boolean) as CombinedItem[];

  const combinedItems = [...webItems, ...serpItems];
  // USE_TH_WEIGHTS is hardcoded false; the Thai-market weighting path is currently disabled.
  const weights = undefined;

  if (combinedItems.length === 0) {
    return {
      marketPrice: fallbackPrice,
      analysis: null,
      sourceCounts: { web: webItems.length, serpapi: serpItems.length },
      usedWeights: USE_TH_WEIGHTS,
    };
  }

  try {
    const analysis = computeRepresentativeUsedPriceTHB(combinedItems, { weights });
    const marketPrice = Math.max(analysis.representativePrice, MIN_ESTIMATE_PRICE);
    return {
      marketPrice,
      analysis,
      sourceCounts: { web: webItems.length, serpapi: serpItems.length },
      usedWeights: USE_TH_WEIGHTS,
    };
  } catch (error) {
    console.warn('⚠️ Representative price calculation failed:', error);
    return {
      marketPrice: fallbackPrice,
      analysis: null,
      sourceCounts: { web: webItems.length, serpapi: serpItems.length },
      usedWeights: USE_TH_WEIGHTS,
    };
  }
}

export type EstimatePipelineResult =
  | { ok: true; payload: EstimateResponse }
  | { ok: false; status: number; error: string; code?: string };

export async function runEstimatePipeline(body: EstimateRequest): Promise<EstimatePipelineResult> {
  try {
    if (!body || !body.itemType || !body.brand || !body.model || !body.lineId) {
      return { ok: false, status: 400, error: 'Missing required fields' };
    }

    if (!Array.isArray(body.images) || body.images.length === 0) {
      return { ok: false, status: 400, error: 'Missing required image data' };
    }

    const imageHashes = await resolveImageHashesForCache(body);
    const globalCacheKey = buildEstimateCacheKey(body, imageHashes);
    const redis = getRedisClient();

    if (redis) {
      try {
        const cached = await redis.get<EstimateResponse>(globalCacheKey);
        if (isCachedEstimateResponse(cached)) {
          console.log('⚡ Global estimate cache hit:', globalCacheKey);
          return { ok: true, payload: cached };
        }
      } catch (error) {
        console.warn('⚠️ Failed to read estimate cache:', error);
      }
    }

    if (!hasAnthropicKeys()) {
      return { ok: false, status: 500, error: 'Anthropic API key not configured' };
    }

    console.log('🔄 Agent 1: Normalizing input...');
    const normalizedData = await normalizeInput(body);
    console.log('✅ Normalized product name:', normalizedData.productName);

    let marketPrice: number;
    let marketCalculationText: string;
    let responseConfidence = 0.85;
    let persistNotebookObservationRows: PriceObservationRow[] | null = null;

    if (isNotebookEstimate(body)) {
      // Notebook ladder pipeline (NOTEBOOK_PRICING.md): structured spec →
      // multi-angle listing harvest → per-comp adjustment → L1..L5.
      console.log('💻 Notebook pipeline: extracting spec...');
      const spec = await extractNotebookSpec(
        {
          brand: body.brand,
          model: body.model,
          cpu: body.cpu,
          ram: body.ram,
          storage: body.storage,
          capacity: body.capacity,
          gpu: body.gpu,
          screenSize: body.screenSize,
          note: body.note,
          defects: body.defects,
          images: body.images,
        },
        normalizedData.productName
      );
      console.log('💻 Spec:', {
        family: spec.family,
        cpu: spec.cpuModel,
        cpuScore: spec.cpuScore,
        ramGb: spec.ramGb,
        storageGb: spec.storageGb,
        gpuClass: spec.gpuClass,
        releaseYear: spec.releaseYear,
        segment: spec.segment,
      });

      // SerpAPI must search/filter with the CANONICAL spec (incl. anything the
      // vision extraction read off the photos) — the generic normalized name
      // can be junk like "Dell Notebook" when the pawner typed "ไม่รู้".
      const serpapiInput: EstimateRequest = {
        ...body,
        brand: spec.brand,
        model: [spec.family, spec.variant].filter(Boolean).join(' ') || body.model,
        cpu: spec.cpuModel || body.cpu,
        ram: spec.ramGb ? `${spec.ramGb}GB` : body.ram,
        storage: formatNotebookStorage(spec) || body.storage,
      };

      const [webListings, serpapiResults, observations] = await Promise.all([
        fetchNotebookListings(spec),
        fetchSerpapiShoppingResults(serpapiInput, spec.productName),
        fetchRecentNotebookObservations(spec.brand, spec.family),
      ]);
      const serpListings = mapSerpapiItemsToNotebookListings(serpapiResults);
      const allListings = [...observations, ...webListings, ...serpListings];
      console.log(
        `💻 Listings: web=${webListings.length} serpapi=${serpListings.length} observations=${observations.length}`
      );

      const pricing = computeNotebookPrice(spec, allListings);
      if (!pricing) {
        console.warn('💻 Notebook pricing: no usable comps or anchors — returning 422');
        return {
          ok: false,
          status: 422,
          error: 'ไม่พบข้อมูลราคาตลาดของรุ่นนี้เพียงพอสำหรับการประเมิน กรุณาตรวจสอบชื่อรุ่นและสเปคอีกครั้ง หรือติดต่อเจ้าหน้าที่เพื่อประเมินราคา',
          code: 'insufficient_market_data',
        };
      }

      console.log(
        `💻 Notebook price: ${pricing.marketPrice} [${pricing.level}] comps=${pricing.usedCompCount} anchors=${pricing.anchorCount} dropped=${pricing.droppedComps} confidence=${pricing.confidence}`
      );

      marketPrice = Math.max(pricing.marketPrice, MIN_ESTIMATE_PRICE);
      responseConfidence = pricing.confidence;
      marketCalculationText = `ราคากลางโน้ตบุ๊ก [${pricing.level}] — ${pricing.notes.join(' · ')}`;
      persistNotebookObservationRows = buildNotebookObservationRows(
        spec,
        normalizedData.productName,
        body.lineId,
        allListings,
        pricing,
        marketPrice
      );
    } else {
      console.log('🔄 Agent 2: Fetching web search + SerpAPI prices...');
      const representative = await getRepresentativeMarketPrice(body, normalizedData.productName);
      console.log('🔍 Web search items:', representative.sourceCounts.web);
      console.log('🔍 SerpAPI items (filtered):', representative.sourceCounts.serpapi);
      if (representative.analysis) {
        console.log(
          `✅ Representative price: ${representative.analysis.representativePrice} (${representative.analysis.mode}, D=${representative.analysis.dispersionScore.toFixed(2)})`
        );
      } else {
        console.log('⚠️ Representative price unavailable, using range midpoint');
      }
      marketPrice = representative.marketPrice;
      marketCalculationText = representative.analysis
        ? `ราคาตัวแทน (low-but-fair) จาก web_search ${representative.sourceCounts.web} รายการ${representative.sourceCounts.serpapi > 0 ? ` + SerpAPI ${representative.sourceCounts.serpapi} รายการ` : ''}${representative.usedWeights ? ' | ให้น้ำหนักตลาดไทย' : ''}`
        : 'ราคาตัวแทนจากข้อมูลตลาดไม่เพียงพอ';
    }
    console.log('✅ Market price (low-but-fair):', marketPrice);

    const pawnPrice = Math.round(marketPrice * PAWN_PRICE_FACTOR);
    console.log('🏦 Pawn price (60% of market):', pawnPrice);

    const pawnerCondition = normalizeConditionInput(body.pawnerCondition);
    const aiCondition = normalizeConditionInput(body.aiCondition);
    const fallbackCondition = normalizeConditionInput(body.condition);
    const normalizedCondition = blendConditionScores(pawnerCondition, aiCondition, fallbackCondition);
    console.log('✅ Using blended condition score:', {
      pawner: pawnerCondition,
      ai: aiCondition,
      final: normalizedCondition,
    });

    const estimatedPrice = Math.round(pawnPrice * normalizedCondition);
    console.log('💰 Final estimated price:', estimatedPrice);

    const clampPrice = Math.max(estimatedPrice, MIN_ESTIMATE_PRICE);
    const remainder = clampPrice % PRICE_SNAP_UNIT;
    const finalPrice = clampPrice - remainder + (remainder >= PRICE_SNAP_THRESHOLD ? PRICE_SNAP_THRESHOLD : 0);

    const estimateResponsePayload: EstimateResponse = {
      success: true,
      estimatedPrice: finalPrice,
      condition: normalizedCondition,
      marketPrice: marketPrice,
      pawnPrice: pawnPrice,
      confidence: responseConfidence,
      normalizedInput: normalizedData,
      calculation: {
        marketPrice: marketCalculationText,
        pawnPrice: `วงเงินสินเชื่อ = ${marketPrice.toLocaleString()} × ${PAWN_PRICE_FACTOR} = ${pawnPrice.toLocaleString()} บาท`,
        finalPrice: `ราคาประเมิน = ${pawnPrice.toLocaleString()} × สภาพ ${(normalizedCondition * 100).toFixed(0)}% = ${finalPrice.toLocaleString()} บาท`,
      },
    };

    if (redis) {
      try {
        await redis.set(globalCacheKey, estimateResponsePayload, { ex: ESTIMATE_CACHE_TTL_SECONDS });
      } catch (error) {
        console.warn('⚠️ Failed to write estimate cache:', error);
      }
    }

    // Grow the comps DB (notebook flywheel). Awaited (it's a fast insert and
    // background-job runners freeze right after we return) but never fails
    // the estimate.
    if (persistNotebookObservationRows) {
      await saveNotebookObservations(persistNotebookObservationRows).catch((error) =>
        console.warn('⚠️ Failed to persist notebook observations:', error)
      );
    }

    return { ok: true, payload: estimateResponsePayload };

  } catch (error: any) {
    console.error('Error in AI estimation:', error);
    return { ok: false, status: 500, error: 'Failed to estimate price' };
  }
}
