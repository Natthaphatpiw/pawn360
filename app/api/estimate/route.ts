import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { computeRepresentativeUsedPriceTHB } from '@/lib/services/price-representative';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const MODEL = 'gpt-4.1-mini';
const PRICE_SEARCH_MODEL = 'gpt-4.1';
const DEFAULT_EXCHANGE_RATE_THB_PER_USD = 32;
const MIN_ESTIMATE_PRICE = 100;
const WEB_SEARCH_MIN_ITEMS = 4;
const WEB_SEARCH_MAX_ITEMS = 8;
const WEB_SEARCH_MAX_OUTPUT_TOKENS = 1200;
const SERPAPI_MAX_ITEMS = 40;
const SERPAPI_FILTER_MAX_OUTPUT_TOKENS = 600;
const USE_TH_WEIGHTS = false;
const TH_WEIGHT = 2;
const NON_TH_WEIGHT = 1;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface EstimateRequest {
  itemType: string;
  brand: string;
  model: string;
  capacity?: string;
  serialNo?: string;
  accessories?: string;
  condition: number;
  defects?: string;
  note?: string;
  images: string[];
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

interface EstimateResponse {
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

interface NormalizedData {
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

function parseJsonFromText<T>(text: string): T | null {
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

function isSerpapiEnabled(): boolean {
  const value = (process.env.SERPAPI_ENABLED || '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes' || value === 'on';
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

async function fetchWebSearchPrices(productName: string): Promise<WebSearchResult | null> {
  if (!openai) {
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

  const runSearch = (maxTokens: number) => openai.responses.create({
    model: PRICE_SEARCH_MODEL,
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
  });

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

async function fetchSerpapiShoppingResults(
  input: EstimateRequest,
  productName: string
): Promise<SerpapiShoppingResults | null> {
  if (!isSerpapiEnabled()) {
    return null;
  }

  if (!openai) {
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

    const llmResponse = await openai.responses.create({
      model: PRICE_SEARCH_MODEL,
      input: prompt,
      max_output_tokens: SERPAPI_FILTER_MAX_OUTPUT_TOKENS,
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
                items: { type: 'string' },
              },
            },
            required: ['query', 'exchange_rate_thb_per_usd', 'fetched_at', 'keep_item_ids'],
          },
        },
      },
    });

    const content = getResponseText(llmResponse);
    const parsed = parseJsonFromText<{ keep_item_ids: string[] }>(content);

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

// Agent 1: Normalize input data only
async function normalizeInput(input: EstimateRequest): Promise<NormalizedData> {
  if (!openai) {
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
- สภาพ (AI): ${conditionPercent}%
- ตำหนิ: ${input.defects || '-'}
- หมายเหตุ: ${input.note || '-'}
${extraLines ? `\nข้อมูลเพิ่มเติม:\n${extraLines}` : ''}

ตอบกลับเป็น JSON เท่านั้น:
{
  "productName": "ชื่อสินค้า"
}`;

  const response = await openai.responses.create({
    model: MODEL,
    input: prompt,
    max_output_tokens: 300,
    temperature: 0,
    text: {
      format: {
        type: 'json_schema',
        name: 'normalized_item',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            productName: { type: 'string' },
          },
          required: ['productName'],
        },
      },
    },
  });

  const content = getResponseText(response);
  const parsed = parseJsonFromText<NormalizedData>(content);
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

const buildWeights = (items: CombinedItem[]): number[] => (
  items.map((item) => (item.origin === 'web_search' ? TH_WEIGHT : NON_TH_WEIGHT))
);

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

  if (!openai) {
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
  const weights = USE_TH_WEIGHTS ? buildWeights(combinedItems) : undefined;

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

export async function POST(request: NextRequest): Promise<NextResponse<EstimateResponse | { error: string }>> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const body: EstimateRequest = await request.json();

    if (!body.itemType || !body.brand || !body.model || !body.lineId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('🔄 Agent 1: Normalizing input...');
    const normalizedData = await normalizeInput(body);
    console.log('✅ Normalized product name:', normalizedData.productName);

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
    const marketPrice = representative.marketPrice;
    console.log('✅ Market price (low-but-fair):', marketPrice);

    const pawnPrice = Math.round(marketPrice * 0.6);
    console.log('🏦 Pawn price (60% of market):', pawnPrice);

    const rawCondition = body.condition;
    const conditionScore = rawCondition > 1 ? rawCondition / 100 : rawCondition;
    const normalizedCondition = Math.min(1, Math.max(0, conditionScore));
    console.log('✅ Using condition score from AI analysis:', normalizedCondition);

    const estimatedPrice = Math.round(pawnPrice * normalizedCondition);
    console.log('💰 Final estimated price:', estimatedPrice);

    const finalPrice = Math.max(estimatedPrice, MIN_ESTIMATE_PRICE);

    return NextResponse.json({
      success: true,
      estimatedPrice: finalPrice,
      condition: normalizedCondition,
      marketPrice: marketPrice,
      pawnPrice: pawnPrice,
      confidence: 0.85,
      normalizedInput: normalizedData,
      calculation: {
        marketPrice: representative.analysis
          ? `ราคาตัวแทน (low-but-fair) จาก web_search ${representative.sourceCounts.web} รายการ${representative.sourceCounts.serpapi > 0 ? ` + SerpAPI ${representative.sourceCounts.serpapi} รายการ` : ''}${representative.usedWeights ? ' | ให้น้ำหนักตลาดไทย' : ''}`
          : 'ราคาตัวแทนจากข้อมูลตลาดไม่เพียงพอ',
        pawnPrice: `ราคาจำนำ = ${marketPrice.toLocaleString()} × 0.6 = ${pawnPrice.toLocaleString()} บาท`,
        finalPrice: `ราคาประเมิน = ${pawnPrice.toLocaleString()} × สภาพ ${(normalizedCondition * 100).toFixed(0)}% = ${finalPrice.toLocaleString()} บาท`,
      },
    });

  } catch (error: any) {
    console.error('Error in AI estimation:', error);
    return NextResponse.json(
      { error: 'Failed to estimate price' },
      { status: 500 }
    );
  }
}
